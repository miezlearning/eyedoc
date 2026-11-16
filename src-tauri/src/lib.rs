mod config;
mod docx_parser;
mod gdrive;
mod github;
mod queue;
mod watcher;

use config::AppConfig;
use gdrive::{GDriveClient, OAuthTokenResponse};
use github::GitHubClient;
use queue::{QueueItem, QueueManager};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use watcher::WatcherService;

pub struct AppState {
    pub watcher: Arc<WatcherService>,
    pub config: Mutex<AppConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub is_paused: bool,
    pub is_online: bool,
    pub watched_folder: Option<String>,
    pub queue_count: usize,
    pub github_configured: bool,
    pub gdrive_configured: bool,
    pub total_synced_files: usize,
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> AppConfig {
    let mut conf = state.config.lock().unwrap();
    *conf = AppConfig::load();
    conf.clone()
}

#[tauri::command]
fn save_config(new_config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    new_config.save()?;
    let mut conf = state.config.lock().unwrap();
    *conf = new_config.clone();

    // Perbarui watcher
    state.watcher.set_paused(new_config.is_paused);
    let folder_path = new_config.watch_folder.map(PathBuf::from);
    state.watcher.update_watch_folder(folder_path);

    Ok(())
}

#[tauri::command]
fn toggle_pause(paused: bool, state: State<'_, AppState>) -> Result<bool, String> {
    state.watcher.set_paused(paused);
    let mut conf = state.config.lock().unwrap();
    conf.is_paused = paused;
    let _ = conf.save();
    Ok(paused)
}

#[tauri::command]
async fn test_github_connection(state: State<'_, AppState>) -> Result<String, String> {
    let (token, owner, repo, branch) = {
        let conf = state.config.lock().unwrap();
        (
            conf.github.token.clone(),
            conf.github.owner.clone(),
            conf.github.repo.clone(),
            conf.github.branch.clone(),
        )
    };

    if token.is_empty() || owner.is_empty() || repo.is_empty() {
        return Err("Konfigurasi GitHub belum lengkap (Token, Owner, Repo wajib diisi)".to_string());
    }

    let client = GitHubClient::new(token, owner, repo, branch);
    client.test_connection().await
}

#[tauri::command]
async fn start_gdrive_oauth(
    client_id: String,
    client_secret: String,
    state: State<'_, AppState>,
) -> Result<OAuthTokenResponse, String> {
    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Client ID dan Client Secret Google Cloud tidak boleh kosong".to_string());
    }

    let token_resp = GDriveClient::start_oauth_flow(&client_id, &client_secret).await?;

    {
        let mut conf = state.config.lock().unwrap();
        conf.gdrive.client_id = client_id;
        conf.gdrive.client_secret = client_secret;
        conf.gdrive.access_token = token_resp.access_token.clone();
        if let Some(ref rt) = token_resp.refresh_token {
            conf.gdrive.refresh_token = rt.clone();
        }
        conf.gdrive.enabled = true;
        let _ = conf.save();
    }

    Ok(token_resp)
}

#[tauri::command]
async fn save_milestone(
    file_path: String,
    note: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File dokumen tidak ditemukan".to_string());
    }

    WatcherService::process_file_change(path, app_handle, true, Some(note)).await;
    Ok("Milestone berhasil disimpan dan disinkronkan!".to_string())
}

#[tauri::command]
async fn trigger_manual_sync(
    file_path: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let target = if let Some(fp) = file_path {
        PathBuf::from(fp)
    } else {
        let watch_folder = {
            let conf = state.config.lock().unwrap();
            conf.watch_folder.clone()
        };
        if let Some(wf) = watch_folder {
            PathBuf::from(wf)
        } else {
            return Err("Folder pemantauan belum dipilih".to_string());
        }
    };

    if target.is_file() {
        WatcherService::process_file_change(target, app_handle, false, None).await;
        Ok("File berhasil disinkronkan".to_string())
    } else if target.is_dir() {
        let mut count = 0;
        if let Ok(entries) = std::fs::read_dir(&target) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|s| s.to_str()) == Some("docx") {
                    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if !name.starts_with("~$") && !name.contains("[MILESTONE") {
                        WatcherService::process_file_change(p, app_handle.clone(), false, None).await;
                        count += 1;
                    }
                }
            }
        }
        Ok(format!("{} dokumen berhasil diproses untuk sinkronisasi", count))
    } else {
        Err("Path target tidak valid".to_string())
    }
}

#[tauri::command]
fn get_queue() -> Vec<QueueItem> {
    QueueManager::list_queue()
}

#[tauri::command]
fn clear_queue_item(id: String) -> Result<(), String> {
    QueueManager::remove_item(&id)
}

#[tauri::command]
async fn process_queue_now() -> Result<usize, String> {
    let mut conf = AppConfig::load();
    let processed = QueueManager::process_queue(&mut conf).await;
    Ok(processed)
}

#[tauri::command]
async fn get_system_status(state: State<'_, AppState>) -> Result<SystemStatus, String> {
    let is_online = QueueManager::check_internet().await;
    let (is_paused, watched_folder, github_configured, gdrive_configured, total_synced_files) = {
        let conf = state.config.lock().unwrap();
        (
            state.watcher.is_paused(),
            conf.watch_folder.clone(),
            conf.github.enabled && !conf.github.token.is_empty(),
            conf.gdrive.enabled
                && (!conf.gdrive.refresh_token.is_empty() || !conf.gdrive.access_token.is_empty()),
            conf.file_states.len(),
        )
    };
    let queue_items = QueueManager::list_queue();

    Ok(SystemStatus {
        is_paused,
        is_online,
        watched_folder,
        queue_count: queue_items.len(),
        github_configured,
        gdrive_configured,
        total_synced_files,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::load();
    let watcher = Arc::new(WatcherService::new());
    watcher.set_paused(config.is_paused);
    if let Some(ref folder) = config.watch_folder {
        watcher.update_watch_folder(Some(PathBuf::from(folder)));
    }

    let state = AppState {
        watcher: watcher.clone(),
        config: Mutex::new(config),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .manage(state)
        .setup(|app| {
            let handle = app.handle().clone();

            // Setup System Tray
            let title_item = MenuItem::with_id(app, "title", "EyeDoc - Word Cloud Sync", false, None::<&str>)?;
            let open_item = MenuItem::with_id(app, "open", "Buka Dashboard", true, None::<&str>)?;
            let milestone_item = MenuItem::with_id(app, "milestone", "Simpan Milestone Cepat", true, None::<&str>)?;
            let pause_item = MenuItem::with_id(app, "pause", "Pause / Lanjutkan Pemantauan", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &title_item,
                    &open_item,
                    &milestone_item,
                    &pause_item,
                    &quit_item,
                ],
            )?;

            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("EyeDoc - Word Cloud Auto-Sync")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "milestone" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.emit("open_milestone_modal", ());
                        }
                    }
                    "pause" => {
                        let state = app.state::<AppState>();
                        let current = state.watcher.is_paused();
                        let new_state = !current;
                        state.watcher.set_paused(new_state);
                        let mut conf = state.config.lock().unwrap();
                        conf.is_paused = new_state;
                        let _ = conf.save();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            let _ = tray.set_visible(true);

            // Jalankan file watcher
            let watcher_service = app.state::<AppState>().watcher.clone();
            watcher_service.start(handle.clone());

            // Background worker: cek antrean offline setiap 15 detik
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(15)).await;
                    let mut conf = AppConfig::load();
                    let _ = QueueManager::process_queue(&mut conf).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            toggle_pause,
            test_github_connection,
            start_gdrive_oauth,
            save_milestone,
            trigger_manual_sync,
            get_queue,
            clear_queue_item,
            process_queue_now,
            get_system_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running eyedoc");
}
