# EyeDoc - Word Cloud Auto-Sync

EyeDoc adalah aplikasi desktop pintar berbasis **Tauri v2 + Rust + React** yang memantau dokumen Microsoft Word (`.docx`) yang sedang Anda kerjakan secara *real-time*. Setiap kali Anda menekan `Ctrl + S`, EyeDoc secara otomatis mendeteksi perubahan, menganalisis penambahan kata dan heading dokumen, menghasilkan ringkasan revisi (*auto-changelog*), serta menyinkronkan berkas versi baru ke **GitHub** dan/atau **Google Drive**.

---

## Fitur Utama

- **Real-Time Docx File Watcher:** Memantau folder kerja secara rekursif menggunakan library native Rust `notify` dengan debounce 3 detik dan pengabaian file temporary Word (`~$*.docx`).
- **Zero Heavy Dependencies:** Ekstraksi struktur XML Word (`word/document.xml`) langsung menggunakan dekompresi ZIP dan parser XML cepat (`quick-xml`). Tanpa ketergantungan COM Microsoft Word atau LibreOffice.
- **Smart Heading & Word Analyzer:** Mendeteksi heading bab/sub-bab terakhir yang sedang dikerjakan dan menghitung selisih kata secara akurat.
- **Automated Changelogs:** Menghasilkan catatan revisi otomatis (misal: *"Revisi v03: Menambah 85 kata pada bagian BAB II TINJAUAN PUSTAKA"*).
- **Multi-Cloud Sync:**
  - **GitHub:** Sinkronisasi file via GitHub REST API dengan Personal Access Token (PAT).
  - **Google Drive:** Alur otentikasi OAuth 2.0 Desktop dengan server loopback lokal (`127.0.0.1:8585/callback`), refresh token otomatis, dan upload multipart.
- **Milestone Snapshot:** Fitur "Simpan Milestone" untuk membekukan versi penting (misalnya persetujuan dosen *"ACC Dosen"*) yang dilindungi secara permanen dari pembersihan retensi.
- **Offline Queue System:** Bila koneksi internet terputus, salinan berkas dan metadata disimpan di antrean lokal (`%APPDATA%\eyedoc\queue`) dan secara otomatis disinkronkan kembali saat koneksi pulih (auto-retry worker setiap 15 detik).
- **Smart Retention Policy:** Menjaga kebersihan penyimpanan cloud dengan mempertahankan jumlah versi terbaru sesuai batas yang ditentukan (default 25 versi), dengan pengecualian versi *Milestone*.
- **System Tray & Desktop UI:** Berjalan di latar belakang dengan icon system tray dan antarmuka gelap modern (*dark mode*) berbasis React.

---

## Arsitektur Sistem

```
+-------------------------------------------------------------+
|                 Microsoft Word (.docx)                      |
|                  User presses Ctrl + S                      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               EyeDoc Native Watcher Engine                  |
|  - 3-second Debounce                                        |
|  - 900ms Lock Release Delay                                 |
|  - Ignore ~$*.docx temporary lock files                     |
|  - SHA-256 Hash Check (Prevent redundant uploads)           |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 Pure Rust Docx Analyzer                     |
|  - Unpack word/document.xml (ZipArchive)                    |
|  - quick-xml event reader for w:p, w:t, w:pStyle            |
|  - Calculate Word Count & Detect Active Heading             |
|  - Generate Auto Changelog                                  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                    Cloud Upload Router                      |
|            (Based on User Enabled Destinations)             |
+------------------------------+------------------------------+
               |                               |
               v                               v
+------------------------------+ +------------------------------+
|       GitHub REST API        | |     Google Drive API         |
| - Base64 Content Encoding    | | - OAuth 2.0 Loopback Auth    |
| - Commit message changelog   | | - Multipart File Upload      |
| - Prune old non-milestones   | | - Prune old non-milestones   |
+------------------------------+ +------------------------------+
               |                               |
               +---------------+---------------+
                               |
                   (If Network Fails / Offline)
                               v
+-------------------------------------------------------------+
|                     Offline Queue Engine                    |
|  - Store payload & copy in %APPDATA%/eyedoc/queue           |
|  - Background Worker probes internet every 15s              |
|  - FIFO Auto-retry Upload                                   |
+-------------------------------------------------------------+
```

---

## Menjalankan Aplikasi

### Mode Pengembangan (Dev Mode)
Pastikan Node.js dan Rust toolchain telah terpasang:
```bash
# Instal dependensi frontend
npm install

# Jalankan aplikasi Tauri
npm run tauri dev
```

### Menjalankan Binary Langsung
Aplikasi yang sudah dikompilasi dapat langsung dijalankan:
```powershell
.\src-tauri\target\debug\eyedoc.exe
```

---

## Panduan Pengaturan

1. **Folder Dokumen:** Di tab *Pengaturan*, klik tombol **"Pilih Folder"** dan pilih folder tempat Anda menyimpan dokumen Word skripsi/tesis/laporan.
2. **Koneksi GitHub:**
   - Masukkan Personal Access Token (PAT) GitHub yang memiliki hak akses `repo`.
   - Masukkan Username/Owner dan Nama Repository (misal: `username/skripsi-backup`).
3. **Koneksi Google Drive:**
   - Buat OAuth 2.0 Client ID jenis "Desktop Application" di Google Cloud Console.
   - Masukkan Client ID & Client Secret ke kolom pengaturan EyeDoc.
   - Klik **"Hubungkan Google Drive"** untuk melakukan otentikasi melalui browser.
4. **Simpan Milestone:** Setiap kali mendapatkan feedback atau revisi penting dari dosen/atasan, klik tombol **"Simpan Milestone"** di Dashboard untuk menyimpan checkpoint berlabel permanen.
