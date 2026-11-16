use crate::config::{ActivityLog, AppConfig};
use crate::docx_parser::{analyze_docx, generate_changelog, DocxSnapshot};
use crate::gdrive::GDriveClient;
use crate::github::GitHubClient;
use crate::queue::QueueManager;
use chrono::Local;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Menjamin hanya satu proses file yang berjalan, supaya event watcher dan
/// pemindaian berkala tidak membuat versi ganda untuk perubahan yang sama.
static PROCESS_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub struct WatcherService {
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    watch_folder: Arc<Mutex<Option<PathBuf>>>,
    recent_events: Arc<Mutex<HashMap<PathBuf, Instant>>>,
}

impl WatcherService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            is_paused: Arc::new(AtomicBool::new(false)),
            watch_folder: Arc::new(Mutex::new(None)),
            recent_events: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_paused(&self, paused: bool) {
        self.is_paused.store(paused, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::SeqCst)
    }

    pub fn update_watch_folder(&self, folder: Option<PathBuf>) {
        let mut guard = self.watch_folder.lock().unwrap();
        *guard = folder;
    }

    /// Jalankan thread file watcher utama
    pub fn start(&self, app_handle: AppHandle) {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return; // Sudah berjalan
        }

        let is_running = self.is_running.clone();
        let is_paused = self.is_paused.clone();
        let watch_folder_mutex = self.watch_folder.clone();
        let recent_events_mutex = self.recent_events.clone();

        std::thread::spawn(move || {
            let (tx, rx) = std::sync::mpsc::channel();

            let mut watcher: Option<RecommendedWatcher> = None;
            let mut current_watched_path: Option<PathBuf> = None;

            while is_running.load(Ordering::SeqCst) {
                // Periksa apakah folder pantauan berubah
                let target_folder = {
                    let guard = watch_folder_mutex.lock().unwrap();
                    guard.clone()
                };

                if target_folder != current_watched_path {
                    if let Some(ref old_path) = current_watched_path {
                        if let Some(ref mut w) = watcher {
                            let _ = w.unwatch(old_path);
                        }
                    }

                    if let Some(ref new_path) = target_folder {
                        if new_path.exists() && new_path.is_dir() {
                            let tx_clone = tx.clone();
                            let mut new_watcher = RecommendedWatcher::new(
                                move |res: Result<Event, notify::Error>| {
                                    if let Ok(event) = res {
                                        let _ = tx_clone.send(event);
                                    }
                                },
                                Config::default(),
                            );

                            if let Ok(ref mut w) = new_watcher {
                                let _ = w.watch(new_path, RecursiveMode::Recursive);
                                watcher = Some(new_watcher.unwrap());
                                current_watched_path = Some(new_path.clone());
                            }
                        } else {
                            watcher = None;
                            current_watched_path = None;
                        }
                    } else {
                        watcher = None;
                        current_watched_path = None;
                    }
                }

                // Proses event dengan non-blocking timeout
                while let Ok(event) = rx.recv_timeout(Duration::from_millis(500)) {
                    if is_paused.load(Ordering::SeqCst) {
                        continue;
                    }

                    // Hanya proses event create atau modify
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {}
                        _ => continue,
                    }

                    for path in event.paths {
                        // 1. Filter ekstensi .docx
                        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                        if !ext.eq_ignore_ascii_case("docx") {
                            continue;
                        }

                        // 2. Abaikan file temporary Word (~$...) dan file backup buatan sendiri
                        let file_name = path
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string();

                        let is_backup_dir = path.components().any(|c| {
                            let s = c.as_os_str().to_string_lossy();
                            s.eq_ignore_ascii_case("Backups") || s.eq_ignore_ascii_case(".eyedoc")
                        });

                        if is_backup_dir
                            || file_name.starts_with("~$")
                            || file_name.starts_with(".~")
                            || file_name.contains("[MILESTONE")
                            || file_name.ends_with(".tmp")
                        {
                            continue;
                        }

                        // 3. Trailing debounce. Word memicu beberapa event untuk satu kali save.
                        //    Catat waktu event terakhir, lalu proses hanya jika tidak ada event baru.
                        let scheduled_at = Instant::now();
                        {
                            let mut recent = recent_events_mutex.lock().unwrap();
                            recent.insert(path.clone(), scheduled_at);
                        }

                        let app_clone = app_handle.clone();
                        let target_file_path = path.clone();
                        let recent_for_task = recent_events_mutex.clone();
                        tokio::spawn(async move {
                            tokio::time::sleep(Duration::from_millis(1800)).await;
                            let latest = {
                                let recent = recent_for_task.lock().unwrap();
                                recent.get(&target_file_path).copied()
                            };
                            if latest != Some(scheduled_at) {
                                return;
                            }
                            Self::process_file_change(target_file_path, app_clone, false, None).await;
                        });
                    }
                }
            }
        });
    }

    /// Proses perubahan file .docx dan jalankan sync ke cloud
    pub async fn process_file_change(
        file_path: PathBuf,
        app_handle: AppHandle,
        is_milestone: bool,
        milestone_note: Option<String>,
    ) {
        let _guard = PROCESS_LOCK.lock().await;

        let file_name = match file_path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => return,
        };

        // Retry membaca file hingga 5x dengan jeda 300ms jika masih ada lock dari MS Word
        let mut file_bytes_opt = None;
        for _ in 0..5 {
            if let Ok(bytes) = fs::read(&file_path) {
                file_bytes_opt = Some(bytes);
                break;
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }

        let file_bytes = match file_bytes_opt {
            Some(b) => b,
            None => {
                eprintln!("Gagal membaca file {}", file_name);
                return;
            }
        };

        let mut config = AppConfig::load();

        if !is_milestone && !config.auto_sync_on_save {
            // Auto sync saat Ctrl+S dinonaktifkan oleh pengguna
            return;
        }

        // Cek hash untuk menghindari upload jika konten tidak berubah sama sekali (kecuali milestone)
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&file_bytes);
        let current_hash = format!("{:x}", hasher.finalize());

        let file_key = file_path.to_string_lossy().to_string();
        let prev_state = config.file_states.get(&file_key).cloned();

        if !is_milestone {
            if let Some(ref st) = prev_state {
                if st.last_hash == current_hash {
                    // Konten persis sama, lewati upload
                    return;
                }
            }
        }

        // Analisis dokumen XML
        let analysis = analyze_docx(&file_path).unwrap_or(crate::docx_parser::DocxAnalysis {
            word_count: 0,
            last_heading: "Dokumen Utama".to_string(),
            headings: Vec::new(),
            image_count: 0,
            sections: Vec::new(),
        });

        let next_version = if is_milestone {
            prev_state.as_ref().map(|s| s.version).unwrap_or(1)
        } else {
            config.get_next_version(&file_key)
        };

        let prev_snapshot = prev_state.as_ref().map(|s| DocxSnapshot {
            word_count: s.word_count,
            image_count: s.image_count,
            headings: s.headings.clone(),
            sections: s.sections.clone(),
        });
        let changelog = generate_changelog(
            next_version,
            prev_snapshot.as_ref(),
            &analysis,
            is_milestone,
            milestone_note.as_deref(),
        );

        let target_filename = config.format_filename(
            &file_name,
            next_version,
            is_milestone,
            milestone_note.as_deref(),
        );

        // 1. Simpan salinan file versi secara lokal (100% Offline-First)
        let parent_dir = file_path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let subfolder = config.get_subfolder_prefix();
        let local_backup_dir = if !subfolder.is_empty() {
            parent_dir.join("Backups").join(&subfolder)
        } else {
            parent_dir.join("Backups")
        };

        let _ = fs::create_dir_all(&local_backup_dir);
        let local_backup_file = local_backup_dir.join(&target_filename);
        let _ = fs::write(&local_backup_file, &file_bytes);

        // Terapkan retensi lokal di folder Backups
        Self::apply_local_retention(&local_backup_dir, config.retention_limit);

        let is_online = QueueManager::check_internet().await;
        let mut target_clouds = Vec::new();
        let mut overall_success = true;
        let mut error_msg = None;

        if is_online {
            let subfolder = config.get_subfolder_prefix();

            // 1. GitHub Upload
            if config.github.enabled && !config.github.token.is_empty() {
                target_clouds.push("GitHub".to_string());
                let gh_path = if !subfolder.is_empty() {
                    format!("{}/{}/{}", config.github.path_prefix, subfolder, target_filename)
                } else if !config.github.path_prefix.is_empty() {
                    format!("{}/{}", config.github.path_prefix, target_filename)
                } else {
                    target_filename.clone()
                };

                let gh_client = GitHubClient::new(
                    config.github.token.clone(),
                    config.github.owner.clone(),
                    config.github.repo.clone(),
                    config.github.branch.clone(),
                );

                match gh_client.upload_file(&gh_path, &file_bytes, &changelog).await {
                    Ok(_) => {
                        let _ = gh_client.apply_retention(&config.github.path_prefix, config.retention_limit).await;
                    }
                    Err(e) => {
                        overall_success = false;
                        error_msg = Some(format!("GitHub error: {}", e));
                    }
                }
            }

            // 2. Google Drive Upload
            if config.gdrive.enabled && (!config.gdrive.refresh_token.is_empty() || !config.gdrive.access_token.is_empty()) {
                target_clouds.push("Google Drive".to_string());
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

                match gd_client.upload_file(&target_filename, &file_bytes, &changelog, folder_id).await {
                    Ok(_) => {
                        let _ = gd_client.apply_retention(folder_id, config.retention_limit).await;
                        config.gdrive.access_token = gd_client.access_token;
                    }
                    Err(e) => {
                        overall_success = false;
                        let prev_err = error_msg.unwrap_or_default();
                        error_msg = Some(format!("{} | GDrive error: {}", prev_err, e));
                    }
                }
            }
        } else {
            // Mode offline: masukkan ke antrean cloud jika cloud diaktifkan
            let upload_github = config.github.enabled;
            let upload_gdrive = config.gdrive.enabled;

            if upload_github || upload_gdrive {
                let _ = QueueManager::enqueue(
                    &file_key,
                    &file_name,
                    &target_filename,
                    next_version,
                    is_milestone,
                    milestone_note.as_deref(),
                    &changelog,
                    upload_github,
                    upload_gdrive,
                    &file_bytes,
                );

                if upload_github {
                    target_clouds.push("GitHub (Antrean)".to_string());
                }
                if upload_gdrive {
                    target_clouds.push("GDrive (Antrean)".to_string());
                }
            }
        }

        // Perbarui state tracking file
        config.update_file_state(&file_key, next_version, &current_hash, &analysis);

        let status = if !target_clouds.is_empty() && overall_success {
            "success".to_string()
        } else if !target_clouds.is_empty() && !is_online {
            "queued".to_string()
        } else if target_clouds.is_empty() {
            "local_only".to_string()
        } else {
            "failed".to_string()
        };

        let activity = ActivityLog {
            id: Uuid::new_v4().to_string(),
            timestamp: Local::now().to_rfc3339(),
            file_name: file_name.clone(),
            version: next_version,
            is_milestone,
            changelog: changelog.clone(),
            target_clouds,
            status,
            error_message: error_msg.clone(),
        };

        config.add_activity(activity.clone());
        let _ = config.save();

        // Kirim event update ke frontend
        let _ = app_handle.emit("sync_event", &activity);
    }

    /// Terapkan kebijakan retensi pembersihan file cadangan lokal
    pub fn apply_local_retention(backup_dir: &std::path::Path, limit: usize) {
        if limit == 0 || !backup_dir.exists() {
            return;
        }

        let mut regular_files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
        if let Ok(entries) = fs::read_dir(backup_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file()
                    && p.extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.eq_ignore_ascii_case("docx"))
                        .unwrap_or(false)
                {
                    let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if !fname.contains("[MILESTONE") {
                        if let Ok(meta) = p.metadata() {
                            let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                            regular_files.push((p, modified));
                        }
                    }
                }
            }
        }

        if regular_files.len() > limit {
            regular_files.sort_by_key(|(_, time)| *time);
            let to_remove = regular_files.len() - limit;
            for (file_to_del, _) in regular_files.into_iter().take(to_remove) {
                let _ = fs::remove_file(file_to_del);
            }
        }
    }
}
