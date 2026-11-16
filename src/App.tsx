import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
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
  Layers,
  FileText,
  Trash2,
  ShieldCheck,
  Check,
  X,
  FileCheck,
  ExternalLink,
  Copy,
  LogOut,
  ChevronDown,
  FolderOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  FileUp,
  FolderSync,
  Info
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import "./App.css";

const GithubIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const GoogleDriveIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
  published_at?: string | null;
  notes?: string | null;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface GitHubUser {
  login: string;
  name?: string | null;
  avatar_url?: string | null;
}

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
  const [activeTab, setActiveTab] = useState<"dashboard" | "queue" | "milestones" | "settings" | "about">("dashboard");
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

  // GitHub Device Flow SSO State
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [deviceData, setDeviceData] = useState<DeviceCodeResponse | null>(null);
  const [isWaitingGithubAuth, setIsWaitingGithubAuth] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Google OAuth State
  const [connectingGDrive, setConnectingGDrive] = useState(false);

  // Advanced Settings Toggles
  const [showAdvancedGithub, setShowAdvancedGithub] = useState(false);
  const [showAdvancedGoogle, setShowAdvancedGoogle] = useState(false);

  // About & Update
  const [appVersion, setAppVersion] = useState("...");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Load initial data
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("-"));
    loadConfig();
    refreshStatus();
    loadQueue();
    loadWatchedFiles();

    const interval = setInterval(() => {
      refreshStatus();
      loadWatchedFiles();
      loadQueue();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Listen to Tauri events
  useEffect(() => {
    const unlisten1 = listen("file_change_detected", () => {
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    });

    const unlisten2 = listen("sync_status_updated", () => {
      loadConfig();
      refreshStatus();
      loadQueue();
      loadWatchedFiles();
    });

    const unlisten3 = listen("open_milestone_modal", () => {
      setIsMilestoneModalOpen(true);
    });

    const unlistenAbout = listen("open_about", () => {
      setActiveTab("about");
    });

    const unlistenSync = listen<{ file_name: string; version: number; status: string }>(
      "sync_event",
      (event) => {
        loadConfig();
        refreshStatus();
        loadQueue();
        loadWatchedFiles();

        const activity = event.payload;
        if (activity?.file_name) {
          const label = `v${String(activity.version).padStart(2, "0")} ${activity.file_name}`;
          if (activity.status === "local_only") {
            showMessage(`${label} tersimpan lokal, belum ke cloud`, "info");
          } else if (activity.status === "queued") {
            showMessage(`${label} masuk antrean cloud`, "info");
          } else if (activity.status === "success") {
            showMessage(`${label} tersinkron`, "success");
          } else if (activity.status === "failed") {
            showMessage(`${label} gagal diunggah`, "error");
          }
        }
      }
    );

    return () => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
      unlisten3.then((fn) => fn());
      unlistenAbout.then((fn) => fn());
      unlistenSync.then((fn) => fn());
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
      console.error("Gagal memuat konfigurasi:", e);
    }
  };

  const refreshStatus = async () => {
    try {
      const s = await invoke<SystemStatus>("get_system_status");
      setStatus(s);
    } catch (e) {
      console.error("Gagal memuat status:", e);
    }
  };

  const loadWatchedFiles = async () => {
    try {
      const files = await invoke<FolderFileInfo[]>("get_watched_files");
      setWatchedFiles(files);
    } catch (e) {
      console.error("Gagal mengambil daftar dokumen:", e);
    }
  };

  const loadQueue = async () => {
    try {
      const items = await invoke<QueueItem[]>("get_queue");
      setQueueItems(items);
    } catch (e) {
      console.error("Gagal memuat antrean:", e);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Pilih Folder Dokumen Word untuk Dipantau",
      });

      if (selected && typeof selected === "string") {
        if (config) {
          const updated = { ...config, watch_folder: selected };
          await invoke("save_config", { newConfig: updated });
          setConfig(updated);
          showMessage(`Folder pemantauan diatur ke: ${selected}`, "success");
          refreshStatus();
          loadWatchedFiles();
        }
      }
    } catch (e) {
      showMessage(`Gagal memilih folder: ${e}`, "error");
    }
  };

  const handleTogglePause = async () => {
    try {
      const nextPaused = !status.is_paused;
      await invoke("toggle_pause", { paused: nextPaused });
      setStatus((prev) => ({ ...prev, is_paused: nextPaused }));
      if (config) {
        setConfig({ ...config, is_paused: nextPaused });
      }
      showMessage(
        nextPaused
          ? "Pemantauan dokumen dijeda sementara"
          : "Pemantauan dokumen aktif kembali",
        "info"
      );
    } catch (e) {
      showMessage(`Gagal mengubah status pemantauan: ${e}`, "error");
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await invoke("trigger_manual_sync", { filePath: null });
      showMessage("Pemeriksaan folder dan sinkronisasi manual dimulai", "info");
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Sinkronisasi manual gagal: ${e}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncSingleFile = async (filePath: string) => {
    setSyncingFile(filePath);
    try {
      await invoke("trigger_manual_sync", { filePath });
      showMessage("Dokumen sedang disinkronkan ke cloud", "success");
      loadConfig();
      refreshStatus();
      loadWatchedFiles();
    } catch (e) {
      showMessage(`Gagal sinkronisasi dokumen: ${e}`, "error");
    } finally {
      setSyncingFile(null);
    }
  };

  const handleOpenDoc = async (filePath: string) => {
    try {
      await invoke("open_doc_file", { filePath });
    } catch (e) {
      showMessage(`Gagal membuka file Word: ${e}`, "error");
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await invoke("open_backup_folder");
    } catch (e) {
      showMessage(`Gagal membuka folder backup: ${e}`, "error");
    }
  };

  const handleOpenMilestoneModal = (filePath: string) => {
    setMilestoneFile(filePath);
    setIsMilestoneModalOpen(true);
  };

  const handleSaveMilestone = async () => {
    if (!milestoneNote.trim()) {
      showMessage("Isi catatan milestone terlebih dahulu", "error");
      return;
    }

    try {
      const targetFile = milestoneFile || (watchedFiles.length > 0 ? watchedFiles[0].path : "");
      if (!targetFile) {
        showMessage("Tidak ada dokumen yang dipilih untuk milestone", "error");
        return;
      }

      await invoke("save_milestone", { filePath: targetFile, note: milestoneNote });
      setIsMilestoneModalOpen(false);
      setMilestoneNote("ACC Dosen Pembimbing");
      setMilestoneFile("");
      showMessage("Versi milestone tersimpan dan dilindungi dari pembersihan otomatis", "success");
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

  const handleStartGithubSSO = async () => {
    try {
      showMessage("Menghubungi GitHub untuk kode perangkat...", "info");
      const res = await invoke<DeviceCodeResponse>("start_github_device_auth");
      setDeviceData(res);
      setIsGithubModalOpen(true);
      setIsWaitingGithubAuth(true);

      try {
        const user = await invoke<GitHubUser>("complete_github_device_auth", {
          deviceCode: res.device_code,
          interval: res.interval,
          expiresIn: res.expires_in,
        });
        setIsGithubModalOpen(false);
        setIsWaitingGithubAuth(false);
        showMessage(`Berhasil terhubung ke GitHub sebagai @${user.login}. Repositori privat eyedoc-backups siap digunakan.`, "success");
        await loadConfig();
        await refreshStatus();
      } catch (pollErr) {
        setIsWaitingGithubAuth(false);
        showMessage(`Otentikasi GitHub dibatalkan atau waktu habis: ${pollErr}`, "error");
      }
    } catch (err) {
      showMessage(`Gagal memulai otorisasi GitHub: ${err}`, "error");
    }
  };

  const handleStartGoogleSSO = async () => {
    if (!config?.gdrive.client_id?.trim() || !config?.gdrive.client_secret?.trim()) {
      showMessage("Google Drive butuh OAuth client milikmu sendiri. Isi dulu di Pengaturan → Integrasi Google Drive → Kredensial Google Cloud Console.", "error");
      setActiveTab("settings");
      setShowAdvancedGoogle(true);
      return;
    }

    setConnectingGDrive(true);
    try {
      showMessage("Membuka browser untuk otentikasi akun Google Drive...", "info");
      const msg = await invoke<string>("start_gdrive_sso", {
        clientId: config?.gdrive.client_id || null,
        clientSecret: config?.gdrive.client_secret || null,
      });
      showMessage(msg || "Google Drive terhubung", "success");
      await loadConfig();
      await refreshStatus();
    } catch (e) {
      showMessage(`Gagal menghubungkan Google Drive: ${e}`, "error");
    } finally {
      setConnectingGDrive(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setUpdateInfo(info);
    } catch (e) {
      showMessage(`Gagal mengecek pembaruan: ${e}`, "error");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDisconnectGithub = async () => {
    try {
      await invoke("disconnect_github");
      showMessage("Koneksi GitHub diputuskan", "info");
      await loadConfig();
      await refreshStatus();
    } catch (e) {
      showMessage(`Gagal memutuskan GitHub: ${e}`, "error");
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await invoke("disconnect_gdrive");
      showMessage("Koneksi Google Drive diputuskan", "info");
      await loadConfig();
      await refreshStatus();
    } catch (e) {
      showMessage(`Gagal memutuskan Google Drive: ${e}`, "error");
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
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
      showMessage("Google Drive berhasil terhubung", "success");
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
      showMessage("Pengaturan berhasil disimpan", "success");
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

  const getPreviewFilename = () => {
    if (!config) return "Skripsi_v01_20261117.docx";
    const pattern = config.naming_pattern || "{name}_v{version:02}_{date}";
    return pattern
      .replace("{name}", "Draft_Skripsi")
      .replace("{version:02}", "01")
      .replace("{date}", "20261117")
      .replace("{time}", "143000") + ".docx";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const milestonesList = config?.recent_activities.filter((a) => a.is_milestone) || [];

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* APP HEADER */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 shadow-sm">
              <Eye size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-zinc-100">EyeDoc</span>
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/40">
                  v0.1.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-none">Auto-sync dokumen Word</p>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Active Folder Badge / Picker */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectFolder}
              className="h-8 gap-2 bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-300 max-w-[320px] truncate"
              title={config?.watch_folder || "Pilih folder kerja untuk dipantau"}
            >
              <Folder size={14} className="text-zinc-400 shrink-0" />
              <span className="truncate text-xs">
                {config?.watch_folder ? config.watch_folder : "Pilih Folder Kerja"}
              </span>
            </Button>
            {config?.watch_folder && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenBackupFolder}
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
                title="Buka direktori penyimpanan backup lokal"
              >
                <FolderOpen size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2">
          {/* Connection status badge */}
          <Badge
            variant={status.is_online ? "success" : "warning"}
            className="h-7 px-2.5 gap-1.5 font-normal text-xs"
          >
            {status.is_online ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{status.is_online ? "Online" : "Mode Offline"}</span>
          </Badge>

          {/* Pause / Resume Watcher */}
          <Button
            variant={status.is_paused ? "destructive" : "secondary"}
            size="sm"
            onClick={handleTogglePause}
            className="h-8 gap-1.5"
            title={status.is_paused ? "Lanjutkan pemantauan otomatis" : "Jeda pemantauan file Word"}
          >
            {status.is_paused ? <Play size={13} /> : <Pause size={13} />}
            <span>{status.is_paused ? "Lanjutkan" : "Jeda"}</span>
          </Button>

          {/* Manual Sync Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="h-8 gap-1.5 border-zinc-800 text-zinc-300 hover:text-zinc-100"
            title="Pindai ulang dan unggah perubahan dokumen sekarang"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin-fast" : ""} />
            <span>{isSyncing ? "Sinkron..." : "Sinkronkan"}</span>
          </Button>
        </div>
      </header>

      {/* NOTIFICATION TOAST */}
      {message && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 text-xs border-b transition-all ${
            message.type === "success"
              ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/60"
              : message.type === "error"
              ? "bg-red-950/40 text-red-300 border-red-900/60"
              : "bg-blue-950/40 text-blue-300 border-blue-900/60"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : message.type === "error" ? (
              <AlertCircle size={14} className="text-red-400" />
            ) : (
              <Clock size={14} className="text-blue-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* NAVIGATION TABS (SHADCN SEGMENTED CONTROLS) */}
      <nav className="flex items-center px-5 py-2.5 border-b border-zinc-800/60 bg-zinc-950 shrink-0">
        <div className="inline-flex p-1 bg-zinc-900 border border-zinc-800 rounded-lg gap-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "dashboard"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText size={14} />
            <span>Ringkasan</span>
          </button>

          <button
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "queue"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers size={14} />
            <span>Antrean Offline</span>
            {status.queue_count > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {status.queue_count}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("milestones")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "milestones"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Award size={14} />
            <span>Milestone (ACC)</span>
            {milestonesList.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded-full bg-zinc-700/50 text-zinc-300">
                {milestonesList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "settings"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Settings size={14} />
            <span>Pengaturan</span>
          </button>

          <button
            onClick={() => setActiveTab("about")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "about"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Info size={14} />
            <span>Tentang</span>
          </button>
        </div>
      </nav>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {/* ========================================================== */}
        {/* TAB 1: RINGKASAN (DASHBOARD) */}
        {/* ========================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 max-w-6xl mx-auto pb-8">
            {/* Real Metrics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[11px] font-medium text-zinc-400">
                    Dokumen Word Terpantau
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
                    {status.total_synced_files}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-[11px] text-zinc-500">Berkas .docx aktif di folder kerja</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[11px] font-medium text-zinc-400">
                    Total Riwayat Sinkronisasi
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
                    {config?.recent_activities.length || 0}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-[11px] text-zinc-500">Riwayat versi dan status pengirimannya</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[11px] font-medium text-zinc-400">
                    Milestone Tersimpan
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
                    {milestonesList.length}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-[11px] text-zinc-500">Versi permanen kebal auto-cleanup</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-[11px] font-medium text-zinc-400">
                    Antrean Tertunda
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
                    {status.queue_count}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-[11px] text-zinc-500">File menunggu retry otomatis</p>
                </CardContent>
              </Card>
            </div>

            {/* Cloud Destinations Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* GitHub Card */}
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <GithubIcon size={18} />
                      <span>GitHub Repository</span>
                    </CardTitle>
                    <Badge variant={status.github_configured ? "success" : "secondary"}>
                      {status.github_configured ? "Terhubung" : "Belum Terhubung"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="px-5 pt-0 pb-4 text-xs space-y-2">
                    {status.github_configured ? (
                      <div className="space-y-1.5 text-zinc-300">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Akun:</span>
                          <span className="font-mono text-zinc-200">@{config?.github.owner}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Repositori:</span>
                          <span className="font-mono text-zinc-200">
                            {config?.github.owner}/{config?.github.repo}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Branch & Subfolder:</span>
                          <span className="text-zinc-400">
                            {config?.github.branch || "main"} / {config?.github.path_prefix || "backups"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-400 leading-relaxed text-xs">
                        Setiap Ctrl+S, EyeDoc menyimpan versi dokumen ke repositori privat GitHub setelah akun terhubung.
                      </p>
                    )}
                  </CardContent>
                </div>
                <div className="p-5 pt-0 border-t border-zinc-800/60 mt-3 pt-3 flex gap-2">
                  {status.github_configured ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDisconnectGithub}
                        className="flex-1"
                      >
                        <LogOut size={13} />
                        Putuskan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab("settings")}
                        className="flex-1"
                      >
                        Pengaturan
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleStartGithubSSO}
                      className="w-full gap-2"
                    >
                      <GithubIcon size={15} />
                      Hubungkan Akun GitHub
                    </Button>
                  )}
                </div>
              </Card>

              {/* Google Drive Card */}
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <GoogleDriveIcon size={18} />
                      <span>Google Drive</span>
                    </CardTitle>
                    <Badge variant={status.gdrive_configured ? "success" : "secondary"}>
                      {status.gdrive_configured ? "Terhubung" : "Belum Terhubung"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="px-5 pt-0 pb-4 text-xs space-y-2">
                    {status.gdrive_configured ? (
                      <div className="space-y-1.5 text-zinc-300">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Status Token:</span>
                          <span className="text-emerald-400 font-medium">Tersimpan Aman (OAuth)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Folder Tujuan:</span>
                          <span className="text-zinc-200 font-mono">
                            {config?.gdrive.folder_name || "Word Backups"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Metode:</span>
                          <span className="text-zinc-400">OAuth loopback lokal</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-400 leading-relaxed text-xs">
                        EyeDoc mengunggah salinan .docx ke Drive setiap Ctrl+S setelah akun Google terhubung. Perlu OAuth client Google Cloud milik sendiri.
                      </p>
                    )}
                  </CardContent>
                </div>
                <div className="p-5 pt-0 border-t border-zinc-800/60 mt-3 pt-3 flex gap-2">
                  {status.gdrive_configured ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDisconnectGoogle}
                        className="flex-1"
                      >
                        <LogOut size={13} />
                        Putuskan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTab("settings")}
                        className="flex-1"
                      >
                        Pengaturan
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleStartGoogleSSO}
                      disabled={connectingGDrive}
                      className="w-full gap-2"
                    >
                      <GoogleDriveIcon size={15} />
                      {connectingGDrive ? "Menunggu browser..." : "Hubungkan Akun Google"}
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            {/* Live Monitored Files Table */}
            <Card>
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Daftar Dokumen Word ({watchedFiles.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    File .docx di folder kerja yang dipantau setiap ada perubahan.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenBackupFolder}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <FolderOpen size={13} />
                    Buka Folder Backup
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {watchedFiles.length === 0 ? (
                  <div className="p-8 text-center space-y-2 border-t border-zinc-800/60">
                    <p className="text-sm font-medium text-zinc-300">Belum ada dokumen Word yang dipantau</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Pilih folder kerja atau simpan dokumen format <code>.docx</code> di dalam folder yang dipilih untuk memulai pencatatan otomatis.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSelectFolder}
                      className="mt-3 gap-2"
                    >
                      <Folder size={14} />
                      Pilih Folder Kerja
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t border-zinc-800/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/60 text-zinc-400 font-medium border-b border-zinc-800/60">
                        <tr>
                          <th className="py-2.5 px-4">Nama Dokumen</th>
                          <th className="py-2.5 px-3">Versi</th>
                          <th className="py-2.5 px-3">Jumlah Kata</th>
                          <th className="py-2.5 px-3">Bagian Terakhir</th>
                          <th className="py-2.5 px-3">Waktu Diubah</th>
                          <th className="py-2.5 px-4 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {watchedFiles.map((file) => (
                          <tr key={file.path} className="hover:bg-zinc-800/25 transition-colors">
                            <td className="py-3 px-4 font-medium text-zinc-200">
                              <div className="flex items-center gap-2">
                                <FileText size={15} className="text-blue-400 shrink-0" />
                                <span className="truncate max-w-[240px]" title={file.name}>
                                  {file.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                v{file.tracked_version.toString().padStart(2, "0")}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-zinc-400 font-mono">
                              <div>{file.word_count.toLocaleString("id-ID")} kata</div>
                              <div className="text-[10px] text-zinc-500">{formatFileSize(file.size)}</div>
                            </td>
                            <td className="py-3 px-3 text-zinc-400 truncate max-w-[180px]" title={file.last_heading}>
                              {file.last_heading || "-"}
                            </td>
                            <td className="py-3 px-3 text-zinc-500 text-[11px]">
                              {formatDate(file.last_modified)}
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDoc(file.path)}
                                className="h-7 px-2 text-xs text-zinc-300"
                                title="Buka berkas di aplikasi Word default"
                              >
                                Buka
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenMilestoneModal(file.path)}
                                className="h-7 px-2 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                                title="Kunci versi ini sebagai Milestone (ACC Dosen)"
                              >
                                <Award size={12} className="mr-1" />
                                Milestone
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleSyncSingleFile(file.path)}
                                disabled={syncingFile === file.path}
                                className="h-7 px-2 text-xs"
                                title="Unggah salinan versi dokumen ini sekarang"
                              >
                                <FileUp size={12} className={syncingFile === file.path ? "animate-spin-fast" : ""} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Feed */}
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold">Riwayat Sinkronisasi Terkini</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Catatan otomatis perubahan dokumen dan status pengunggahan ke repositori cloud.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {!config?.recent_activities || config.recent_activities.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 border-t border-zinc-800/60">
                    Belum ada riwayat aktivitas. Lakukan perubahan pada dokumen Word untuk melihat log sinkronisasi.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/40 border-t border-zinc-800/60 text-xs">
                    {config.recent_activities.slice(0, 8).map((log) => (
                      <div key={log.id} className="p-3.5 px-5 flex items-center justify-between hover:bg-zinc-800/20">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-md ${log.is_milestone ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-300"}`}>
                            {log.is_milestone ? <Award size={15} /> : <FileCheck size={15} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-200">{log.file_name}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                v{log.version.toString().padStart(2, "0")}
                              </Badge>
                              {log.is_milestone && (
                                <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                                  Milestone
                                </Badge>
                              )}
                            </div>
                            <p className="text-zinc-400 text-[11px] mt-0.5">{log.changelog}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right">
                          <div className="flex gap-1">
                            {log.target_clouds.map((c) => (
                              <Badge key={c} variant="secondary" className="text-[10px] py-0 px-1.5 capitalize">
                                {c}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-zinc-500 text-[11px] w-24">{formatDate(log.timestamp)}</span>
                          <Badge
                            variant={
                              log.status === "success"
                                ? "success"
                                : log.status === "queued"
                                ? "warning"
                                : "destructive"
                            }
                            className="text-[10px]"
                          >
                            {log.status === "success" ? "Berhasil" : log.status === "queued" ? "Antrean" : "Gagal"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: ANTREAN OFFLINE */}
        {/* ========================================================== */}
        {activeTab === "queue" && (
          <div className="space-y-5 max-w-5xl mx-auto pb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Antrean Unggah Offline</h2>
                <p className="text-xs text-zinc-400">
                  Dokumen yang tersimpan saat perangkat offline dan akan diunggah otomatis setiap 15 detik saat internet tersedia.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleProcessQueueNow}
                disabled={queueItems.length === 0}
                className="gap-2"
              >
                <RefreshCw size={13} />
                Proses Antrean Sekarang
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {queueItems.length === 0 ? (
                  <div className="p-12 text-center space-y-2">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-400/80 mb-2" />
                    <p className="text-sm font-medium text-zinc-200">Semua dokumen telah tersinkronkan</p>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Tidak ada dokumen yang tertahan di antrean offline. Semua versi cadangan telah berhasil diunggah.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950/60 text-zinc-400 font-medium border-b border-zinc-800/60">
                      <tr>
                        <th className="py-2.5 px-4">Nama File</th>
                        <th className="py-2.5 px-3">Versi Target</th>
                        <th className="py-2.5 px-3">Tujuan Cloud</th>
                        <th className="py-2.5 px-3">Waktu Dibuat</th>
                        <th className="py-2.5 px-3">Percobaan</th>
                        <th className="py-2.5 px-4 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {queueItems.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-800/20">
                          <td className="py-3 px-4 font-medium text-zinc-200">
                            <div className="flex items-center gap-2">
                              <FileText size={15} className="text-zinc-400" />
                              <span>{item.file_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            v{item.version.toString().padStart(2, "0")}
                            {item.is_milestone && (
                              <Badge variant="warning" className="ml-2 text-[10px]">
                                Milestone
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-3 space-x-1">
                            {item.upload_github && <Badge variant="secondary">GitHub</Badge>}
                            {item.upload_gdrive && <Badge variant="secondary">Drive</Badge>}
                          </td>
                          <td className="py-3 px-3 text-zinc-500">{formatDate(item.created_at)}</td>
                          <td className="py-3 px-3 font-mono text-zinc-400">{item.retry_count}x</td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteQueueItem(item.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                              title="Hapus dari antrean"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: MILESTONES (ACC DOSEN) */}
        {/* ========================================================== */}
        {activeTab === "milestones" && (
          <div className="space-y-5 max-w-5xl mx-auto pb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Daftar Snapshot Milestone (ACC Dosen)</h2>
                <p className="text-xs text-zinc-400">
                  Versi dokumen yang dikunci dengan penanda khusus dan dilindungi secara permanen dari penghapusan kuota retensi.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenBackupFolder}
                className="gap-2"
              >
                <FolderOpen size={13} />
                Buka Arsip Milestone
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {milestonesList.length === 0 ? (
                  <div className="p-12 text-center space-y-2">
                    <Award size={32} className="mx-auto text-amber-400/80 mb-2" />
                    <p className="text-sm font-medium text-zinc-200">Belum ada versi milestone yang dikunci</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Saat dokumen Anda mendapat persetujuan dosen atau bab selesai, klik tombol "Milestone" di daftar dokumen untuk menyimpannya permanen.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/40 text-xs">
                    {milestonesList.map((m) => (
                      <div key={m.id} className="p-4 px-5 flex items-center justify-between hover:bg-zinc-800/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Award size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-100">{m.file_name}</span>
                              <Badge variant="warning" className="text-[10px]">
                                Milestone v{m.version.toString().padStart(2, "0")}
                              </Badge>
                            </div>
                            <p className="text-zinc-300 text-xs mt-1">{m.changelog}</p>
                          </div>
                        </div>

                        <div className="text-right text-zinc-400 space-y-1">
                          <div className="text-[11px] text-zinc-500">{formatDate(m.timestamp)}</div>
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                            Kebal Auto-Cleanup
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 4: PENGATURAN */}
        {/* ========================================================== */}
        {activeTab === "settings" && config && (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-4xl mx-auto pb-12">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Pengaturan Aplikasi & Cloud</h2>
              <p className="text-xs text-zinc-400">
                Kelola folder pemantauan, pola penamaan berkas, integrasi repositori GitHub, dan Google Drive.
              </p>
            </div>

            {/* Folder Pemantauan */}
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FolderSync size={16} />
                  Pemantauan & Sinkronisasi
                </CardTitle>
                <CardDescription className="text-xs">
                  Direktori kerja dokumen Microsoft Word yang dipantau secara real-time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Direktori Folder Aktif</label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      readOnly
                      value={config.watch_folder || "Belum ada folder yang dipilih"}
                      className="bg-zinc-950 font-mono text-zinc-300"
                    />
                    <Button type="button" variant="secondary" onClick={handleSelectFolder}>
                      Ubah Folder
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.auto_sync_on_save}
                      onChange={(e) => setConfig({ ...config, auto_sync_on_save: e.target.checked })}
                      className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 accent-zinc-200"
                    />
                    <span>Otomatis simpan versi baru setiap kali dokumen disimpan (Ctrl+S)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.auto_sync_on_select}
                      onChange={(e) => setConfig({ ...config, auto_sync_on_select: e.target.checked })}
                      className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 accent-zinc-200"
                    />
                    <span>Pindai dan sinkronkan dokumen secara otomatis saat folder kerja dipilih</span>
                  </label>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-medium text-zinc-300">
                    Interval Pengecekan Berkala Latar Belakang
                  </label>
                  <select
                    className="flex h-9 w-60 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-200 shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    value={config.auto_sync_interval_mins}
                    onChange={(e) =>
                      setConfig({ ...config, auto_sync_interval_mins: parseInt(e.target.value, 10) })
                    }
                  >
                    <option value="0">Hanya saat Ctrl+S / Manual</option>
                    <option value="5">Setiap 5 Menit</option>
                    <option value="15">Setiap 15 Menit</option>
                    <option value="30">Setiap 30 Menit</option>
                    <option value="60">Setiap 1 Jam</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Format Penamaan File */}
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText size={16} />
                  Format Penamaan File Cadangan
                </CardTitle>
                <CardDescription className="text-xs">
                  Struktur nama file backup yang dibuat di folder lokal dan diunggah ke cloud.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Pola Penamaan</label>
                  <Input
                    type="text"
                    value={config.naming_pattern}
                    onChange={(e) => setConfig({ ...config, naming_pattern: e.target.value })}
                    className="font-mono"
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                    <span>
                      Variabel yang tersedia: <code>{"{name}"}</code>, <code>{"{version:02}"}</code>, <code>{"{date}"}</code>, <code>{"{time}"}</code>
                    </span>
                    <span>
                      Contoh hasil: <strong className="text-zinc-200 font-mono">{getPreviewFilename()}</strong>
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-2 border-t border-zinc-800/60">
                  <input
                    type="checkbox"
                    checked={config.auto_month_folder}
                    onChange={(e) => setConfig({ ...config, auto_month_folder: e.target.checked })}
                    className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 accent-zinc-200"
                  />
                  <span>Kelompokkan file backup dalam subfolder Bulan dan Tahun (misalnya: <code>Backups/Nov_2026/</code>)</span>
                </label>
              </CardContent>
            </Card>

            {/* Integrasi GitHub */}
            <Card>
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GithubIcon size={18} />
                    Integrasi GitHub Repository
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Mencadangkan setiap versi dokumen sebagai git commit di repositori pribadi.
                  </CardDescription>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.github.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, github: { ...config.github, enabled: e.target.checked } })
                    }
                    className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 accent-zinc-200"
                  />
                  <span>Aktifkan GitHub</span>
                </label>
              </CardHeader>

              {config.github.enabled && (
                <CardContent className="space-y-4 pt-2">
                  {/* Status koneksi GitHub */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    {config.github.token && config.github.owner ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-200">
                            <GithubIcon size={18} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-100">
                              Terhubung sebagai <span className="text-emerald-400">@{config.github.owner}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Repositori: <code>{config.github.owner}/{config.github.repo}</code> ({config.github.branch})
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleTestGithub}
                            disabled={testingGithub}
                          >
                            <RotateCw size={13} className={testingGithub ? "animate-spin-fast" : ""} />
                            {testingGithub ? "Menguji..." : "Uji Koneksi"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleDisconnectGithub}
                          >
                            Putuskan
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-zinc-200">Hubungkan Akun GitHub</div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            Buka github.com/login/device, masukkan kode 8 digit dari app, lalu setujui. EyeDoc lalu membuat repositori privat <code>eyedoc-backups</code> di akun Anda.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handleStartGithubSSO}
                          className="shrink-0 gap-2"
                        >
                          <GithubIcon size={15} />
                          Hubungkan Akun GitHub
                        </Button>
                      </div>
                    )}

                    {githubTestResult && (
                      <div className={`mt-3 text-xs ${githubTestResult.includes("Terkoneksi") ? "text-emerald-400" : "text-red-400"}`}>
                        {githubTestResult}
                      </div>
                    )}
                  </div>

                  {/* Accordion Toggle Pengaturan Lanjutan */}
                  <div
                    onClick={() => setShowAdvancedGithub(!showAdvancedGithub)}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                  >
                    <span>Pengaturan Lanjutan (Token Manual & Repositori Kustom)</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: showAdvancedGithub ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  </div>

                  {showAdvancedGithub && (
                    <div className="p-4 rounded-b-md border border-t-0 border-zinc-800 bg-zinc-950/30 space-y-3 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-zinc-300">Personal Access Token (PAT)</label>
                        <Input
                          type="password"
                          value={config.github.token}
                          placeholder="ghp_..."
                          onChange={(e) =>
                            setConfig({ ...config, github: { ...config.github, token: e.target.value } })
                          }
                        />
                        <p className="text-[11px] text-zinc-500">
                          Isi manual jika tidak memakai alur perangkat. Token butuh izin <code>repo</code>.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Owner / Username</label>
                          <Input
                            type="text"
                            value={config.github.owner}
                            placeholder="username"
                            onChange={(e) =>
                              setConfig({ ...config, github: { ...config.github, owner: e.target.value } })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Nama Repositori</label>
                          <Input
                            type="text"
                            value={config.github.repo}
                            placeholder="eyedoc-backups"
                            onChange={(e) =>
                              setConfig({ ...config, github: { ...config.github, repo: e.target.value } })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Branch</label>
                          <Input
                            type="text"
                            value={config.github.branch}
                            placeholder="main"
                            onChange={(e) =>
                              setConfig({ ...config, github: { ...config.github, branch: e.target.value } })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Subfolder di Repositori</label>
                          <Input
                            type="text"
                            value={config.github.path_prefix}
                            placeholder="backups"
                            onChange={(e) =>
                              setConfig({ ...config, github: { ...config.github, path_prefix: e.target.value } })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Integrasi Google Drive */}
            <Card>
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GoogleDriveIcon size={18} />
                    Integrasi Google Drive
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Unggah salinan .docx ke My Drive setelah akun Google terhubung.
                  </CardDescription>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.gdrive.enabled}
                    onChange={(e) =>
                      setConfig({ ...config, gdrive: { ...config.gdrive, enabled: e.target.checked } })
                    }
                    className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 accent-zinc-200"
                  />
                  <span>Aktifkan Google Drive</span>
                </label>
              </CardHeader>

              {config.gdrive.enabled && (
                <CardContent className="space-y-4 pt-2">
                  {/* Status koneksi Google */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    {config.gdrive.refresh_token ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-200">
                            <GoogleDriveIcon size={18} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-emerald-400">
                              Akun Google Drive Terhubung
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Folder Tujuan: <strong>{config.gdrive.folder_name || "Word Backups"}</strong> (Token tersimpan aman)
                            </div>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={handleDisconnectGoogle}
                        >
                          Putuskan
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-zinc-200">Hubungkan Akun Google</div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            Centang toggle ini hanya menyalakan fitur. Login di browser dengan akun Google Anda dulu, lalu EyeDoc menyimpan salinan .docx ke folder <code>Word Backups</code>.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handleStartGoogleSSO}
                          disabled={connectingGDrive}
                          className="shrink-0 gap-2"
                        >
                          <GoogleDriveIcon size={15} />
                          {connectingGDrive ? "Menunggu browser..." : "Masuk dengan Google"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Accordion GCP Kustom */}
                  <div
                    onClick={() => setShowAdvancedGoogle(!showAdvancedGoogle)}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                  >
                    <span>Kredensial Google Cloud Console (Wajib untuk Google Drive)</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: showAdvancedGoogle ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  </div>

                  {showAdvancedGoogle && (
                    <div className="p-4 rounded-b-md border border-t-0 border-zinc-800 bg-zinc-950/30 space-y-3 text-xs">
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Google memblokir kredensial publik pihak ketiga pada banyak akun. Buat OAuth client bertipe Desktop app di Google Cloud, daftarkan <code>http://127.0.0.1:8585/</code> sebagai Authorized redirect URI, lalu isi Client ID dan Client Secret di sini.
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Client ID Google Cloud</label>
                          <Input
                            type="text"
                            value={config.gdrive.client_id}
                            placeholder="xxxx.apps.googleusercontent.com"
                            onChange={(e) =>
                              setConfig({ ...config, gdrive: { ...config.gdrive, client_id: e.target.value } })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-zinc-300">Client Secret Google Cloud</label>
                          <Input
                            type="password"
                            value={config.gdrive.client_secret}
                            placeholder="Client Secret dari Google Cloud"
                            onChange={(e) =>
                              setConfig({ ...config, gdrive: { ...config.gdrive, client_secret: e.target.value } })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-zinc-300">ID Folder Target di Google Drive (Opsional)</label>
                        <Input
                          type="text"
                          value={config.gdrive.folder_id}
                          placeholder="Kosongkan untuk mengunggah ke root My Drive"
                          onChange={(e) =>
                            setConfig({ ...config, gdrive: { ...config.gdrive, folder_id: e.target.value } })
                          }
                        />
                      </div>

                      {config.gdrive.client_id && config.gdrive.client_secret && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleConnectGoogle}
                          disabled={connectingGDrive}
                          className="mt-2"
                        >
                          Simpan dan Hubungkan Google
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Kebijakan Retensi */}
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck size={16} />
                  Kebijakan Retensi (Pembersihan Otomatis)
                </CardTitle>
                <CardDescription className="text-xs">
                  Membatasi akumulasi file versi reguler lama agar menghemat ruang penyimpanan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-1">
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="5"
                    max="200"
                    value={config.retention_limit}
                    onChange={(e) =>
                      setConfig({ ...config, retention_limit: parseInt(e.target.value) || 25 })
                    }
                    className="w-24 font-mono text-center"
                  />
                  <span className="text-xs text-zinc-300">versi reguler terbaru per dokumen (Default: 25 versi)</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Versi reguler paling awal akan dihapus otomatis ketika batas kuota terlampaui. File yang diberi label <strong className="text-amber-400">[MILESTONE]</strong> tidak akan pernah dihapus.
                </p>
              </CardContent>
            </Card>

            {/* Simpan Seluruh Pengaturan */}
            <div className="flex justify-end pt-2">
              <Button type="submit" variant="default" size="lg" className="px-6 gap-2">
                <Check size={16} />
                Simpan Seluruh Pengaturan
              </Button>
            </div>
          </form>
        )}

        {/* ========================================================== */}
        {/* TAB 5: TENTANG */}
        {/* ========================================================== */}
        {activeTab === "about" && (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Eye size={22} />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-zinc-100">EyeDoc</CardTitle>
                    <CardDescription className="text-xs">
                      Word Cloud Auto-Sync &amp; Versioning
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="ml-auto">v{appVersion}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Versi terpasang</span>
                    <span className="font-mono text-zinc-200">{appVersion}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Dibuat oleh</span>
                    <a
                      href="https://github.com/miezlearning"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                    >
                      miezlearning <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Source code</span>
                    <a
                      href="https://github.com/miezlearning/eyedoc"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                    >
                      github.com/miezlearning/eyedoc <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-zinc-400 leading-relaxed flex-1">
                      Cek rilis terbaru di GitHub. Aplikasi tidak mengunduh atau memasang pembaruan otomatis.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      className="shrink-0 gap-2"
                    >
                      <RefreshCw size={13} className={checkingUpdate ? "animate-spin-fast" : ""} />
                      {checkingUpdate ? "Mengecek..." : "Cek Pembaruan"}
                    </Button>
                  </div>

                  {updateInfo && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">Versi terbaru</span>
                        <span className="font-mono text-zinc-200">v{updateInfo.latest_version}</span>
                      </div>
                      <Badge variant={updateInfo.update_available ? "default" : "success"}>
                        {updateInfo.update_available
                          ? "Pembaruan tersedia"
                          : "Versi kamu sudah terbaru"}
                      </Badge>
                      {updateInfo.published_at && (
                        <p className="text-[11px] text-zinc-500">
                          Dirilis: {new Date(updateInfo.published_at).toLocaleDateString("id-ID")}
                        </p>
                      )}
                      {updateInfo.notes && (
                        <p className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
                          {updateInfo.notes}
                        </p>
                      )}
                      {updateInfo.update_available && (
                        <a
                          href={updateInfo.release_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-400 hover:underline"
                        >
                          Buka halaman rilis <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ========================================================== */}
      {/* DIALOG MODAL: MILESTONE */}
      {/* ========================================================== */}
      {isMilestoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Award size={18} className="text-amber-400" />
                <span>Simpan Milestone Dokumen</span>
              </div>
              <button
                onClick={() => setIsMilestoneModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 rounded p-1"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Versi ini akan disimpan dengan label permanen <code>[MILESTONE]</code> dan dikecualikan dari pembersihan otomatis retensi.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Catatan Milestone</label>
              <Input
                type="text"
                value={milestoneNote}
                placeholder="Contoh: ACC Bab 1 sampai 3 oleh Dosen Pembimbing"
                onChange={(e) => setMilestoneNote(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMilestoneModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveMilestone}
                className="gap-1.5 bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold"
              >
                <Award size={14} />
                Kunci Versi Milestone
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* DIALOG MODAL: GITHUB DEVICE CODE SSO */}
      {/* ========================================================== */}
      {isGithubModalOpen && deviceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <GithubIcon size={18} />
                <span>Otorisasi Akun GitHub</span>
              </div>
              <button
                onClick={() => {
                  setIsGithubModalOpen(false);
                  setIsWaitingGithubAuth(false);
                }}
                className="text-zinc-400 hover:text-zinc-100 rounded p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Halaman perangkat GitHub sudah dibuka di browser (<code>{deviceData.verification_uri}</code>). Masukkan kode 8 digit ini di halaman tersebut:
              </p>

              <div className="flex items-center justify-between p-3.5 bg-zinc-950 rounded-lg border border-zinc-800">
                <span className="font-mono text-xl font-bold tracking-widest text-zinc-100">
                  {deviceData.user_code}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyCode(deviceData.user_code)}
                  className="gap-1.5 text-xs h-8"
                >
                  {copiedCode ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedCode ? "Tersalin" : "Salin Kode"}</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-300">
              <div className="w-4 h-4 rounded-full border-2 border-zinc-600 border-t-zinc-200 animate-spin-fast shrink-0" />
              <div>
                <div className="font-medium text-zinc-200">
                  {isWaitingGithubAuth ? "Menunggu konfirmasi di browser Anda..." : "Otorisasi selesai"}
                </div>
                <div className="text-[11px] text-zinc-500">
                  EyeDoc menyimpan token setelah Anda menyetujui di GitHub.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={deviceData.verification_uri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
              >
                <ExternalLink size={12} />
                Buka Ulang Halaman GitHub
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsGithubModalOpen(false);
                  setIsWaitingGithubAuth(false);
                }}
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
