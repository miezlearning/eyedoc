use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConfig {
    pub enabled: bool,
    pub token: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub path_prefix: String,
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            token: String::new(),
            owner: String::new(),
            repo: String::new(),
            branch: "main".to_string(),
            path_prefix: "backups".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDriveConfig {
    pub enabled: bool,
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub access_token: String,
    pub folder_id: String,
    pub folder_name: String,
}

impl Default for GDriveConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            client_id: String::new(),
            client_secret: String::new(),
            refresh_token: String::new(),
            access_token: String::new(),
            folder_id: String::new(),
            folder_name: "Word Backups".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTrackingState {
    pub version: u32,
    pub word_count: usize,
    pub last_heading: String,
    pub last_sync: String,
    pub last_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLog {
    pub id: String,
    pub timestamp: String,
    pub file_name: String,
    pub version: u32,
    pub is_milestone: bool,
    pub changelog: String,
    pub target_clouds: Vec<String>,
    pub status: String, // "success", "failed", "queued"
    pub error_message: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub last_modified: String,
    pub word_count: usize,
    pub last_heading: String,
    pub tracked_version: u32,
    pub last_synced: Option<String>,
    pub is_synced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub watch_folder: Option<String>,
    pub is_paused: bool,
    pub naming_pattern: String,
    pub auto_month_folder: bool,
    pub retention_limit: usize,
    pub notifications_enabled: bool,
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub auto_sync_on_save: bool,
    #[serde(default)]
    pub auto_sync_interval_mins: u32,
    #[serde(default = "default_true")]
    pub auto_sync_on_select: bool,
    pub github: GitHubConfig,
    pub gdrive: GDriveConfig,
    pub file_states: HashMap<String, FileTrackingState>,
    pub recent_activities: Vec<ActivityLog>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            watch_folder: None,
            is_paused: false,
            naming_pattern: "{name}_v{version:02}_{date}_{time}.docx".to_string(),
            auto_month_folder: true,
            retention_limit: 25,
            notifications_enabled: true,
            autostart: false,
            auto_sync_on_save: true,
            auto_sync_interval_mins: 0,
            auto_sync_on_select: true,
            github: GitHubConfig::default(),
            gdrive: GDriveConfig::default(),
            file_states: HashMap::new(),
            recent_activities: Vec::new(),
        }
    }
}

impl AppConfig {
    pub fn get_app_dir() -> PathBuf {
        let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        let app_dir = base.join("eyedoc");
        if !app_dir.exists() {
            let _ = fs::create_dir_all(&app_dir);
        }
        app_dir
    }

    pub fn get_queue_dir() -> PathBuf {
        let queue_dir = Self::get_app_dir().join("queue");
        if !queue_dir.exists() {
            let _ = fs::create_dir_all(&queue_dir);
        }
        queue_dir
    }

    pub fn get_config_path() -> PathBuf {
        Self::get_app_dir().join("config.json")
    }

    pub fn load() -> Self {
        let path = Self::get_config_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                    return config;
                }
            }
        }
        let config = AppConfig::default();
        let _ = config.save();
        config
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::get_config_path();
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Gagal serialize config: {}", e))?;
        fs::write(path, content).map_err(|e| format!("Gagal menulis config: {}", e))?;
        Ok(())
    }

    pub fn get_next_version(&mut self, file_key: &str) -> u32 {
        if let Some(state) = self.file_states.get(file_key) {
            state.version + 1
        } else {
            1
        }
    }

    pub fn update_file_state(
        &mut self,
        file_key: &str,
        version: u32,
        word_count: usize,
        last_heading: &str,
        hash: &str,
    ) {
        let state = FileTrackingState {
            version,
            word_count,
            last_heading: last_heading.to_string(),
            last_sync: Local::now().to_rfc3339(),
            last_hash: hash.to_string(),
        };
        self.file_states.insert(file_key.to_string(), state);
    }

    pub fn add_activity(&mut self, activity: ActivityLog) {
        self.recent_activities.insert(0, activity);
        if self.recent_activities.len() > 100 {
            self.recent_activities.truncate(100);
        }
    }

    /// Format nama file sesuai pattern
    pub fn format_filename(
        &self,
        original_name: &str,
        version: u32,
        is_milestone: bool,
        milestone_note: Option<&str>,
    ) -> String {
        let stem = Path::new(original_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(original_name);

        let now = Local::now();
        let date_str = now.format("%d%b%Y").to_string(); // e.g. 16Nov2026
        let time_str = now.format("%H%M").to_string();   // e.g. 1845
        let version_str = format!("{:02}", version);

        if is_milestone {
            let note = milestone_note.unwrap_or("ACC").replace(' ', "_");
            return format!("{}_v{}_[MILESTONE_{}].docx", stem, version_str, note);
        }

        // Default: {name}_v{version:02}_{date}_{time}.docx
        let formatted = self
            .naming_pattern
            .replace("{name}", stem)
            .replace("{NamaFile}", stem)
            .replace("{version:02}", &version_str)
            .replace("{Versi:02}", &version_str)
            .replace("{version}", &version.to_string())
            .replace("{Versi}", &version.to_string())
            .replace("{date}", &date_str)
            .replace("{DDMMMYYYY}", &date_str)
            .replace("{time}", &time_str)
            .replace("{HHmm}", &time_str);

        if !formatted.ends_with(".docx") {
            format!("{}.docx", formatted)
        } else {
            formatted
        }
    }

    /// Format subfolder bulan/tahun jika diaktifkan (misal "Nov_2026")
    pub fn get_subfolder_prefix(&self) -> String {
        if self.auto_month_folder {
            let now = Local::now();
            now.format("%b_%Y").to_string()
        } else {
            String::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_filename_regular() {
        let config = AppConfig::default();
        let fname = config.format_filename("Skripsi_Bab1.docx", 3, false, None);
        assert!(fname.starts_with("Skripsi_Bab1_v03_"));
        assert!(fname.ends_with(".docx"));
    }

    #[test]
    fn test_format_filename_milestone() {
        let config = AppConfig::default();
        let fname = config.format_filename("Skripsi_Bab1.docx", 5, true, Some("ACC Dosen"));
        assert_eq!(fname, "Skripsi_Bab1_v05_[MILESTONE_ACC_Dosen].docx");
    }

    #[test]
    fn test_file_state_tracking() {
        let mut config = AppConfig::default();
        assert_eq!(config.get_next_version("doc1"), 1);
        config.update_file_state("doc1", 1, 500, "Bab 1", "hash123");
        assert_eq!(config.get_next_version("doc1"), 2);
    }
}
