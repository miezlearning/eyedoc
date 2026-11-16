
# Product Requirements Document (PRD): Word Cloud Auto-Sync

## 1. Project Overview
**Word Cloud Auto-Sync** adalah aplikasi desktop ringan (Windows) berbasis **Rust + Tauri v2** yang berjalan di latar belakang (*System Tray*). Aplikasi ini memantau folder kerja Microsoft Word secara *real-time*, menganalisis perubahan konten pada file `.docx` setiap kali pengguna menekan simpan (`Ctrl + S`), menamai file secara otomatis berdasarkan pola versi/tanggal, dan mengunggahnya ke **GitHub Repository** atau **Google Drive** sesuai pilihan pengguna.

### Target Audience
Mahasiswa (penulis skripsi/tugas akhir), peneliti, dan penulis dokumen yang membutuhkan pencadangan otomatis (*versioning*) tanpa perlu mengganti nama file secara manual atau mengunggah ulang ke *cloud* berulang kali.

---

## 2. Tech Stack & Architecture
* **Core Backend & Watcher:** Rust (`tokio`, `notify`, `zip`, `quick-xml`, `reqwest`, `serde`, `chrono`)
* **Desktop Framework & Installer:** Tauri v2 (menggunakan WebView2 bawaan Windows, menghasilkan `.exe` dan `.msi` installer ringan < 15 MB)
* **Frontend UI:** HTML/CSS/TypeScript (React atau SvelteKit dengan Tailwind CSS)
* **Local Storage:** JSON config (`config.json` di AppData) + SQLite/JSON queue untuk *offline sync*

---

## 3. Scope & Exclusions
* **In-Scope:** Pemantauan file `.docx`, analisis selisih kata/heading XML, penamaan file dinamis, upload ke GitHub & Google Drive, penandaan *Milestone*, *offline queue*, *retention policy*, dan berjalan di *System Tray*.
* **Out-of-Scope (Excluded):** Konversi otomatis `.docx` ke `.pdf` **tidak disertakan** untuk menjaga aplikasi tetap mandiri tanpa dependensi eksternal (Microsoft Word COM / LibreOffice).

---

## 4. Functional Requirements

### F1. Real-Time File Watcher & Debouncing
* Aplikasi memantau folder pilihan pengguna (termasuk sub-folder secara rekursif) menggunakan crate `notify`.
* Hanya memproses ekstensi `.docx` dan **wajib mengabaikan** file sementara Microsoft Word yang diawali karakter `~$`.
* **Debounce Mechanism:** Abaikan *event* modifikasi berulang pada file yang sama dalam rentang waktu **3 detik** untuk mencegah *duplicate upload* akibat perilaku penyimpanan bertahap MS Word.
* Berikan jeda aman (`800ms - 1000ms`) setelah *event* terdeteksi sebelum membaca file agar *file lock* dari MS Word sudah dilepas.

### F2. Smart Content Analyzer (Auto-Changelog)
* Ekstrak `word/document.xml` dari dalam arsip `.docx` menggunakan crate `zip` dan `quick-xml` (tanpa dependensi eksternal).
* Hitung total jumlah kata dan ekstrak teks *Heading* terakhir yang dimodifikasi.
* Bandingkan dengan *state* versi sebelumnya untuk menghasilkan pesan *changelog* otomatis (digunakan sebagai pesan *commit* GitHub atau *description* file di Google Drive):
  * *Contoh:* `"Revisi v04: Menambah 185 kata pada bagian Metodologi Penelitian (Total: 4.320 kata)"`

### F3. Smart Naming & Auto-Folder
* Pengguna dapat memilih atau menyesuaikan pola penamaan file *backup*:
  * Default: `{NamaFile}_v{Versi:02}_{DDMMMYYYY}_{HHmm}.docx` (Contoh: `Skripsi_Bab1_v04_16Nov2026_1845.docx`).
* Opsi pengelompokan folder otomatis di tujuan *cloud* berdasarkan Bulan/Tahun (misal: `Backups/Nov_2026/`).

### F4. Multi-Cloud Integration (User Choice)
Pengguna dapat memilih salah satu atau mengaktifkan keduanya melalui UI:
1. **GitHub Integration:**
   * Autentikasi menggunakan **Personal Access Token (PAT)** atau **GitHub OAuth Device Flow**.
   * Upload/update file via GitHub REST API (`PUT /repos/{owner}/{repo}/contents/{path}`) menggunakan Base64 encoding dan *auto-generated changelog* sebagai *commit message*.
2. **Google Drive Integration:**
   * Autentikasi menggunakan **Google OAuth 2.0** (Desktop App flow dengan local loopback server untuk menangkap *authorization code* secara otomatis dan menyimpan `refresh_token`).
   * Upload file via Google Drive API v3 (`multipart/related`) lengkap dengan metadata `description` berisi *changelog* dan target `folder_id` opsional.

### F5. Milestone / Snapshot Tagging ("ACC Dosen")
* Menyediakan tombol **"Simpan Milestone"** di UI utama serta opsi *global shortcut* (misal: `Ctrl + Shift + M`).
* Membuka dialog input catatan singkat (contoh: `"Revisi setelah bimbingan 1"`).
* Menyimpan salinan versi saat ini dengan label khusus: `{NamaFile}_v{Versi:02}_[MILESTONE_{Catatan}].docx`.
* File bertanda *Milestone* dikecualikan dari penghapusan otomatis (*Retention Policy*).

### F6. Offline Queue & Auto-Retry
* Jika perangkat tidak terhubung ke internet saat `Ctrl + S` ditekan, salin file `.docx` ke direktori lokal sementara (`AppData/queue/`) beserta metadata JSON (*timestamp*, nama versi, *changelog*).
* *Background worker* mengecek konektivitas setiap 15 detik; saat internet kembali aktif, unggah seluruh antrean secara berurutan (FIFO) dan hapus salinan lokal setelah sukses.

### F7. Retention Policy (Smart Cleanup)
* Pengaturan batas penyimpanan di *cloud* (misal: *"Simpan maksimal N versi terbaru"*, default: 25 versi).
* Jika jumlah file *backup* reguler melebihi batas, aplikasi menghapus file reguler tertua via API, **kecuali** file yang memiliki tag `[MILESTONE]`.

### F8. System Tray & Desktop UX
* Aplikasi dapat diminimalkan ke *Windows System Tray* (ikon dekat jam) agar tidak memenuhi *taskbar*.
* Menu klik kanan pada ikon *System Tray*: **Buka Dashboard**, **Simpan Milestone Cepat**, **Pause/Resume Sync**, dan **Keluar**.
* Opsi *"Jalankan otomatis saat Windows menyala"* (*Auto-start on boot* via Tauri plugin `autostart`).
* *Toast notification* ringan saat upload berhasil/gagal (dapat dimatikan di pengaturan).

---

## 5. Non-Functional Requirements
* **Performance:** Penggunaan RAM saat *idle* di *background* harus di bawah **40 MB**; penggunaan CPU mendekati **0%** saat tidak ada aktivitas penyimpanan file.
* **Security:** Token akses (GitHub PAT & Google OAuth Refresh Token) disimpan secara aman di penyimpanan lokal sistem (Windows Credential Manager atau file konfigurasi terenkripsi di `AppData`).
* **Build & Distribution:** Dapat dikompilasi menjadi satu paket installer Windows (`.msi` dan `Setup.exe`) melalui perintah `cargo tauri build`.

---

## 6. Suggested Directory Structure
```text
word-cloud-sync/
├── src/                      # Frontend UI (Dashboard, Settings, Logs, Milestone Modal)
├── src-tauri/
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri config, System Tray, & Windows Installer settings
│   └── src/
│       ├── main.rs           # Entry point
│       ├── lib.rs            # Tauri commands & state management
│       ├── watcher.rs        # File system watcher & debouncer
│       ├── docx_parser.rs    # ZIP + XML word counter & heading extractor
│       ├── github.rs         # GitHub REST API client
│       ├── gdrive.rs         # Google Drive OAuth & Multipart upload client
│       └── queue.rs          # Offline queue & retention cleanup manager
└── PRD.md

```

---

## 7. Implementation Milestones (For Coding Agent)

1. **Phase 1 (Core Engine):** Inisialisasi Tauri v2, implementasi `watcher.rs` (filter `.docx`, abaikan `~$`, *debounce* 3s) dan `docx_parser.rs` (hitung kata & ekstrak *heading*).
2. **Phase 2 (Cloud Connectors):** Implementasi modul `github.rs` dan `gdrive.rs` (OAuth loopback + upload), serta koneksi ke state UI.
3. **Phase 3 (Resilience & Smart Features):** Implementasi `queue.rs` (*offline sync* & *retention policy*) serta fitur *Milestone Tagging*.
4. **Phase 4 (UX & Packaging):** Konfigurasi *System Tray*, *autostart*, notifikasi, dan pengujian build installer Windows (`cargo tauri build`).

