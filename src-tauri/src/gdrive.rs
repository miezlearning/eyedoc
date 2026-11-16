use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;

/// Kredensial OAuth opsional bisa disuntikkan saat build lewat environment variable.
/// Tidak ada nilai bawaan yang ditanam di source, supaya tidak memicu secret scanning.
pub fn default_gdrive_client_id() -> Option<&'static str> {
    option_env!("EYEDOC_GDRIVE_CLIENT_ID")
}

pub fn default_gdrive_client_secret() -> Option<&'static str> {
    option_env!("EYEDOC_GDRIVE_CLIENT_SECRET")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GDriveFileItem {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdTime")]
    pub created_time: Option<String>,
    #[serde(rename = "webViewLink")]
    pub web_view_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GDriveFileListResponse {
    pub files: Option<Vec<GDriveFileItem>>,
}

pub struct GDriveClient {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub access_token: String,
    http: reqwest::Client,
}

impl GDriveClient {
    pub fn new(
        client_id: String,
        client_secret: String,
        refresh_token: String,
        access_token: String,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            refresh_token,
            access_token,
            http: reqwest::Client::new(),
        }
    }

    /// Mulai alur OAuth Google dengan loopback server sementara.
    ///
    /// Redirect URI dibuat dari port yang benar-benar dipakai. Untuk OAuth client
    /// bertipe "Desktop app" di Google Cloud, semua port loopback diizinkan.
    /// Untuk tipe "Web application", URI ini harus didaftarkan manual di Credentials.
    pub async fn start_oauth_flow(
        client_id: &str,
        client_secret: &str,
    ) -> Result<OAuthTokenResponse, String> {
        if client_id.trim().is_empty() || client_secret.trim().is_empty() {
            return Err(
                "Google Client ID dan Client Secret belum diisi. Buka Pengaturan → Integrasi Google Drive → Kredensial Kustom Google Cloud Console."
                    .to_string(),
            );
        }

        // 1. Listener loopback. Port 8585 dipakai jika kosong, kalau tidak pakai port acak.
        const PREFERRED_PORT: u16 = 8585;
        let listener = match TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).await {
            Ok(l) => l,
            Err(_) => TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| format!("Gagal membuka port loopback untuk OAuth: {e}"))?,
        };
        let port = listener
            .local_addr()
            .map_err(|e| format!("Gagal membaca alamat listener OAuth: {e}"))?
            .port();
        let redirect_uri = format!("http://127.0.0.1:{port}/");

        // 2. State (CSRF) + PKCE S256 supaya callback tidak bisa dipalsukan.
        let state = random_urlsafe_token();
        let code_verifier = random_urlsafe_token();
        let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));

        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}&code_challenge={}&code_challenge_method=S256",
            urlencoding::encode(client_id),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode("https://www.googleapis.com/auth/drive.file email profile"),
            urlencoding::encode(&state),
            urlencoding::encode(&code_challenge),
        );

        // 3. Buka browser. Kalau gagal, sertakan URL supaya bisa dibuka manual.
        open::that(&auth_url).map_err(|e| {
            format!("Gagal membuka browser untuk otorisasi Google: {e}. Buka manual: {auth_url}")
        })?;

        // 4. Terima request balik sampai dapat code/error atau timeout.
        const TIMEOUT: Duration = Duration::from_secs(180);
        let deadline = Instant::now() + TIMEOUT;
        let mut callback: Option<HashMap<String, String>> = None;

        while callback.is_none() {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(format!(
                    "Timeout menunggu otorisasi Google (3 menit). Pastikan browser diarahkan kembali ke {redirect_uri}."
                ));
            }

            let (mut stream, _) = match timeout(remaining, listener.accept()).await {
                Ok(Ok(pair)) => pair,
                Ok(Err(e)) => return Err(format!("Gagal menerima koneksi balik dari browser: {e}")),
                Err(_) => continue,
            };

            let head = read_request_head(&mut stream).await;
            let request_line = head.lines().next().unwrap_or("").trim();
            let target = request_line.split_whitespace().nth(1).unwrap_or("");
            let (path, query) = target.split_once('?').unwrap_or((target, ""));
            let params = parse_query(query);

            // Browser bisa menanyakan /favicon.ico dulu — jangan dianggap callback.
            if (path == "/" || path == "/callback")
                && (params.contains_key("code") || params.contains_key("error"))
            {
                callback = Some(params);
            }

            let body = if callback.is_some() {
                SUCCESS_PAGE
            } else {
                ""
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.flush().await;
        }

        let params = callback.ok_or_else(|| "Callback OAuth tidak diterima".to_string())?;

        // 5. Tangani error dari Google dengan pesan yang bisa ditindaklanjuti.
        if let Some(err_code) = params.get("error") {
            let description = params
                .get("error_description")
                .map(String::as_str)
                .unwrap_or("");
            return Err(oauth_error_message(err_code, description, &redirect_uri));
        }

        let code = params
            .get("code")
            .filter(|c| !c.is_empty())
            .ok_or_else(|| "Google tidak mengembalikan authorization code.".to_string())?;

        if params.get("state").map(String::as_str) != Some(state.as_str()) {
            return Err(
                "Parameter state OAuth tidak cocok. Otorisasi dibatalkan demi keamanan."
                    .to_string(),
            );
        }

        // 6. Tukar code menjadi token (dengan PKCE verifier).
        let form = [
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier.as_str()),
        ];

        let token_resp = reqwest::Client::new()
            .post("https://oauth2.googleapis.com/token")
            .form(&form)
            .send()
            .await
            .map_err(|e| format!("Gagal menukar token dengan Google: {e}"))?;

        if !token_resp.status().is_success() {
            let err_body = token_resp.text().await.unwrap_or_default();
            return Err(format!("Google menolak penukaran token: {err_body}"));
        }

        token_resp
            .json::<OAuthTokenResponse>()
            .await
            .map_err(|e| format!("Gagal memproses JSON token: {e}"))
    }

    /// Refresh token jika access_token kedaluwarsa
    pub async fn ensure_access_token(&mut self) -> Result<String, String> {
        if self.refresh_token.is_empty() {
            if !self.access_token.is_empty() {
                return Ok(self.access_token.clone());
            }
            return Err("Google Drive refresh_token belum tersedia. Harap hubungkan akun Google Drive terlebih dahulu.".to_string());
        }

        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("refresh_token", self.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let resp = self
            .http
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi Google token refresher: {}", e))?;

        if resp.status().is_success() {
            let token_data: OAuthTokenResponse = resp
                .json()
                .await
                .map_err(|e| format!("Gagal memproses JSON refresh token: {}", e))?;
            self.access_token = token_data.access_token.clone();
            Ok(token_data.access_token)
        } else {
            // Jika token lama masih ada, coba gunakan
            if !self.access_token.is_empty() {
                Ok(self.access_token.clone())
            } else {
                let err_text = resp.text().await.unwrap_or_default();
                Err(format!("Gagal me-refresh Google access token: {}", err_text))
            }
        }
    }

    /// Upload file via Multipart/related ke Google Drive v3
    pub async fn upload_file(
        &mut self,
        filename: &str,
        file_bytes: &[u8],
        changelog: &str,
        folder_id: Option<&str>,
    ) -> Result<GDriveFileItem, String> {
        let token = self.ensure_access_token().await?;

        let boundary = "-------EyeDocBoundaryMultiPartUpload";
        let delimiter = format!("\r\n--{}\r\n", boundary);
        let close_delimiter = format!("\r\n--{}--", boundary);

        let mut metadata_obj = serde_json::json!({
            "name": filename,
            "description": changelog,
        });

        if let Some(fid) = folder_id {
            if !fid.trim().is_empty() {
                metadata_obj["parents"] = serde_json::json!([fid]);
            }
        }

        let metadata_str = metadata_obj.to_string();

        let mut body: Vec<u8> = Vec::new();
        // Part 1: Metadata
        body.extend_from_slice(delimiter.as_bytes());
        body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
        body.extend_from_slice(metadata_str.as_bytes());

        // Part 2: Media
        body.extend_from_slice(delimiter.as_bytes());
        body.extend_from_slice(b"Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n");
        body.extend_from_slice(file_bytes);

        // Close
        body.extend_from_slice(close_delimiter.as_bytes());

        let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,webViewLink";

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token))
                .map_err(|e| format!("Header invalid: {}", e))?,
        );
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_str(&format!("multipart/related; boundary={}", boundary))
                .map_err(|e| format!("Header invalid: {}", e))?,
        );

        let resp = self
            .http
            .post(url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Gagal mengunggah file ke Google Drive: {}", e))?;

        if resp.status().is_success() {
            let item: GDriveFileItem = resp
                .json()
                .await
                .map_err(|e| format!("Gagal memproses respon upload Drive: {}", e))?;
            Ok(item)
        } else {
            let err_text = resp.text().await.unwrap_or_default();
            Err(format!("Google Drive API menolak upload: {}", err_text))
        }
    }

    /// Terapkan retention policy: hapus file lama melebihi limit (kecuali milestone)
    pub async fn apply_retention(
        &mut self,
        folder_id: Option<&str>,
        limit: usize,
    ) -> Result<usize, String> {
        if limit == 0 {
            return Ok(0);
        }

        let token = self.ensure_access_token().await?;

        let mut query = "trashed = false and name contains '.docx' and not name contains '[MILESTONE'".to_string();
        if let Some(fid) = folder_id {
            if !fid.trim().is_empty() {
                query = format!("'{}' in parents and {}", fid, query);
            }
        }

        let url = format!(
            "https://www.googleapis.com/drive/v3/files?q={}&orderBy=createdTime asc&fields=files(id,name,createdTime)",
            urlencoding::encode(&query)
        );

        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Gagal membaca daftar file Drive: {}", e))?;

        if !resp.status().is_success() {
            return Ok(0);
        }

        let list_resp: GDriveFileListResponse = resp.json().await.unwrap_or(GDriveFileListResponse { files: None });
        let files = list_resp.files.unwrap_or_default();

        let mut deleted_count = 0;
        if files.len() > limit {
            let excess = files.len() - limit;
            for file in files.iter().take(excess) {
                let del_url = format!("https://www.googleapis.com/drive/v3/files/{}", file.id);
                let del_res = self
                    .http
                    .delete(&del_url)
                    .header(AUTHORIZATION, format!("Bearer {}", token))
                    .send()
                    .await;
                if let Ok(res) = del_res {
                    if res.status().is_success() {
                        deleted_count += 1;
                    }
                }
            }
        }

        Ok(deleted_count)
    }
}

const SUCCESS_PAGE: &str = "<html><body style='font-family:sans-serif;text-align:center;padding:50px'><h2>&#x2705; EyeDoc berhasil terhubung ke Google Drive</h2><p>Silakan tutup tab ini dan kembali ke aplikasi EyeDoc.</p></body></html>";

/// Token acak 32 byte (43 karakter base64url) untuk `state` dan PKCE verifier.
fn random_urlsafe_token() -> String {
    let a = uuid::Uuid::new_v4();
    let b = uuid::Uuid::new_v4();
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(a.as_bytes());
    bytes[16..].copy_from_slice(b.as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}

fn decode_component(value: &str) -> String {
    let replaced = value.replace('+', " ");
    urlencoding::decode(&replaced)
        .map(|c| c.into_owned())
        .unwrap_or(replaced)
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        params.insert(decode_component(key), decode_component(value));
    }
    params
}

/// Baca header HTTP sampai `\r\n\r\n` dengan batas waktu supaya tidak menggantung.
async fn read_request_head(stream: &mut TcpStream) -> String {
    let mut buffer = [0u8; 2048];
    let mut data = Vec::with_capacity(2048);
    loop {
        match timeout(Duration::from_secs(5), stream.read(&mut buffer)).await {
            Ok(Ok(0)) | Ok(Err(_)) | Err(_) => break,
            Ok(Ok(n)) => {
                data.extend_from_slice(&buffer[..n]);
                if data.windows(4).any(|w| w == b"\r\n\r\n") || data.len() >= 8192 {
                    break;
                }
            }
        }
    }
    String::from_utf8_lossy(&data).into_owned()
}

fn oauth_error_message(code: &str, description: &str, redirect_uri: &str) -> String {
    match code {
        "access_denied" => "Otorisasi Google dibatalkan oleh pengguna.".to_string(),
        "redirect_uri_mismatch" => format!(
            "Google menolak redirect URI. Daftarkan '{redirect_uri}' di Google Cloud Console → APIs & Services → Credentials → OAuth client → Authorized redirect URIs. Untuk client bertipe 'Web application', port harus sama persis. Detail: {description}"
        ),
        "invalid_client" | "unauthorized_client" => format!(
            "Google menolak kredensial OAuth ({code}). Pastikan Client ID dan Secret berasal dari project yang sama dan OAuth consent screen tidak dalam status 'Testing/blocked'. Detail: {description}"
        ),
        _ => format!("Google menolak otorisasi: {code}. {description}"),
    }
}
