use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

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

    /// Mulai local loopback server pada port 8585 dan tunggu authorization code
    pub async fn start_oauth_flow(
        client_id: &str,
        client_secret: &str,
    ) -> Result<OAuthTokenResponse, String> {
        let listener = TcpListener::bind("127.0.0.1:8585")
            .await
            .map_err(|e| format!("Gagal membuka port loopback 8585: {}. Pastikan port tidak terpakai.", e))?;

        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://127.0.0.1:8585/callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent",
            client_id
        );

        // Buka browser pengguna
        let _ = open::that(&auth_url);

        // Tunggu koneksi dari browser dengan timeout 2 menit
        let code = tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((mut stream, _)) => {
                        let mut buffer = [0u8; 2048];
                        let n = stream.read(&mut buffer).await.unwrap_or(0);
                        let request_str = String::from_utf8_lossy(&buffer[..n]);

                        // Ekstrak code dari URL path "?code=..."
                        let mut extracted_code = None;
                        if let Some(pos) = request_str.find("code=") {
                            let after = &request_str[pos + 5..];
                            let end = after.find('&').or_else(|| after.find(' ')).unwrap_or(after.len());
                            let c = &after[..end];
                            extracted_code = Some(urlencoding::decode(c).unwrap_or_else(|_| c.into()).to_string());
                        }

                        let response_html = if extracted_code.is_some() {
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>&#x2705; EyeDoc Berhasil Terhubung ke Google Drive!</h2><p>Silakan tutup tab ini dan kembali ke aplikasi EyeDoc.</p></body></html>"
                        } else {
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h2>Gagal memperoleh authorization code.</h2></body></html>"
                        };

                        let _ = stream.write_all(response_html.as_bytes()).await;
                        let _ = stream.flush().await;

                        extracted_code.ok_or_else(|| "Authorization code tidak ditemukan pada respon callback".to_string())?
                    }
                    Err(e) => return Err(format!("Gagal menerima respon browser: {}", e)),
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(120)) => {
                return Err("Timeout menunggu otorisasi Google OAuth (2 menit)".to_string());
            }
        };

        // Tukar code dengan token
        let client = reqwest::Client::new();
        let params = [
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", "http://127.0.0.1:8585/callback"),
            ("grant_type", "authorization_code"),
        ];

        let token_resp = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Gagal menukar token dengan Google: {}", e))?;

        if !token_resp.status().is_success() {
            let err_body = token_resp.text().await.unwrap_or_default();
            return Err(format!("Google menolak otorisasi token: {}", err_body));
        }

        let token_data: OAuthTokenResponse = token_resp
            .json()
            .await
            .map_err(|e| format!("Gagal memproses JSON token: {}", e))?;

        Ok(token_data)
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
