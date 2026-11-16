use crate::config::AppConfig;
use crate::gdrive::GDriveClient;
use crate::github::GitHubClient;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub original_path: String,
    pub file_name: String,
    pub target_filename: String,
    pub version: u32,
    pub is_milestone: bool,
    pub milestone_note: Option<String>,
    pub changelog: String,
    pub created_at: String,
    pub upload_github: bool,
    pub upload_gdrive: bool,
    pub retry_count: u32,
}

pub struct QueueManager;

impl QueueManager {
    pub fn queue_dir() -> PathBuf {
        AppConfig::get_queue_dir()
    }

    /// Cek apakah koneksi internet aktif dengan ping cepat
    pub async fn check_internet() -> bool {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap_or_default();

        let test_urls = [
            "https://www.google.com",
            "https://api.github.com",
            "https://1.1.1.1",
        ];

        for url in test_urls {
            if let Ok(resp) = client.head(url).send().await {
                if resp.status().is_success() || resp.status().is_redirection() {
                    return true;
                }
            }
        }
        false
    }

    /// Simpan file ke folder offline queue
    pub fn enqueue(
        original_path: &str,
        file_name: &str,
        target_filename: &str,
        version: u32,
        is_milestone: bool,
        milestone_note: Option<&str>,
        changelog: &str,
        upload_github: bool,
        upload_gdrive: bool,
        file_bytes: &[u8],
    ) -> Result<QueueItem, String> {
        let id = Uuid::new_v4().to_string();
        let queue_dir = Self::queue_dir();

        let docx_path = queue_dir.join(format!("{}.docx", id));
        let meta_path = queue_dir.join(format!("{}.json", id));

        fs::write(&docx_path, file_bytes)
            .map_err(|e| format!("Gagal menyimpan salinan file ke antrean: {}", e))?;

        let item = QueueItem {
            id: id.clone(),
            original_path: original_path.to_string(),
            file_name: file_name.to_string(),
            target_filename: target_filename.to_string(),
            version,
            is_milestone,
            milestone_note: milestone_note.map(|s| s.to_string()),
            changelog: changelog.to_string(),
            created_at: Local::now().to_rfc3339(),
            upload_github,
            upload_gdrive,
            retry_count: 0,
        };

        let meta_json = serde_json::to_string_pretty(&item)
            .map_err(|e| format!("Gagal serialize metadata antrean: {}", e))?;
        fs::write(&meta_path, meta_json)
            .map_err(|e| format!("Gagal menulis metadata antrean: {}", e))?;

        Ok(item)
    }

    /// Ambil seluruh item antrean saat ini (FIFO berdasarkan created_at)
    pub fn list_queue() -> Vec<QueueItem> {
        let queue_dir = Self::queue_dir();
        let mut items = Vec::new();

        if let Ok(entries) = fs::read_dir(queue_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(item) = serde_json::from_str::<QueueItem>(&content) {
                            items.push(item);
                        }
                    }
                }
            }
        }

        items.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        items
    }

    /// Hapus item dari antrean setelah berhasil diunggah
    pub fn remove_item(id: &str) -> Result<(), String> {
        let queue_dir = Self::queue_dir();
        let docx_path = queue_dir.join(format!("{}.docx", id));
        let meta_path = queue_dir.join(format!("{}.json", id));

        let _ = fs::remove_file(docx_path);
        let _ = fs::remove_file(meta_path);
        Ok(())
    }

    /// Proses antrean offline dan kirim ke cloud
    pub async fn process_queue(config: &mut AppConfig) -> usize {
        let is_online = Self::check_internet().await;
        if !is_online {
            return 0;
        }

        let items = Self::list_queue();
        let mut processed_count = 0;
        let queue_dir = Self::queue_dir();

        for mut item in items {
            let docx_path = queue_dir.join(format!("{}.docx", item.id));
            if !docx_path.exists() {
                let _ = Self::remove_item(&item.id);
                continue;
            }

            let file_bytes = match fs::read(&docx_path) {
                Ok(b) => b,
                Err(_) => {
                    let _ = Self::remove_item(&item.id);
                    continue;
                }
            };

            let subfolder = config.get_subfolder_prefix();
            let mut upload_success = true;
            let mut error_messages = Vec::new();

            // Upload ke GitHub jika diaktifkan
            if item.upload_github && config.github.enabled {
                let github_path = if !subfolder.is_empty() {
                    format!("{}/{}/{}", config.github.path_prefix, subfolder, item.target_filename)
                } else if !config.github.path_prefix.is_empty() {
                    format!("{}/{}", config.github.path_prefix, item.target_filename)
                } else {
                    item.target_filename.clone()
                };

                let gh_client = GitHubClient::new(
                    config.github.token.clone(),
                    config.github.owner.clone(),
                    config.github.repo.clone(),
                    config.github.branch.clone(),
                );

                match gh_client.upload_file(&github_path, &file_bytes, &item.changelog).await {
                    Ok(_) => {
                        let _ = gh_client.apply_retention(&config.github.path_prefix, config.retention_limit).await;
                    }
                    Err(e) => {
                        upload_success = false;
                        error_messages.push(format!("GitHub: {}", e));
                    }
                }
            }

            // Upload ke Google Drive jika diaktifkan
            if item.upload_gdrive && config.gdrive.enabled {
                let mut gd_client = GDriveClient::new(
                    config.gdrive.client_id.clone(),
                    config.gdrive.client_secret.clone(),
                    config.gdrive.refresh_token.clone(),
                    config.gdrive.access_token.clone(),
                );

                let folder_id = if !config.gdrive.folder_id.trim().is_empty() {
                    Some(config.gdrive.folder_id.as_str())
                } else {
                    None
                };

                match gd_client.upload_file(&item.target_filename, &file_bytes, &item.changelog, folder_id).await {
                    Ok(_) => {
                        let _ = gd_client.apply_retention(folder_id, config.retention_limit).await;
                        // Perbarui token jika ada refresh
                        config.gdrive.access_token = gd_client.access_token;
                    }
                    Err(e) => {
                        upload_success = false;
                        error_messages.push(format!("Google Drive: {}", e));
                    }
                }
            }

            if upload_success {
                let _ = Self::remove_item(&item.id);
                processed_count += 1;

                // Catat aktivitas berhasil
                config.add_activity(crate::config::ActivityLog {
                    id: Uuid::new_v4().to_string(),
                    timestamp: Local::now().to_rfc3339(),
                    file_name: item.file_name,
                    version: item.version,
                    is_milestone: item.is_milestone,
                    changelog: format!("(Sync Offline) {}", item.changelog),
                    target_clouds: vec![
                        if item.upload_github { "GitHub" } else { "" }.to_string(),
                        if item.upload_gdrive { "Google Drive" } else { "" }.to_string(),
                    ]
                    .into_iter()
                    .filter(|s| !s.is_empty())
                    .collect(),
                    status: "success".to_string(),
                    error_message: None,
                });
            } else {
                item.retry_count += 1;
                let meta_path = queue_dir.join(format!("{}.json", item.id));
                let _ = fs::write(meta_path, serde_json::to_string_pretty(&item).unwrap_or_default());
            }
        }

        if processed_count > 0 {
            let _ = config.save();
        }

        processed_count
    }
}
