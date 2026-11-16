import React from "react";

export type Language = "en" | "id";

export const LANGUAGE_STORAGE_KEY = "eyedoc.language";

/** English source text -> Bahasa Indonesia. Default aplikasi adalah English. */
export const INDONESIAN: Record<string, string> = {
  "Word document auto-sync": "Auto-sync dokumen Word",
  "Overview": "Ringkasan",
  "Offline Queue": "Antrean Offline",
  "Milestones (ACC)": "Milestone (ACC)",
  "Settings": "Pengaturan",
  "About": "Tentang",

  "Failed to load configuration:": "Gagal memuat konfigurasi:",
  "Failed to load status:": "Gagal memuat status:",
  "Failed to load queue:": "Gagal memuat antrean:",
  "Failed to load document list:": "Gagal mengambil daftar dokumen:",
  "Settings saved": "Pengaturan berhasil disimpan",
  "Document monitoring paused": "Pemantauan dokumen dijeda sementara",
  "Document monitoring resumed": "Pemantauan dokumen aktif kembali",
  "Folder check and manual sync started": "Pemeriksaan folder dan sinkronisasi manual dimulai",
  "Milestone saved and protected from auto-cleanup": "Versi milestone tersimpan dan dilindungi dari pembersihan otomatis",
  "Document sync failed:": "Gagal sinkronisasi dokumen:",
  "Failed to open Word file:": "Gagal membuka file Word:",
  "Failed to open backup folder:": "Gagal membuka folder backup:",
  "Enter a milestone note first": "Isi catatan milestone terlebih dahulu",
  "Enter Google Client ID and Client Secret first": "Isi Google Client ID dan Client Secret terlebih dahulu",
  "Queue item removed": "Item antrean dihapus",
  "GitHub connection disconnected": "Koneksi GitHub diputuskan",
  "Google Drive connection disconnected": "Koneksi Google Drive diputuskan",
  "Google Drive connected": "Google Drive berhasil terhubung",
  "Opening browser for Google Drive authentication...": "Membuka browser untuk otentikasi akun Google Drive...",
  "Opening browser for Google authorization...": "Membuka browser untuk otorisasi Google OAuth...",
  "Contacting GitHub for a device code...": "Menghubungi GitHub untuk kode perangkat...",
  "Waiting for browser...": "Menunggu browser...",
  "Google Drive requires your own OAuth client. Fill it in first in Settings > Google Drive Integration > Google Cloud Credentials.": "Google Drive butuh OAuth client milikmu sendiri. Isi dulu di Pengaturan > Integrasi Google Drive > Kredensial Google Cloud Console.",
  "Failed to check for updates:": "Gagal mengecek pembaruan:",
  "Select a Word document first": "Pilih dokumen Word terlebih dahulu",
  "Milestone saved": "Milestone tersimpan",

  "Monitored Word Documents": "Dokumen Word Terpantau",
  "Active .docx files in the work folder": "Berkas .docx aktif di folder kerja",
  "Total Sync History": "Total Riwayat Sinkronisasi",
  "Version history and delivery status": "Riwayat versi dan status pengirimannya",
  "Saved Milestones": "Milestone Tersimpan",
  "Permanent versions exempt from auto-cleanup": "Versi permanen kebal auto-cleanup",
  "Offline": "Offline",
  "Online": "Online",
  "Not Connected": "Belum Terhubung",
  "Connected": "Terhubung",
  "Token status:": "Status Token:",
  "Stored securely (OAuth)": "Tersimpan Aman (OAuth)",
  "Destination folder:": "Folder Tujuan:",
  "Method: Local OAuth loopback": "Metode: OAuth loopback lokal",
  "Disconnect": "Putuskan",
  "Connect GitHub Account": "Hubungkan Akun GitHub",
  "Connect Google Account": "Hubungkan Akun Google",
  "On every Ctrl+S, EyeDoc saves a document version to your private GitHub repository once the account is connected.": "Setiap Ctrl+S, EyeDoc menyimpan versi dokumen ke repositori privat GitHub setelah akun terhubung.",
  "EyeDoc uploads a .docx copy to Drive on every Ctrl+S once your Google account is connected. Requires your own Google Cloud OAuth client.": "EyeDoc mengunggah salinan .docx ke Drive setiap Ctrl+S setelah akun Google terhubung. Perlu OAuth client Google Cloud milik sendiri.",
  "Quick Actions": "Aksi Cepat",
  "Sync Now": "Sinkron Sekarang",
  "Pause": "Jeda",
  "Resume": "Lanjutkan",
  "Select Work Folder": "Pilih Folder Kerja",
  "Open Backup Folder": "Buka Folder Backup",

  "Work Folder": "Folder Kerja",
  "No folder selected yet": "Belum ada folder yang dipilih",
  "Change Folder": "Ubah Folder",
  "Monitoring & Sync": "Pemantauan & Sinkronisasi",
  "Auto-save a new version on every document save (Ctrl+S)": "Otomatis simpan versi baru setiap kali dokumen disimpan (Ctrl+S)",
  "Scan and sync documents automatically when the work folder is selected": "Pindai dan sinkronkan dokumen secara otomatis saat folder kerja dipilih",
  "Background Check Interval (minutes)": "Interval Pengecekan Berkala Latar Belakang",
  "Retention Policy (Auto-Cleanup)": "Kebijakan Retensi (Pembersihan Otomatis)",
  "Limit regular versions kept per document": "Batas versi reguler yang disimpan per dokumen",
  "Oldest regular versions are removed when the quota is exceeded. Files labeled": "Versi reguler paling awal akan dihapus otomatis ketika batas kuota terlampaui. File yang diberi label",
  "are never removed": "tidak akan pernah dihapus",
  "Backup File Naming Pattern": "Format Penamaan File Cadangan",
  "Structure of backup filenames created locally and uploaded to the cloud.": "Struktur nama file backup yang dibuat di folder lokal dan diunggah ke cloud.",
  "Example:": "Contoh:",

  "GitHub Repository Integration": "Integrasi GitHub Repository",
  "Back up each document version as a git commit in a private repository.": "Mencadangkan setiap versi dokumen sebagai git commit di repositori pribadi.",
  "Advanced Settings (Manual Token & Custom Repository)": "Pengaturan Lanjutan (Token Manual & Repositori Kustom)",
  "Personal Access Token (PAT)": "Personal Access Token (PAT)",
  "Use manually if not using the device flow. Token needs the": "Isi manual jika tidak memakai alur perangkat. Token butuh izin",
  "scope": "scope",
  "Owner / Username": "Owner / Username",
  "Repository Name": "Nama Repositori",
  "Branch": "Cabang",
  "Path Prefix": "Awalan Path",
  "Test Connection": "Uji Koneksi",
  "Testing...": "Menguji...",
  "Connected as": "Terhubung sebagai",
  "Repository:": "Repositori:",

  "Google Drive Integration": "Integrasi Google Drive",
  "Upload .docx copies to My Drive once the Google account is connected.": "Unggah salinan .docx ke My Drive setelah akun Google terhubung.",
  "Enable Google Drive": "Aktifkan Google Drive",
  "Connect your Google Account": "Hubungkan Akun Google",
  "Toggling this only enables the feature. Sign in with your Google account in the browser first, then EyeDoc saves .docx copies to the": "Centang toggle ini hanya menyalakan fitur. Login di browser dengan akun Google Anda dulu, lalu EyeDoc menyimpan salinan .docx ke folder",
  "folder.": "folder.",
  "Sign in with Google": "Masuk dengan Google",
  "Google Cloud Credentials (Required for Google Drive)": "Kredensial Google Cloud Console (Wajib untuk Google Drive)",
  "Google blocks third-party public credentials on many accounts. Create a Desktop app OAuth client in Google Cloud, register": "Google memblokir kredensial publik pihak ketiga pada banyak akun. Buat OAuth client bertipe Desktop app di Google Cloud, daftarkan",
  "as an Authorized redirect URI, then fill in the Client ID and Client Secret here.": "sebagai Authorized redirect URI, lalu isi Client ID dan Client Secret di sini.",
  "Client ID": "Client ID",
  "Client Secret": "Client Secret",
  "Client ID Google Cloud": "Client ID Google Cloud",
  "Client Secret Google Cloud": "Client Secret Google Cloud",
  "Target Folder ID in Google Drive (Optional)": "ID Folder Target di Google Drive (Opsional)",
  "Leave empty to upload to the My Drive root": "Kosongkan untuk mengunggah ke root My Drive",
  "Save and Connect Google": "Simpan dan Hubungkan Google",
  "Account connected": "Akun Google Drive Terhubung",

  "Save All Settings": "Simpan Seluruh Pengaturan",

  "No documents waiting in the offline queue. All backups have been uploaded.": "Tidak ada dokumen yang tertahan di antrean offline. Semua versi cadangan telah berhasil diunggah.",
  "Documents are saved while offline and will be uploaded automatically every 15 seconds once internet is available.": "Dokumen yang tersimpan saat perangkat offline dan akan diunggah otomatis setiap 15 detik saat internet tersedia.",
  "Pending Queue": "Antrean Tertunda",
  "Process Queue Now": "Proses Antrean Sekarang",
  "Automatic notes of document changes and cloud upload status.": "Catatan otomatis perubahan dokumen dan status pengunggahan ke repositori cloud.",
  "No activity history yet. Change a Word document to see sync logs.": "Belum ada riwayat aktivitas. Lakukan perubahan pada dokumen Word untuk melihat log sinkronisasi.",
  "Document is syncing to the cloud": "Dokumen sedang disinkronkan ke cloud",
  "Success": "Berhasil",
  "Failed": "Gagal",
  "Queued": "Antrean",
  "Local only": "Lokal saja",
  "Open": "Buka",
  "Cancel": "Batal",
  "Close": "Tutup",
  "Save": "Simpan",
  "Milestone Note": "Catatan Milestone",
  "Keep Auto-Cleanup Exempt": "Kunci Versi Milestone",
  "Example: ACC Chapters 1 to 3 by Advisor": "Contoh: ACC Bab 1 sampai 3 oleh Dosen Pembimbing",
  "When your document gets advisor approval or a chapter is finished, click the": "Saat dokumen Anda mendapat persetujuan dosen atau bab selesai, klik tombol",
  "button in the document list to save it permanently.": "di daftar dokumen untuk menyimpannya permanen.",
  "Open Milestone Archive": "Buka Arsip Milestone",
  "Milestone (ACC) badge": "Label Milestone (ACC)",
  "Copy Code": "Salin Kode",
  "Copied": "Tersalin",
  "Open GitHub Page Again": "Buka Ulang Halaman GitHub",
  "GitHub device page is already open in your browser": "Halaman perangkat GitHub sudah dibuka di browser",
  "Enter this 8-digit code on that page:": "Masukkan kode 8 digit ini di halaman tersebut:",
  "Waiting for confirmation in your browser...": "Menunggu konfirmasi di browser Anda...",
  "Authorization complete": "Otorisasi selesai",
  "EyeDoc saves the token after you approve it on GitHub.": "EyeDoc menyimpan token setelah Anda menyetujui di GitHub.",
  "Authorize GitHub Account": "Otorisasi Akun GitHub",

  "Manage the monitored folder, naming pattern, GitHub repository and Google Drive integrations.": "Kelola folder pemantauan, pola penamaan berkas, integrasi repositori GitHub, dan Google Drive.",
  "Application Settings & Cloud": "Pengaturan Aplikasi & Cloud",
  "Select the Word Document Folder to Monitor": "Pilih Folder Dokumen Word untuk Dipantau",
  "The Microsoft Word document directory monitored in real time.": "Direktori kerja dokumen Microsoft Word yang dipantau secara real-time.",
  "Word documents in the work folder checked on every change.": "File .docx di folder kerja yang dipantau setiap ada perubahan.",
  "Choose language": "Pilih bahasa",
  "Language": "Bahasa",

  "Name": "Nama",
  "Version": "Versi",
  "Words": "Kata",
  "Size": "Ukuran",
  "Modified": "Diubah",
  "Status": "Status",
  "Synced": "Tersinkron",
  "Not synced": "Belum tersinkron",
  "Version history": "Riwayat versi",
  "Last sync": "Sinkron terakhir",
  "No documents found": "Tidak ada dokumen ditemukan",
  "No milestones saved yet": "Belum ada milestone tersimpan",
  "Refresh": "Muat ulang",
  "Checking...": "Mengecek...",
  "Check for Updates": "Cek Pembaruan",
  "Check the latest release on GitHub. The app does not download or install updates automatically.": "Cek rilis terbaru di GitHub. Aplikasi tidak mengunduh atau memasang pembaruan otomatis.",
  "Latest version": "Versi terbaru",
  "Update available": "Pembaruan tersedia",
  "You are on the latest version": "Versi kamu sudah terbaru",
  "Released:": "Dirilis:",
  "Open release page": "Buka halaman rilis",
  "Created by": "Dibuat oleh",
  "Source code": "Source code",
  "Installed version": "Versi terpasang",
  "Word Cloud Auto-Sync & Versioning": "Word Cloud Auto-Sync & Versioning",

  "saved locally, not uploaded": "tersimpan lokal, belum ke cloud",
  "queued for cloud": "masuk antrean cloud",
  "synced": "tersinkron",
  "upload failed": "gagal diunggah",
  "Monitoring folder set to": "Folder pemantauan diatur ke",
  "No document selected for milestone": "Tidak ada dokumen yang dipilih untuk milestone",
  "Select a work folder to monitor": "Pilih folder kerja untuk dipantau",
  "Open local backup directory": "Buka direktori penyimpanan backup lokal",
  "Open file in default Word application": "Buka berkas di aplikasi Word default",
  "Failed to select folder": "Gagal memilih folder",
  "Failed to change monitoring status": "Gagal mengubah status pemantauan",
  "Manual sync failed": "Sinkronisasi manual gagal",
  "Failed to sync document": "Gagal sinkronisasi dokumen",
  "Failed to open Word file": "Gagal membuka file Word",
  "Failed to open backup folder": "Gagal membuka folder backup",
  "Failed to save milestone": "Gagal menyimpan milestone",
  "GitHub connection failed": "Koneksi GitHub gagal",
  "GitHub authorization was cancelled or timed out": "Otentikasi GitHub dibatalkan atau waktu habis",
  "Failed to save settings": "Gagal menyimpan pengaturan",
  "Processed": "Berhasil memproses",
  "documents from the offline queue": "dokumen dari antrean offline",
  "Failed to check for updates": "Gagal mengecek pembaruan",
  "Rescan and upload document changes now": "Pindai ulang dan unggah perubahan dokumen sekarang",
  "No Word documents monitored yet": "Belum ada dokumen Word yang dipantau",
  "Created": "Waktu Dibuat",
  "Lock this version as a milestone": "Kunci versi ini sebagai Milestone (ACC Dosen)",
  "Upload a copy of this document version now": "Unggah salinan versi dokumen ini sekarang",
  "All documents are synced": "Semua dokumen telah tersinkronkan",
  "Remove from queue": "Hapus dari antrean",
  "Milestone Snapshots (Advisor ACC)": "Daftar Snapshot Milestone (ACC Dosen)",
  "No locked milestone versions yet": "Belum ada versi milestone yang dikunci",
  'When your document gets advisor approval or a chapter is finished, click the "Milestone" button in the document list to save it permanently.': 'Saat dokumen Anda mendapat persetujuan dosen atau bab selesai, klik tombol "Milestone" di daftar dokumen untuk menyimpannya permanen.',
  "Naming Pattern": "Pola Penamaan",
  "Available variables:": "Variabel yang tersedia:",
  "as an Authorized redirect URI,": "sebagai Authorized redirect URI,",
  "then fill in the Client ID and Client Secret here.": "lalu isi Client ID dan Client Secret di sini.",
  "Client Secret from Google Cloud": "Client Secret dari Google Cloud",
  "Limits the buildup of old regular versions to save storage space.": "Membatasi akumulasi file versi reguler lama agar menghemat ruang penyimpanan.",
  "most recent regular versions per document (Default: 25 versions)": "versi reguler terbaru per dokumen (Default: 25 versi)",
  "Toggling this only enables the feature. Sign in with your Google account in the browser first, then EyeDoc saves .docx copies to the Word Backups folder.": "Centang toggle ini hanya menyalakan fitur. Login di browser dengan akun Google Anda dulu, lalu EyeDoc menyimpan salinan .docx ke folder Word Backups.",
  "ACC Advisor": "ACC Dosen Pembimbing",
  "Versions locked with a special marker and permanently protected from retention cleanup.": "Versi dokumen yang dikunci dengan penanda khusus dan dilindungi secara permanen dari penghapusan kuota retensi.",
  "This version will be saved with the permanent label": "Versi ini akan disimpan dengan label permanen",
  "and excluded from retention auto-cleanup.": "dan dikecualikan dari pembersihan otomatis retensi.",
  "The GitHub device page is already open in your browser": "Halaman perangkat GitHub sudah dibuka di browser",
  "Open github.com/login/device, enter the 8-digit code from the app, then approve. EyeDoc then creates a private repository": "Buka github.com/login/device, masukkan kode 8 digit dari app, lalu setujui. EyeDoc lalu membuat repositori privat",
  "in your account.": "di akun Anda.",
  "are never removed.": "tidak akan pernah dihapus.",
};

/** Pesan dari backend Rust yang masih berbahasa Indonesia, diterjemahkan ke English. */
const ENGLISH_OVERRIDES: Record<string, string> = {
  "Folder kerja belum dipilih": "No work folder selected",
  "File tidak ditemukan": "File not found",
  "File dokumen tidak ditemukan": "Document file not found",
  "Folder pemantauan belum dipilih": "No monitored folder selected",
  "Path target tidak valid": "Invalid target path",
  "Konfigurasi GitHub belum lengkap (Token, Owner, Repo wajib diisi)": "GitHub configuration is incomplete. Token, Owner and Repo are required.",
  "Client ID dan Client Secret Google Cloud tidak boleh kosong": "Google Cloud Client ID and Client Secret cannot be empty",
  "Rilis terbaru tidak memiliki nomor versi": "The latest release has no version number",
  "Kode otorisasi telah kedaluwarsa. Silakan login ulang.": "Authorization code expired. Please sign in again.",
  "Otorisasi ditolak oleh pengguna.": "Authorization was denied by the user.",
  "Waktu otorisasi GitHub telah habis. Silakan coba lagi.": "GitHub authorization timed out. Please try again.",
  "Gagal menghubungi GitHub": "Failed to contact GitHub",
  "Gagal membaca token": "Failed to read token",
  "Gagal mengambil profil GitHub": "Failed to fetch GitHub profile",
  "Gagal menukar token dengan Google": "Failed to exchange token with Google",
  "Gagal mengunggah file ke Google Drive": "Failed to upload file to Google Drive",
  "Gagal membuka browser untuk otorisasi Google": "Failed to open browser for Google authorization",
  "Gagal menerima koneksi balik dari browser": "Failed to receive callback from browser",
  "Google Drive refresh_token belum tersedia. Harap hubungkan akun Google Drive terlebih dahulu.": "Google Drive refresh token is unavailable. Connect your Google Drive account first.",
  "Google menolak penukaran token": "Google rejected the token exchange",
  "Google Drive API menolak upload": "Google Drive API rejected the upload",
  "Google menolak otorisasi": "Google rejected the authorization",
  "Gagal menyimpan config": "Failed to save config",
  "Gagal serialize config": "Failed to serialize config",
  "Gagal membuka file": "Failed to open file",
};

export function translate(text: string, language: Language): string {
  if (language === "en") {
    const exact = ENGLISH_OVERRIDES[text];
    if (exact) return exact;
    const colon = text.indexOf(":");
    if (colon > 0) {
      const mapped = ENGLISH_OVERRIDES[text.slice(0, colon + 1)];
      if (mapped) return mapped + text.slice(colon + 1);
    }
    return text;
  }

  const exact = INDONESIAN[text];
  if (exact) return exact;

  // Pesan dinamis seperti "Failed to sync document: <detail>"
  const colon = text.indexOf(":");
  if (colon > 0) {
    const prefix = text.slice(0, colon + 1);
    const mapped = INDONESIAN[prefix];
    if (mapped) return mapped + text.slice(colon + 1);
  }

  // Potongan teks JSX yang punya spasi di awal atau akhir
  const trimmed = text.trim();
  if (trimmed !== text) {
    const mapped = INDONESIAN[trimmed];
    if (mapped) {
      const start = text.indexOf(trimmed);
      return text.slice(0, start) + mapped + text.slice(start + trimmed.length);
    }
  }

  return text;
}

/** Terjemahkan turunan JSX secara rekursif tanpa mengubah struktur komponen. */
export function translateNode(node: React.ReactNode, language: Language): React.ReactNode {
  if (typeof node === "string") {
    return translate(node, language);
  }
  if (Array.isArray(node)) {
    return node.map((child, index) =>
      React.createElement(
        React.Fragment,
        { key: index },
        translateNode(child, language)
      )
    );
  }
  if (React.isValidElement(node)) {
    const props: Record<string, unknown> = { ...(node.props as Record<string, unknown>) };
    for (const key of ["title", "placeholder", "alt", "aria-label"]) {
      if (typeof props[key] === "string") {
        props[key] = translate(props[key] as string, language);
      }
    }
    if ("children" in props) {
      props.children = translateNode(props.children as React.ReactNode, language);
    }
    return React.cloneElement(node as React.ReactElement<Record<string, unknown>>, props);
  }
  return node;
}
