use base64::prelude::*;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

/// OAuth app publik milik GitHub CLI. ID ini sengaja dipublikasikan dan aman ditanam di aplikasi desktop.
pub const DEFAULT_GITHUB_CLIENT_ID: &str = "178c6fc778ccc68e1d6a";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct GitHubAuthResult {
    pub token: String,
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GithubContentResponse {
    sha: Option<String>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    name: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CommitFileBody {
    message: String,
    content: String,
    branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sha: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteFileBody {
    message: String,
    sha: String,
    branch: String,
}

pub struct GitHubClient {
    token: String,
    owner: String,
    repo: String,
    branch: String,
    client: reqwest::Client,
}

impl GitHubClient {
    pub fn new(token: String, owner: String, repo: String, branch: String) -> Self {
        Self {
            token,
            owner,
            repo,
            branch: if branch.is_empty() {
                "main".to_string()
            } else {
                branch
            },
            client: reqwest::Client::new(),
        }
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("EyeDoc-App"));
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", self.token)) {
            headers.insert(AUTHORIZATION, val);
        }
        headers
    }

    pub async fn test_connection(&self) -> Result<String, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}",
            self.owner, self.repo
        );
        let resp = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi GitHub: {}", e))?;

        if resp.status().is_success() {
            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Gagal parse respon: {}", e))?;
            let full_name = json["full_name"]
                .as_str()
                .unwrap_or("Repository valid")
                .to_string();
            Ok(full_name)
        } else {
            let err_text = resp.text().await.unwrap_or_default();
            Err(format!("Autentikasi/Repo GitHub gagal: {}", err_text))
        }
    }

    pub async fn get_file_sha(&self, path: &str) -> Result<Option<String>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            self.owner, self.repo, path, self.branch
        );
        let resp = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Request file SHA error: {}", e))?;

        if resp.status().as_u16() == 404 {
            return Ok(None);
        }

        if resp.status().is_success() {
            let content_resp: GithubContentResponse = resp
                .json()
                .await
                .map_err(|e| format!("Gagal parse file response: {}", e))?;
            Ok(content_resp.sha)
        } else {
            Ok(None)
        }
    }

    pub async fn upload_file(
        &self,
        path: &str,
        file_bytes: &[u8],
        commit_message: &str,
    ) -> Result<String, String> {
        let existing_sha = self.get_file_sha(path).await?;
        let base64_content = BASE64_STANDARD.encode(file_bytes);

        let body = CommitFileBody {
            message: commit_message.to_string(),
            content: base64_content,
            branch: self.branch.clone(),
            sha: existing_sha,
        };

        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            self.owner, self.repo, path
        );
        let resp = self
            .client
            .put(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gagal mengunggah ke GitHub: {}", e))?;

        if resp.status().is_success() {
            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Gagal membaca respon commit: {}", e))?;
            let html_url = json["content"]["html_url"]
                .as_str()
                .unwrap_or("")
                .to_string();
            Ok(html_url)
        } else {
            let err_text = resp.text().await.unwrap_or_default();
            Err(format!("GitHub upload ditolak: {}", err_text))
        }
    }

    /// Retention policy: hapus file backup lama jika melebihi batas (KECUALI MILESTONE)
    pub async fn apply_retention(
        &self,
        folder_path: &str,
        limit: usize,
    ) -> Result<usize, String> {
        if limit == 0 {
            return Ok(0);
        }

        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            self.owner, self.repo, folder_path, self.branch
        );
        let resp = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Gagal membaca folder GitHub: {}", e))?;

        if !resp.status().is_success() {
            return Ok(0);
        }

        let items: Vec<GithubContentResponse> = resp
            .json()
            .await
            .map_err(|e| format!("Gagal parse daftar file: {}", e))?;

        // Filter: hanya file docx dan bukan milestone
        let mut regular_files: Vec<GithubContentResponse> = items
            .into_iter()
            .filter(|item| {
                if let (Some(t), Some(name)) = (&item.item_type, &item.name) {
                    t == "file" && name.ends_with(".docx") && !name.contains("[MILESTONE")
                } else {
                    false
                }
            })
            .collect();

        // Sort ascending berdasarkan nama (karena penamaan v01, v02 berurutan secara alfabetis)
        regular_files.sort_by(|a, b| a.name.cmp(&b.name));

        let mut deleted_count = 0;
        if regular_files.len() > limit {
            let excess = regular_files.len() - limit;
            for item in regular_files.iter().take(excess) {
                if let (Some(path), Some(sha)) = (&item.path, &item.sha) {
                    let del_url = format!(
                        "https://api.github.com/repos/{}/{}/contents/{}",
                        self.owner, self.repo, path
                    );
                    let body = DeleteFileBody {
                        message: "EyeDoc: Auto retention cleanup".to_string(),
                        sha: sha.clone(),
                        branch: self.branch.clone(),
                    };
                    let del_resp = self
                        .client
                        .delete(&del_url)
                        .headers(self.headers())
                        .json(&body)
                        .send()
                        .await;

                    if let Ok(res) = del_resp {
                        if res.status().is_success() {
                            deleted_count += 1;
                        }
                    }
                }
            }
        }

        Ok(deleted_count)
    }

    /// Step 1: Minta device code dari GitHub untuk alur 1-Klik SSO Device Flow
    pub async fn request_device_code(client_id_opt: Option<&str>) -> Result<DeviceCodeResponse, String> {
        let client_id = client_id_opt.unwrap_or(DEFAULT_GITHUB_CLIENT_ID);
        let client = reqwest::Client::new();
        let resp = client
            .post("https://github.com/login/device/code")
            .header(ACCEPT, "application/json")
            .header(USER_AGENT, "EyeDoc-App")
            .form(&[
                ("client_id", client_id),
                ("scope", "repo,read:user"),
            ])
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi GitHub: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let txt = resp.text().await.unwrap_or_default();
            if status == reqwest::StatusCode::NOT_FOUND {
                return Err(format!(
                    "GitHub tidak mengenali client ID OAuth aplikasi (404). Perbarui aplikasi ke versi terbaru. Detail: {txt}"
                ));
            }
            return Err(format!("GitHub device code error: {}", txt));
        }

        let device_resp: DeviceCodeResponse = resp
            .json()
            .await
            .map_err(|e| format!("Gagal memproses respon GitHub: {}", e))?;

        Ok(device_resp)
    }

    /// Step 2: Polling sampai pengguna selesai klik Authorize di browser
    pub async fn poll_for_token(
        client_id_opt: Option<&str>,
        device_code: &str,
        interval_secs: u64,
        expires_in: u64,
    ) -> Result<String, String> {
        let client_id = client_id_opt.unwrap_or(DEFAULT_GITHUB_CLIENT_ID);
        let client = reqwest::Client::new();
        let start_time = std::time::Instant::now();
        let poll_interval = std::cmp::max(interval_secs, 5);

        loop {
            if start_time.elapsed().as_secs() > expires_in {
                return Err("Waktu otorisasi GitHub telah habis. Silakan coba lagi.".to_string());
            }

            tokio::time::sleep(std::time::Duration::from_secs(poll_interval)).await;

            let resp = client
                .post("https://github.com/login/oauth/access_token")
                .header(ACCEPT, "application/json")
                .header(USER_AGENT, "EyeDoc-App")
                .form(&[
                    ("client_id", client_id),
                    ("device_code", device_code),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ])
                .send()
                .await
                .map_err(|e| format!("Koneksi ke GitHub terputus: {}", e))?;

            if resp.status().is_success() {
                let json: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| format!("Gagal membaca token: {}", e))?;

                if let Some(token) = json.get("access_token").and_then(|t| t.as_str()) {
                    return Ok(token.to_string());
                } else if let Some(err) = json.get("error").and_then(|e| e.as_str()) {
                    match err {
                        "authorization_pending" => {
                            continue;
                        }
                        "slow_down" => {
                            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                            continue;
                        }
                        "expired_token" => {
                            return Err("Kode otorisasi telah kedaluwarsa. Silakan login ulang.".to_string());
                        }
                        "access_denied" => {
                            return Err("Otorisasi ditolak oleh pengguna.".to_string());
                        }
                        _ => return Err(format!("Error otorisasi GitHub: {}", err)),
                    }
                }
            }
        }
    }

    /// Ambil profil pengguna (login username) dari GitHub
    pub async fn fetch_user_info(token: &str) -> Result<GitHubUser, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get("https://api.github.com/user")
            .header(USER_AGENT, "EyeDoc-App")
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Gagal mengambil profil GitHub: {}", e))?;

        if resp.status().is_success() {
            let user: GitHubUser = resp
                .json()
                .await
                .map_err(|e| format!("Gagal parse user: {}", e))?;
            Ok(user)
        } else {
            let txt = resp.text().await.unwrap_or_default();
            Err(format!("Gagal mendapatkan profil pengguna: {}", txt))
        }
    }

    /// Pastikan repository untuk backup sudah ada, jika belum otomatis buat repo private
    pub async fn ensure_repository_exists(token: &str, owner: &str, repo_name: &str) -> Result<String, String> {
        let client = reqwest::Client::new();
        let check_url = format!("https://api.github.com/repos/{}/{}", owner, repo_name);

        let check_resp = client
            .get(&check_url)
            .header(USER_AGENT, "EyeDoc-App")
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .send()
            .await;

        if let Ok(resp) = check_resp {
            if resp.status().is_success() {
                return Ok(format!("{}/{}", owner, repo_name));
            }
        }

        // Jika belum ada, buat repository private baru secara otomatis
        let create_url = "https://api.github.com/user/repos";
        let body = serde_json::json!({
            "name": repo_name,
            "private": true,
            "description": "EyeDoc Automated Word Documents Backup (Private)",
            "auto_init": true
        });

        let _ = client
            .post(create_url)
            .header(USER_AGENT, "EyeDoc-App")
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .json(&body)
            .send()
            .await;

        Ok(format!("{}/{}", owner, repo_name))
    }
}
