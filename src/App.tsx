import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Folder,
  Eye,
  Pause,
  Play,
  RotateCw,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  ListOrdered,
  Layers,
  Cloud,
  FileText,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  FileCheck
} from "lucide-react";
import "./App.css";

const GithubIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface GitHubConfig {
  enabled: boolean;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path_prefix: string;
}

interface GDriveConfig {
  enabled: boolean;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token: string;
  folder_id: string;
  folder_name: string;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  file_name: string;
  version: number;
  is_milestone: boolean;
  changelog: string;
  target_clouds: string[];
  status: "success" | "failed" | "queued" | string;
  error_message?: string;
}

interface QueueItem {
  id: string;
  original_path: string;
  file_name: string;
  target_filename: string;
  version: number;
  is_milestone: boolean;
  milestone_note?: string;
  changelog: string;
  created_at: string;
  upload_github: boolean;
  upload_gdrive: boolean;
  retry_count: number;
}

export interface FolderFileInfo {
  path: string;
  name: string;
  size: number;
  last_modified: string;
  word_count: number;
  last_heading: string;
  tracked_version: number;
  last_synced?: string;
  is_synced: boolean;
}

interface AppConfig {
  watch_folder: string | null;
  is_paused: boolean;
  naming_pattern: string;
  auto_month_folder: boolean;
  retention_limit: number;
  notifications_enabled: boolean;
  autostart: boolean;
  auto_sync_on_save: boolean;
  auto_sync_interval_mins: number;
  auto_sync_on_select: boolean;
  github: GitHubConfig;
  gdrive: GDriveConfig;
  recent_activities: ActivityLog[];
}

interface SystemStatus {
  is_paused: boolean;
  is_online: boolean;
  watched_folder: string | null;
  queue_count: number;
  github_configured: boolean;
  gdrive_configured: boolean;
  total_synced_files: number;
}

export function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "queue" | "milestones" | "settings">("dashboard");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus>({
    is_paused: false,
    is_online: true,
    watched_folder: null,
    queue_count: 0,
    github_configured: false,
    gdrive_configured: false,
    total_synced_files: 0,
  });

  const [watchedFiles, setWatchedFiles] = useState<FolderFileInfo[]>([]);
  const [syncingFile, setSyncingFile] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Milestone Modal State
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [milestoneFile, setMilestoneFile] = useState("");
  const [milestoneNote, setMilestoneNote] = useState("ACC Dosen Pembimbing");

  // GitHub Test State
  const [testingGithub, setTestingGithub] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<string | null>(null);

  // Google OAuth State
  const [connectingGDrive, setConnectingGDrive] = useState(false);

  // Load initial data
  useEffect(() => {
    loadConfig();
    refreshStatus();
    loadQueue();
    loadWatchedFiles();

    const interval = setInterval(() => {
      refreshStatus();
      loadWatchedFiles();
    }, 4000);

    // Listen to sync events from background watcher
    const unlistenSyncPromise = listen<ActivityLog>("sync_event", (event) => {
      loadConfig();
      refreshStatus();
      loadQueue();
      loadWatchedFiles();
      showMessage(`File ${event.payload.file_name} tersinkronisasi: ${event.payload.changelog}`, "success");
    });

    const unlistenMilestonePromise = listen("open_milestone_modal", () => {
      setIsMilestoneModalOpen(true);
    });

    return () => {
      clearInterval(interval);
      unlistenSyncPromise.then((un) => un());
      unlistenMilestonePromise.then((un) => un());
    };
  }, []);

  const showMessage = (text: string, type: "success" | "error" | "info" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadConfig = async () => {
    try {
      const conf = await invoke<AppConfig>("get_config");
      setConfig(conf);
    } catch (e) {
      console.error("Gagal memuat config:", e);
    }
  };

  const loadWatchedFiles = async () => {
    try {
      const files = await invoke<FolderFileInfo[]>("get_watched_files");
      setWatchedFiles(files);
    } catch (e) {
      console.error("Gagal memuat file dokumen:", e);
    }
  };

  const refreshStatus = async () => {
    try {
      const sysStatus = await invoke<SystemStatus>("get_system_status");
      setStatus(sysStatus);
    } catch (e) {
      console.error("Gagal memuat status:", e);
    }
  };

  const loadQueue = async () => {
    try {
      const q = await invoke<QueueItem[]>("get_queue");
      setQueueItems(q);
    } catch (e) {
      console.error("Gagal memuat antrean:", e);
    }
  };

  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Pilih Folder Dokumen Word yang Ingin Dipantau",
      });

      if (selected && typeof selected === "string" && config) {
        const updated = { ...config, watch_folder: selected };
        await invoke("save_config", { newConfig: updated });
        setConfig(updated);
        refreshStatus();
        loadWatchedFiles();
        showMessage(`Folder kerja berhasil diubah ke: ${selected}`, "success");
      }
    } catch (e) {
      showMessage(`Gagal memilih folder: ${e}`, "error");
    }
  };

  const handleUpdateSyncConfig = async (updated: AppConfig) => {
    try {
      await invoke("save_config", { newConfig: updated });
      setConfig(updated);
      refreshStatus();
      loadWatchedFiles();
      showMessage("Pengaturan sinkronisasi diperbarui", "success");
    } catch (e) {
      showMessage(`Gagal menyimpan pengaturan: ${e}`, "error");
    }
  };

  const handleSyncSingleFile = async (filePath: string) => {
    setSyncingFile(filePath);
    try {
      const res = await invoke<string>("trigger_manual_sync", { filePath });
      showMessage(res, "success");
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Gagal sinkronisasi file: ${e}`, "error");
    } finally {
      setSyncingFile(null);
    }
  };

  const handleTogglePause = async () => {
    if (!config) return;
    try {
      const newPausedState = !status.is_paused;
      await invoke("toggle_pause", { paused: newPausedState });
      refreshStatus();
      showMessage(newPausedState ? "Pemantauan dokumen dijeda" : "Pemantauan dokumen aktif kembali", "info");
    } catch (e) {
      showMessage(`Gagal mengubah status pemantauan: ${e}`, "error");
    }
  };

  const handleManualSync = async () => {
    if (!config?.watch_folder) {
      showMessage("Pilih folder pantauan terlebih dahulu di Pengaturan", "error");
      return;
    }
    setIsSyncing(true);
    try {
      const res = await invoke<string>("trigger_manual_sync", { filePath: null });
      showMessage(res, "success");
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Gagal sinkronisasi: ${e}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await invoke("open_backup_folder");
    } catch (e) {
      showMessage(`Gagal membuka folder backup: ${e}`, "error");
    }
  };

  const handleOpenDocFile = async (filePath: string) => {
    try {
      await invoke("open_doc_file", { filePath });
    } catch (e) {
      showMessage(`Gagal membuka file: ${e}`, "error");
    }
  };

  const handleSaveMilestone = async () => {
    if (!milestoneNote.trim()) {
      showMessage("Catatan milestone tidak boleh kosong (contoh: ACC Bimbingan 1)", "error");
      return;
    }

    try {
      let targetFile = milestoneFile;
      if (!targetFile && config?.watch_folder) {
        // Jika tidak memilih spesifik, buka dialog pilih file docx
        const selected = await open({
          multiple: false,
          filters: [{ name: "Word Document", extensions: ["docx"] }],
          title: "Pilih Dokumen Word untuk Milestone Ini",
        });
        if (selected && typeof selected === "string") {
          targetFile = selected;
        } else {
          return;
        }
      }

      await invoke("save_milestone", { filePath: targetFile, note: milestoneNote });
      setIsMilestoneModalOpen(false);
      setMilestoneNote("ACC Dosen Pembimbing");
      setMilestoneFile("");
      showMessage("Milestone berhasil disimpan dan dikunci dari auto-retention!", "success");
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Gagal menyimpan milestone: ${e}`, "error");
    }
  };

  const handleTestGithub = async () => {
    if (!config) return;
    setTestingGithub(true);
    setGithubTestResult(null);
    try {
      const res = await invoke<string>("test_github_connection");
      setGithubTestResult(`Terkoneksi ke ${res}`);
      showMessage(`GitHub terhubung: ${res}`, "success");
    } catch (e) {
      setGithubTestResult(`Gagal: ${e}`);
      showMessage(`Koneksi GitHub gagal: ${e}`, "error");
    } finally {
      setTestingGithub(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!config?.gdrive.client_id || !config?.gdrive.client_secret) {
      showMessage("Isi Google Client ID dan Client Secret terlebih dahulu", "error");
      return;
    }

    setConnectingGDrive(true);
    try {
      showMessage("Membuka browser untuk otorisasi Google OAuth...", "info");
      await invoke("start_gdrive_oauth", {
        clientId: config.gdrive.client_id,
        clientSecret: config.gdrive.client_secret,
      });
      loadConfig();
      refreshStatus();
      showMessage("Google Drive berhasil terhubung!", "success");
    } catch (e) {
      showMessage(`Gagal menghubungkan Google Drive: ${e}`, "error");
    } finally {
      setConnectingGDrive(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      await invoke("save_config", { newConfig: config });
      showMessage("Pengaturan berhasil disimpan!", "success");
      refreshStatus();
    } catch (e) {
      showMessage(`Gagal menyimpan pengaturan: ${e}`, "error");
    }
  };

  const handleProcessQueueNow = async () => {
    try {
      const count = await invoke<number>("process_queue_now");
      showMessage(`Berhasil memproses ${count} dokumen dari antrean offline`, "success");
      loadQueue();
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Gagal memproses antrean: ${e}`, "error");
    }
  };

  const handleDeleteQueueItem = async (id: string) => {
    try {
      await invoke("clear_queue_item", { id });
      loadQueue();
      refreshStatus();
      showMessage("Item antrean dihapus", "info");
    } catch (e) {
      showMessage(`Gagal menghapus antrean: ${e}`, "error");
    }
  };

  // Preview penamaan
  const getPreviewFilename = () => {
    if (!config) return "";
    return config.naming_pattern
      .replace("{name}", "Skripsi_Bab1")
      .replace("{NamaFile}", "Skripsi_Bab1")
      .replace("{version:02}", "04")
      .replace("{Versi:02}", "04")
      .replace("{version}", "4")
      .replace("{Versi}", "4")
      .replace("{date}", "16Nov2026")
      .replace("{DDMMMYYYY}", "16Nov2026")
      .replace("{time}", "1845")
      .replace("{HHmm}", "1845");
  };

  const milestonesList = config?.recent_activities.filter((a) => a.is_milestone) || [];

  return (
    <div className="app-container">
      {/* Toast Message */}
      {message && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            padding: "12px 18px",
            borderRadius: "10px",
            backgroundColor:
              message.type === "success" ? "#065f46" : message.type === "error" ? "#7f1d1d" : "#1e293b",
            color: "white",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            zIndex: 1000,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {message.type === "success" && <CheckCircle2 size={16} />}
          {message.type === "error" && <AlertCircle size={16} />}
          {message.type === "info" && <Clock size={16} />}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", marginLeft: "10px" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Eye size={22} />
          </div>
          <div>
            <div className="brand-title">
              EyeDoc
              <span className="brand-badge">Auto-Sync v1.0</span>
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Word Cloud Auto-Sync & Versioning</div>
          </div>
        </div>

        <div className="header-status-group">
          {/* Status Watcher */}
          <div className={`status-pill ${status.is_paused ? "paused" : "watching"}`}>
            <span className="status-dot"></span>
            {status.is_paused ? "Pemantauan Dijeda" : "Pemantauan Aktif"}
          </div>

          {/* Status Cloud / Mode Lokal */}
          <div className={`status-pill ${status.github_configured || status.gdrive_configured ? (status.is_online ? "online" : "offline") : "paused"}`}>
            <span className="status-dot"></span>
            {status.github_configured || status.gdrive_configured
              ? (status.is_online ? "Cloud Terhubung" : `Antrean Cloud (${status.queue_count})`)
              : "Mode Offline (Lokal)"}
          </div>

          {/* Quick Pause Toggle */}
          <button
            onClick={handleTogglePause}
            className={`btn btn-sm ${status.is_paused ? "btn-warning" : "btn-outline"}`}
            title={status.is_paused ? "Lanjutkan Pemantauan" : "Jeda Pemantauan"}
          >
            {status.is_paused ? <Play size={14} /> : <Pause size={14} />}
            {status.is_paused ? "Lanjutkan" : "Pause"}
          </button>

          {/* Save Milestone Quick Button */}
          <button
            onClick={() => setIsMilestoneModalOpen(true)}
            className="btn btn-sm btn-warning"
            title="Tandai Milestone (ACC Dosen)"
          >
            <Award size={14} />
            Simpan Milestone
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          <Layers size={16} />
          Dashboard
        </button>

        <button
          className={`tab-btn ${activeTab === "queue" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("queue");
            loadQueue();
          }}
        >
          <ListOrdered size={16} />
          Antrean Offline
          {status.queue_count > 0 && <span className="tab-badge">{status.queue_count}</span>}
        </button>

        <button
          className={`tab-btn ${activeTab === "milestones" ? "active" : ""}`}
          onClick={() => setActiveTab("milestones")}
        >
          <Award size={16} />
          Milestone ({milestonesList.length})
        </button>

        <button
          className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={16} />
          Pengaturan
        </button>
      </nav>

      {/* Main Content Body */}
      <main className="app-content">
        {/* TAB 1: DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            {/* Hero Folder Banner */}
            <div className="folder-hero-card">
              <div className="folder-info">
                <div className="folder-icon-box">
                  <Folder size={26} />
                </div>
                <div>
                  <div className="folder-label">Folder Dokumen Dipantau (Offline-First)</div>
                  <div className="folder-path">
                    {status.watched_folder || "Belum ada folder yang dipilih"}
                  </div>
                </div>
              </div>
              <div className="folder-actions">
                <button onClick={handlePickFolder} className="btn btn-outline btn-sm">
                  <Folder size={14} />
                  Ganti Folder
                </button>
                <button
                  onClick={handleOpenBackupFolder}
                  className="btn btn-outline btn-sm"
                  disabled={!status.watched_folder}
                  title="Buka folder cadangan lokal (Backups) di Windows File Explorer"
                >
                  <Folder size={14} />
                  Buka Folder Backup
                </button>
                <button
                  onClick={handleManualSync}
                  className="btn btn-primary btn-sm"
                  disabled={isSyncing || !status.watched_folder}
                >
                  <RotateCw size={14} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? "Menyinkronkan..." : "Sync Sekarang"}
                </button>
              </div>
            </div>

            {/* Auto-Sync Quick Control Panel */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <RotateCw size={18} />
                  Opsi & Mode Sinkronisasi Otomatis
                </div>
                <span className={`status-pill ${config?.auto_sync_on_save ? "watching" : "paused"}`}>
                  <span className="status-dot"></span>
                  {config?.auto_sync_on_save ? "Auto-Sync Ctrl+S Aktif" : "Auto-Sync Nonaktif"}
                </span>
              </div>

              <div className="sync-options-row">
                {/* Mode 1: Auto Sync on Save */}
                <div className="sync-option-card">
                  <div className="sync-option-info">
                    <div className="sync-option-title">Otomatis saat Simpan (Ctrl + S)</div>
                    <div className="sync-option-sub">Mendeteksi penyimpanan dokumen Word & auto-upload revisi (debounce 3s)</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config?.auto_sync_on_save ?? true}
                      onChange={async (e) => {
                        if (!config) return;
                        const updated = { ...config, auto_sync_on_save: e.target.checked };
                        await handleUpdateSyncConfig(updated);
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Mode 2: Periodic Interval */}
                <div className="sync-option-card">
                  <div className="sync-option-info">
                    <div className="sync-option-title">Sinkronisasi Berkala (Interval)</div>
                    <div className="sync-option-sub">Pemeriksaan & sinkronisasi otomatis berkala di latar belakang</div>
                  </div>
                  <select
                    className="form-input"
                    style={{ width: "160px", padding: "6px 10px", fontSize: "12px" }}
                    value={config?.auto_sync_interval_mins ?? 0}
                    onChange={async (e) => {
                      if (!config) return;
                      const val = parseInt(e.target.value, 10);
                      const updated = { ...config, auto_sync_interval_mins: val };
                      await handleUpdateSyncConfig(updated);
                    }}
                  >
                    <option value="0">Mati (Hanya saat Simpan)</option>
                    <option value="5">Setiap 5 Menit</option>
                    <option value="15">Setiap 15 Menit</option>
                    <option value="30">Setiap 30 Menit</option>
                    <option value="60">Setiap 1 Jam</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-icon blue">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="stat-value">{status.total_synced_files}</div>
                  <div className="stat-title">File Terpantau</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon green">
                  <FileCheck size={20} />
                </div>
                <div>
                  <div className="stat-value">{config?.recent_activities.length || 0}</div>
                  <div className="stat-title">Total Sinkronisasi</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon amber">
                  <Award size={20} />
                </div>
                <div>
                  <div className="stat-value">{milestonesList.length}</div>
                  <div className="stat-title">Milestone (ACC)</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon purple">
                  <ListOrdered size={20} />
                </div>
                <div>
                  <div className="stat-value">{status.queue_count}</div>
                  <div className="stat-title">Antrean Offline</div>
                </div>
              </div>
            </div>

            {/* Cloud Status Cards */}
            <div className="cloud-grid">
              {/* GitHub Card */}
              <div className="cloud-card">
                <div className="cloud-header">
                  <div className="cloud-title-wrap">
                    <GithubIcon size={20} />
                    GitHub Repository
                  </div>
                  <span className={`cloud-badge ${status.github_configured ? "active" : "inactive"}`}>
                    {status.github_configured ? "Aktif" : "Tidak Aktif"}
                  </span>
                </div>
                <div className="cloud-details">
                  <span>
                    Repo: <b>{config?.github.owner ? `${config.github.owner}/${config.github.repo}` : "Belum diatur"}</b>
                  </span>
                  <span>
                    Branch: <b>{config?.github.branch || "main"}</b>
                  </span>
                  <span>
                    Folder Tujuan: <b>{config?.github.path_prefix || "Root"}</b>
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="btn btn-outline btn-sm"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Konfigurasi GitHub
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Google Drive Card */}
              <div className="cloud-card">
                <div className="cloud-header">
                  <div className="cloud-title-wrap">
                    <Cloud size={20} color="#3b82f6" />
                    Google Drive
                  </div>
                  <span className={`cloud-badge ${status.gdrive_configured ? "active" : "inactive"}`}>
                    {status.gdrive_configured ? "Terhubung" : "Belum Terhubung"}
                  </span>
                </div>
                <div className="cloud-details">
                  <span>
                    Folder: <b>{config?.gdrive.folder_name || "Word Backups"}</b>
                  </span>
                  <span>
                    Metode: <b>OAuth 2.0 (Desktop Flow)</b>
                  </span>
                  <span>
                    Status Token: <b>{config?.gdrive.refresh_token ? "Tersimpan Aman" : "Perlu Login"}</b>
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="btn btn-outline btn-sm"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Konfigurasi Google Drive
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Watched Documents Explorer */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <FileText size={18} />
                  Daftar Dokumen Word di Folder ({watchedFiles.length})
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={handleManualSync}
                    className="btn btn-primary btn-sm"
                    disabled={isSyncing || !status.watched_folder || watchedFiles.length === 0}
                  >
                    <RotateCw size={14} className={isSyncing ? "animate-spin" : ""} />
                    {isSyncing ? "Menyinkronkan..." : "Sinkronkan Semua"}
                  </button>
                </div>
              </div>

              {watchedFiles.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px 16px" }}>
                  <FileText size={36} className="empty-state-icon" />
                  <h4>Tidak Ada Berkas Word (.docx)</h4>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Simpan atau letakkan dokumen Word Anda di folder terpilih agar EyeDoc dapat memantau dan menyinkronkannya.
                  </p>
                </div>
              ) : (
                <div className="file-list-table">
                  {watchedFiles.map((f) => (
                    <div key={f.path} className="file-item-card">
                      <div className="file-item-left">
                        <div className="file-icon-badge">
                          <FileText size={20} />
                        </div>
                        <div className="file-item-meta">
                          <div className="file-item-name" title={f.path}>
                            {f.name}
                          </div>
                          <div className="file-item-sub">
                            <span>Bagian: <b style={{ color: "#e2e8f0" }}>{f.last_heading}</b></span>
                            <span>•</span>
                            <span>{f.word_count.toLocaleString()} kata</span>
                            <span>•</span>
                            <span>Diubah: {f.last_modified}</span>
                          </div>
                        </div>
                      </div>

                      <div className="file-item-right">
                        {f.is_synced ? (
                          <span className="file-badge synced">
                            <CheckCircle2 size={12} />
                            Tersimpan (v{String(f.tracked_version).padStart(2, "0")})
                          </span>
                        ) : (
                          <span className="file-badge pending">
                            <Clock size={12} />
                            {f.tracked_version === 0 ? "Belum Dicadangkan" : "Ada Revisi Baru"}
                          </span>
                        )}

                        <button
                          onClick={() => handleOpenDocFile(f.path)}
                          className="btn btn-outline btn-xs"
                          title="Buka dokumen ini di Microsoft Word"
                        >
                          <FileText size={12} />
                          Buka di Word
                        </button>

                        <button
                          onClick={() => handleSyncSingleFile(f.path)}
                          className="btn btn-outline btn-xs"
                          disabled={syncingFile === f.path}
                          title="Cadangkan revisi file ini sekarang"
                        >
                          <RotateCw size={12} className={syncingFile === f.path ? "animate-spin" : ""} />
                          Simpan Versi
                        </button>

                        <button
                          onClick={() => {
                            setMilestoneFile(f.path);
                            setIsMilestoneModalOpen(true);
                          }}
                          className="btn btn-warning btn-xs"
                          title="Tandai Milestone (ACC Dosen) untuk file ini"
                        >
                          <Award size={12} />
                          Milestone
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Activity Feed */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Clock size={18} />
                  Riwayat Perubahan & Changelog Otomatis
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Terupdate saat Anda menekan Ctrl + S di Microsoft Word
                </div>
              </div>

              {config?.recent_activities && config.recent_activities.length > 0 ? (
                <div className="activity-list">
                  {config.recent_activities.map((act) => (
                    <div
                      key={act.id}
                      className={`activity-item ${act.is_milestone ? "is-milestone" : ""}`}
                    >
                      <div className="activity-left">
                        <div className="activity-icon-wrap">
                          {act.is_milestone ? <Award size={18} color="#f59e0b" /> : <FileText size={18} />}
                        </div>
                        <div className="activity-main">
                          <div className="activity-header">
                            <span className="activity-file">{act.file_name}</span>
                            <span className="version-tag">v{String(act.version).padStart(2, "0")}</span>
                            {act.is_milestone && (
                              <span className="milestone-tag">
                                <Award size={12} />
                                MILESTONE
                              </span>
                            )}
                          </div>
                          <div className="activity-changelog">{act.changelog}</div>
                          <div className="activity-clouds">
                            {act.target_clouds && act.target_clouds.length > 0 ? (
                              act.target_clouds.map((c, idx) => (
                                <span key={idx} className="cloud-pill">
                                  {c}
                                </span>
                              ))
                            ) : (
                              <span className="cloud-pill" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                                Cadangan Lokal
                              </span>
                            )}
                          </div>
                          {act.error_message && (
                            <div style={{ fontSize: "11px", color: "#f87171", marginTop: "3px" }}>
                              {act.error_message}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="activity-right">
                        <span className={`status-badge ${act.status}`}>
                          {act.status === "success"
                            ? "Tersinkron Cloud"
                            : act.status === "queued"
                            ? "Di Antrean Cloud"
                            : act.status === "local_only" || act.status === "no_cloud"
                            ? "Tersimpan Lokal"
                            : "Gagal"}
                        </span>
                        <span className="activity-time">
                          {new Date(act.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <FileText size={40} />
                  </div>
                  <h4>Belum ada aktivitas penyimpanan</h4>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Buka dokumen Word di dalam folder yang dipantau dan tekan <b>Ctrl + S</b>.
                    EyeDoc akan mendeteksi dan mengunggahnya secara otomatis.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANTREAN OFFLINE */}
        {activeTab === "queue" && (
          <div className="dashboard-grid">
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <ListOrdered size={18} />
                  Daftar Antrean Dokumen Offline
                </div>
                <button
                  onClick={handleProcessQueueNow}
                  className="btn btn-primary btn-sm"
                  disabled={queueItems.length === 0}
                >
                  <RotateCw size={14} />
                  Proses Antrean Sekarang
                </button>
              </div>

              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                Saat koneksi internet terputus, EyeDoc menyimpan salinan dokumen Anda di antrean lokal.
                Begitu internet tersambung kembali, seluruh file di bawah ini akan diunggah otomatis ke cloud secara FIFO.
              </p>

              {queueItems.length > 0 ? (
                <div className="activity-list">
                  {queueItems.map((item) => (
                    <div key={item.id} className="activity-item">
                      <div className="activity-left">
                        <div className="activity-icon-wrap">
                          <Clock size={18} color="#f59e0b" />
                        </div>
                        <div className="activity-main">
                          <div className="activity-header">
                            <span className="activity-file">{item.file_name}</span>
                            <span className="version-tag">Target: {item.target_filename}</span>
                            {item.is_milestone && <span className="milestone-tag">Milestone</span>}
                          </div>
                          <div className="activity-changelog">{item.changelog}</div>
                          <div className="activity-clouds">
                            {item.upload_github && <span className="cloud-pill">GitHub</span>}
                            {item.upload_gdrive && <span className="cloud-pill">Google Drive</span>}
                            <span className="cloud-pill">Percobaan: {item.retry_count}x</span>
                          </div>
                        </div>
                      </div>

                      <div className="activity-right">
                        <button
                          onClick={() => handleDeleteQueueItem(item.id)}
                          className="btn btn-danger btn-sm"
                          title="Hapus dari antrean"
                        >
                          <Trash2 size={14} />
                        </button>
                        <span className="activity-time">
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <CheckCircle2 size={40} color="#10b981" className="empty-state-icon" />
                  <h4>Antrean Bersih</h4>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Tidak ada file yang tertahan di antrean offline. Semua sinkronisasi lancar!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MILESTONES */}
        {activeTab === "milestones" && (
          <div className="dashboard-grid">
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Award size={18} color="#f59e0b" />
                  Dokumen Bertanda Milestone ("ACC Dosen")
                </div>
                <button
                  onClick={() => setIsMilestoneModalOpen(true)}
                  className="btn btn-warning btn-sm"
                >
                  <Award size={14} />
                  Tambah Milestone Baru
                </button>
              </div>

              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                File Milestone ditandai dengan label <code>[MILESTONE_Catatan]</code> dan <b>dikecualikan secara permanen</b> dari
                penghapusan otomatis kebijakan retensi (Retention Policy).
              </p>

              {milestonesList.length > 0 ? (
                <div className="activity-list">
                  {milestonesList.map((m) => (
                    <div key={m.id} className="activity-item is-milestone">
                      <div className="activity-left">
                        <div className="activity-icon-wrap">
                          <Award size={20} color="#f59e0b" />
                        </div>
                        <div className="activity-main">
                          <div className="activity-header">
                            <span className="activity-file">{m.file_name}</span>
                            <span className="milestone-tag">ACC MILESTONE</span>
                          </div>
                          <div className="activity-changelog" style={{ color: "#fef3c7" }}>
                            {m.changelog}
                          </div>
                          <div className="activity-clouds">
                            {m.target_clouds.map((c, i) => (
                              <span key={i} className="cloud-pill">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="activity-right">
                        <span className="status-badge success">Tersimpan</span>
                        <span className="activity-time">
                          {new Date(m.timestamp).toLocaleDateString([], {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Award size={40} color="#f59e0b" className="empty-state-icon" />
                  <h4>Belum ada Milestone yang disimpan</h4>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Klik tombol "Tambah Milestone Baru" setiap kali draft skripsi atau dokumen Anda disetujui / di-ACC dosen.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PENGATURAN */}
        {activeTab === "settings" && config && (
          <form onSubmit={handleSaveSettings} className="dashboard-grid">
            {/* Folder Kerja */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Folder size={18} />
                  Folder Kerja Word
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Direktori Pemantauan (.docx)</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    value={config.watch_folder || ""}
                    placeholder="Contoh: C:\Users\Nama\Documents\Skripsi"
                    onChange={(e) => setConfig({ ...config, watch_folder: e.target.value })}
                  />
                  <button type="button" onClick={handlePickFolder} className="btn btn-outline">
                    Browse
                  </button>
                </div>
                <span className="form-input-help">
                  Semua file <code>.docx</code> di folder ini (termasuk subfolder) akan dipantau secara real-time. File sementara (<code>~$...</code>) diabaikan otomatis.
                </span>
              </div>
            </div>

            {/* Opsi & Perilaku Sinkronisasi */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <RotateCw size={18} />
                  Opsi & Perilaku Sinkronisasi Otomatis
                </div>
              </div>

              <div className="form-checkbox-row">
                <input
                  type="checkbox"
                  id="auto_save"
                  className="form-checkbox"
                  checked={config.auto_sync_on_save}
                  onChange={(e) => setConfig({ ...config, auto_sync_on_save: e.target.checked })}
                />
                <label htmlFor="auto_save" className="form-label" style={{ cursor: "pointer", marginBottom: 0 }}>
                  Otomatis unggah revisi baru setiap kali menekan <code>Ctrl + S</code> di Microsoft Word (Debounce 3 detik)
                </label>
              </div>

              <div className="form-checkbox-row">
                <input
                  type="checkbox"
                  id="auto_select"
                  className="form-checkbox"
                  checked={config.auto_sync_on_select}
                  onChange={(e) => setConfig({ ...config, auto_sync_on_select: e.target.checked })}
                />
                <label htmlFor="auto_select" className="form-label" style={{ cursor: "pointer", marginBottom: 0 }}>
                  Langsung pindai & sinkronkan dokumen otomatis setiap kali folder pemantauan dipilih
                </label>
              </div>

              <div className="form-group" style={{ marginTop: "12px" }}>
                <label className="form-label">Interval Sinkronisasi Otomatis Berkala (Latar Belakang)</label>
                <select
                  className="form-input"
                  style={{ width: "240px" }}
                  value={config.auto_sync_interval_mins}
                  onChange={(e) =>
                    setConfig({ ...config, auto_sync_interval_mins: parseInt(e.target.value, 10) })
                  }
                >
                  <option value="0">Mati (Hanya saat Simpan / Manual)</option>
                  <option value="5">Setiap 5 Menit</option>
                  <option value="15">Setiap 15 Menit</option>
                  <option value="30">Setiap 30 Menit</option>
                  <option value="60">Setiap 1 Jam</option>
                </select>
                <span className="form-input-help">
                  Mengecek dan mengunggah dokumen secara otomatis dengan interval waktu yang ditentukan, bahkan tanpa menekan Ctrl+S.
                </span>
              </div>
            </div>

            {/* Format Penamaan */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <FileText size={18} />
                  Format Penamaan File & Subfolder
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Pola Penamaan File Backup</label>
                <input
                  type="text"
                  className="form-input"
                  value={config.naming_pattern}
                  onChange={(e) => setConfig({ ...config, naming_pattern: e.target.value })}
                />
                <span className="form-input-help">
                  Variabel tersedia: <code>{'{name}'}</code>, <code>{'{version:02}'}</code>, <code>{'{date}'}</code>, <code>{'{time}'}</code>
                </span>
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  Contoh hasil: <b style={{ color: "#60a5fa" }}>{getPreviewFilename()}</b>
                </div>
              </div>

              <div className="form-checkbox-row">
                <input
                  type="checkbox"
                  id="auto_month"
                  className="form-checkbox"
                  checked={config.auto_month_folder}
                  onChange={(e) => setConfig({ ...config, auto_month_folder: e.target.checked })}
                />
                <label htmlFor="auto_month" className="form-label" style={{ cursor: "pointer", marginBottom: 0 }}>
                  Kelompokkan file backup dalam subfolder Bulan/Tahun (Contoh: <code>Backups/Nov_2026/</code>)
                </label>
              </div>
            </div>

            {/* GitHub Settings */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <GithubIcon size={18} />
                  Integrasi GitHub Repository
                </div>
                <div className="form-checkbox-row" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    id="gh_enabled"
                    className="form-checkbox"
                    checked={config.github.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, github: { ...config.github, enabled: e.target.checked } })
                    }
                  />
                  <label htmlFor="gh_enabled" className="form-label" style={{ cursor: "pointer", marginBottom: 0 }}>
                    Aktifkan GitHub
                  </label>
                </div>
              </div>

              {config.github.enabled && (
                <div>
                  <div className="form-group">
                    <label className="form-label">Personal Access Token (PAT)</label>
                    <input
                      type="password"
                      className="form-input"
                      value={config.github.token}
                      placeholder="ghp_..."
                      onChange={(e) =>
                        setConfig({ ...config, github: { ...config.github, token: e.target.value } })
                      }
                    />
                    <span className="form-input-help">
                      Butuh izin scope: <code>repo</code> (Full control of private repositories).
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Owner / Username</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.github.owner}
                        placeholder="username"
                        onChange={(e) =>
                          setConfig({ ...config, github: { ...config.github, owner: e.target.value } })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Repository Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.github.repo}
                        placeholder="skripsi-backups"
                        onChange={(e) =>
                          setConfig({ ...config, github: { ...config.github, repo: e.target.value } })
                        }
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Branch</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.github.branch}
                        placeholder="main"
                        onChange={(e) =>
                          setConfig({ ...config, github: { ...config.github, branch: e.target.value } })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Subfolder di Repo</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.github.path_prefix}
                        placeholder="backups"
                        onChange={(e) =>
                          setConfig({ ...config, github: { ...config.github, path_prefix: e.target.value } })
                        }
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={handleTestGithub}
                      className="btn btn-outline btn-sm"
                      disabled={testingGithub}
                    >
                      <RotateCw size={14} className={testingGithub ? "animate-spin" : ""} />
                      {testingGithub ? "Menguji..." : "Uji Koneksi GitHub"}
                    </button>
                    {githubTestResult && (
                      <span style={{ fontSize: "12px", color: githubTestResult.includes("Terkoneksi") ? "#34d399" : "#f87171" }}>
                        {githubTestResult}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Google Drive Settings */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Cloud size={18} color="#3b82f6" />
                  Integrasi Google Drive (OAuth 2.0)
                </div>
                <div className="form-checkbox-row" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    id="gd_enabled"
                    className="form-checkbox"
                    checked={config.gdrive.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, gdrive: { ...config.gdrive, enabled: e.target.checked } })
                    }
                  />
                  <label htmlFor="gd_enabled" className="form-label" style={{ cursor: "pointer", marginBottom: 0 }}>
                    Aktifkan Google Drive
                  </label>
                </div>
              </div>

              {config.gdrive.enabled && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Google Client ID</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.gdrive.client_id}
                        placeholder="xxxx.apps.googleusercontent.com"
                        onChange={(e) =>
                          setConfig({ ...config, gdrive: { ...config.gdrive, client_id: e.target.value } })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Google Client Secret</label>
                      <input
                        type="password"
                        className="form-input"
                        value={config.gdrive.client_secret}
                        placeholder="GOCSPX-..."
                        onChange={(e) =>
                          setConfig({ ...config, gdrive: { ...config.gdrive, client_secret: e.target.value } })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Target Folder ID di Google Drive (Opsional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={config.gdrive.folder_id}
                      placeholder="Biarkan kosong untuk mengunggah ke root My Drive"
                      onChange={(e) =>
                        setConfig({ ...config, gdrive: { ...config.gdrive, folder_id: e.target.value } })
                      }
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
                    <button
                      type="button"
                      onClick={handleConnectGoogle}
                      className="btn btn-primary btn-sm"
                      disabled={connectingGDrive}
                    >
                      <Cloud size={14} />
                      {connectingGDrive ? "Menunggu Browser..." : "Hubungkan Akun Google"}
                    </button>
                    <span style={{ fontSize: "12px", color: config.gdrive.refresh_token ? "#34d399" : "#94a3b8" }}>
                      {config.gdrive.refresh_token ? "✓ Token OAuth Aktif Tersimpan" : "Belum dihubungkan"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Retention Policy */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <ShieldCheck size={18} />
                  Kebijakan Retensi (Auto-Cleanup)
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Batas Maksimal Versi Reguler Disimpan di Cloud</label>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    className="form-input"
                    style={{ width: "120px" }}
                    value={config.retention_limit}
                    onChange={(e) =>
                      setConfig({ ...config, retention_limit: parseInt(e.target.value) || 25 })
                    }
                  />
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    versi terbaru (Default: 25 versi)
                  </span>
                </div>
                <span className="form-input-help" style={{ marginTop: "6px" }}>
                  Jika jumlah file versi reguler di cloud melebihi batas ini, file terlama akan dihapus otomatis.
                  <b style={{ color: "#fbbf24" }}> File bertanda [MILESTONE] kebal dan TIDAK PERNAH dihapus.</b>
                </span>
              </div>
            </div>

            {/* Simpan Pengaturan Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "30px" }}>
              <button type="submit" className="btn btn-primary" style={{ padding: "12px 24px" }}>
                <Check size={16} />
                Simpan Seluruh Pengaturan
              </button>
            </div>
          </form>
        )}
      </main>

      {/* MILESTONE MODAL */}
      {isMilestoneModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMilestoneModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Award size={20} />
                Simpan Milestone ("ACC Dosen")
              </div>
              <button
                onClick={() => setIsMilestoneModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "white", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Versi dokumen ini akan diunggah dengan label permanen <code>[MILESTONE]</code> dan dikecualikan dari auto-retention.
            </p>

            <div className="form-group">
              <label className="form-label">Catatan Milestone</label>
              <input
                type="text"
                className="form-input"
                value={milestoneNote}
                placeholder="Contoh: ACC Bimbingan Bab 1-3 oleh Dosen 1"
                onChange={(e) => setMilestoneNote(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsMilestoneModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-warning"
                onClick={handleSaveMilestone}
              >
                <Award size={16} />
                Simpan & Kunci Versi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
