use base64::prelude::*;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

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
}
