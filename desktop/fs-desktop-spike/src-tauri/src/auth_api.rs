use crate::authority::{RefreshedCredentials, SessionAuthoritySnapshot, SessionProfile};
use reqwest::Url;
use reqwest::blocking::{Client, Response};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;
use zeroize::Zeroizing;

const AUTH_PATH: &str = "/api/desktop-auth";
const MAX_AUTH_RESPONSE_BYTES: u64 = 256 * 1024;
const MAX_API_REQUEST_BYTES: usize = 5 * 1024 * 1024;
const MAX_API_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_SECONDS: u64 = 30;
const AUTHORIZATION_REJECTED_PREFIX: &str = "desktop authorization rejected: ";

const AUTHENTICATED_API_ROUTES: &[(&str, &[&str])] = &[
    (
        "/api/admin-users",
        &["GET", "POST", "PUT", "PATCH", "DELETE"],
    ),
    ("/api/app-state", &["GET", "POST", "PUT", "PATCH", "DELETE"]),
    ("/api/app-state-backup", &["GET", "POST"]),
    ("/api/app-state-backup-status", &["GET"]),
    ("/api/audit-log", &["GET", "POST"]),
    ("/api/chat", &["GET", "POST"]),
    ("/api/desktop-session-sync", &["GET", "POST"]),
    ("/api/football-science-db", &["GET", "POST"]),
    ("/api/idp", &["GET", "POST"]),
    ("/api/leaderboard", &["GET", "POST"]),
    ("/api/medical", &["GET", "POST"]),
    ("/api/platform-identity", &["GET"]),
    ("/api/platform-readiness", &["GET"]),
    ("/api/platform-tenant-bootstrap", &["POST"]),
    ("/api/presence", &["GET", "POST"]),
    ("/api/profile-image", &["GET", "POST", "DELETE"]),
    ("/api/push-subscriptions", &["GET", "POST", "DELETE"]),
    ("/api/rtp", &["GET", "POST"]),
    ("/api/scouting", &["GET", "POST"]),
    ("/api/session-history", &["GET", "POST"]),
    ("/api/squad-ages", &["GET", "POST"]),
    ("/api/video-analysis", &["GET", "POST"]),
];

const PUBLIC_API_ROUTES: &[(&str, &[&str])] = &[
    ("/api/auth-health", &["GET"]),
    ("/api/gameplan-player-brief", &["GET", "POST"]),
];

#[derive(Clone)]
pub struct DesktopAuthApi {
    origin: Url,
    client: Client,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthEnvelope {
    ok: bool,
    schema: String,
    session: Option<AuthSession>,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthSession {
    access_token: String,
    refresh_token: String,
    expires_at_unix_ms: u128,
    identity: VerifiedIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerifiedIdentity {
    schema: String,
    actor_id: String,
    email: String,
    role: String,
    status: String,
    organization_id: String,
    club_id: String,
    team_id: String,
    display_name: String,
    first_name: String,
    last_name: String,
    club_name: String,
    team_name: String,
    verified_at_unix_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthRequest<'a> {
    action: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    identifier: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    password: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    refresh_token: Option<&'a str>,
}

pub struct ActivatedSession {
    pub snapshot: SessionAuthoritySnapshot,
    pub access_token: Zeroizing<String>,
    pub refresh_token: Zeroizing<String>,
    pub access_expires_at_unix_ms: u128,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesktopApiRequest {
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub content_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopApiResponse {
    pub status: u16,
    pub body: String,
    pub content_type: String,
}

impl DesktopAuthApi {
    pub fn from_compile_time() -> Result<Option<Self>, String> {
        let Some(raw_origin) = option_env!("FS_DESKTOP_API_ORIGIN") else {
            return Ok(None);
        };
        Self::new(raw_origin).map(Some)
    }

    fn new(raw_origin: &str) -> Result<Self, String> {
        let origin = validate_origin(raw_origin)?;
        Self::with_origin(origin)
    }

    fn with_origin(origin: Url) -> Result<Self, String> {
        let client = Client::builder()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .user_agent("football-science-desktop/0.0.1")
            .build()
            .map_err(|_| "desktop API client could not be initialized".to_string())?;
        Ok(Self { origin, client })
    }

    #[cfg(test)]
    fn new_test_loopback(raw_origin: &str) -> Result<Self, String> {
        let origin =
            Url::parse(raw_origin).map_err(|_| "desktop API test origin is invalid".to_string())?;
        if origin.scheme() != "http"
            || origin.host_str() != Some("127.0.0.1")
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return Err("desktop API test origin must be loopback HTTP".into());
        }
        Self::with_origin(origin)
    }

    pub fn sign_in(&self, identifier: &str, password: &str) -> Result<ActivatedSession, String> {
        let identifier = identifier.trim();
        if identifier.is_empty()
            || identifier.len() > 180
            || password.is_empty()
            || password.len() > 256
        {
            return Err("username and password are required".into());
        }
        self.auth_request(
            AuthRequest {
                action: "sign-in",
                identifier: Some(identifier),
                password: Some(password),
                refresh_token: None,
            },
            None,
        )
    }

    pub fn refresh(&self, refresh_token: &str) -> Result<RefreshedCredentials, String> {
        let session = self.auth_request(
            AuthRequest {
                action: "refresh",
                identifier: None,
                password: None,
                refresh_token: Some(refresh_token),
            },
            None,
        )?;
        Ok(RefreshedCredentials {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            access_expires_at_unix_ms: session.access_expires_at_unix_ms,
            verified_snapshot: Some(session.snapshot),
        })
    }

    pub fn reset_password(&self, identifier: &str) -> Result<(), String> {
        let identifier = identifier.trim();
        if identifier.is_empty() || identifier.len() > 180 {
            return Err("username or email is required".into());
        }
        let response = self.send_json(
            AUTH_PATH,
            &AuthRequest {
                action: "reset-password",
                identifier: Some(identifier),
                password: None,
                refresh_token: None,
            },
            None,
        )?;
        let envelope: AuthEnvelope = serde_json::from_slice(&response)
            .map_err(|_| "desktop password-reset response was malformed".to_string())?;
        if !envelope.ok || envelope.schema != "fs-desktop-auth-response-v1" {
            return Err(sanitize_reason(envelope.reason));
        }
        Ok(())
    }

    pub fn sign_out(&self, access_token: Option<&str>) -> Result<(), String> {
        let response = self.send_json(
            AUTH_PATH,
            &AuthRequest {
                action: "sign-out",
                identifier: None,
                password: None,
                refresh_token: None,
            },
            access_token,
        )?;
        let envelope: AuthEnvelope = serde_json::from_slice(&response)
            .map_err(|_| "desktop sign-out response was malformed".to_string())?;
        if !envelope.ok || envelope.schema != "fs-desktop-auth-response-v1" {
            return Err(sanitize_reason(envelope.reason));
        }
        Ok(())
    }

    pub fn request(
        &self,
        request: &DesktopApiRequest,
        access_token: Option<&str>,
    ) -> Result<DesktopApiResponse, String> {
        let (path, method, public) = validate_api_request(request)?;
        if !public && access_token.is_none() {
            return Err("desktop API request requires an active session".into());
        }
        let url = self
            .origin
            .join(&path)
            .map_err(|_| "desktop API path is invalid".to_string())?;
        let mut builder = self.client.request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|_| "desktop API method is invalid".to_string())?,
            url,
        );
        if let Some(token) = access_token {
            builder = builder.bearer_auth(token);
        }
        if !request.body.is_empty() {
            builder = builder
                .header("Content-Type", "application/json")
                .body(request.body.clone());
        }
        let response = builder
            .send()
            .map_err(|_| "desktop API request failed".to_string())?;
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/json; charset=utf-8")
            .to_string();
        if !content_type
            .to_ascii_lowercase()
            .starts_with("application/json")
        {
            return Err("desktop API returned an unsupported content type".into());
        }
        let body = read_bounded(response, MAX_API_RESPONSE_BYTES)?;
        Ok(DesktopApiResponse {
            status,
            body: String::from_utf8(body)
                .map_err(|_| "desktop API response was not UTF-8".to_string())?,
            content_type,
        })
    }

    fn auth_request(
        &self,
        request: AuthRequest<'_>,
        access_token: Option<&str>,
    ) -> Result<ActivatedSession, String> {
        let response = self.send_json(AUTH_PATH, &request, access_token)?;
        let envelope: AuthEnvelope = serde_json::from_slice(&response)
            .map_err(|_| "desktop authentication response was malformed".to_string())?;
        if !envelope.ok || envelope.schema != "fs-desktop-auth-response-v1" {
            return Err(sanitize_reason(envelope.reason));
        }
        let session = envelope
            .session
            .ok_or_else(|| "desktop authentication response omitted its session".to_string())?;
        session.activate()
    }

    fn send_json<T: Serialize>(
        &self,
        path: &str,
        value: &T,
        access_token: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        let url = self
            .origin
            .join(path)
            .map_err(|_| "desktop authentication endpoint is invalid".to_string())?;
        let mut request = self.client.post(url).json(value);
        if let Some(token) = access_token {
            request = request.bearer_auth(token);
        }
        let response = request
            .send()
            .map_err(|_| "desktop authentication service is unavailable".to_string())?;
        let status = response.status();
        let bytes = read_bounded(response, MAX_AUTH_RESPONSE_BYTES)?;
        if !status.is_success() {
            let reason = serde_json::from_slice::<serde_json::Value>(&bytes)
                .ok()
                .and_then(|value| {
                    value
                        .get("reason")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                });
            let reason = sanitize_reason(reason);
            if matches!(status.as_u16(), 401 | 403) {
                return Err(format!("{AUTHORIZATION_REJECTED_PREFIX}{reason}"));
            }
            return Err(reason);
        }
        Ok(bytes)
    }
}

pub fn is_authorization_rejection(error: &str) -> bool {
    error.starts_with(AUTHORIZATION_REJECTED_PREFIX)
}

impl AuthSession {
    fn activate(self) -> Result<ActivatedSession, String> {
        if self.identity.schema != "fs-desktop-verified-identity-v1"
            || self.identity.status != "active"
        {
            return Err("desktop identity is unavailable or inactive".into());
        }
        let partition_key = format!(
            "organization:{}:team:{}:actor:{}",
            self.identity.organization_id, self.identity.team_id, self.identity.actor_id
        );
        let snapshot = SessionAuthoritySnapshot {
            state: "online-authorized",
            synthetic_identity: false,
            actor_id: self.identity.actor_id,
            organization_id: self.identity.organization_id.clone(),
            tenant_id: self.identity.organization_id,
            team_id: self.identity.team_id,
            partition_key,
            auth_epoch: self.identity.verified_at_unix_ms,
            offline_lease_expires_at_unix_ms: 0,
            can_read_offline: true,
            can_sync: true,
            profile: Some(SessionProfile {
                email: self.identity.email,
                role: self.identity.role,
                display_name: self.identity.display_name,
                first_name: self.identity.first_name,
                last_name: self.identity.last_name,
                club_id: self.identity.club_id,
                club_name: self.identity.club_name,
                team_name: self.identity.team_name,
                status: self.identity.status,
            }),
        };
        Ok(ActivatedSession {
            snapshot,
            access_token: Zeroizing::new(self.access_token),
            refresh_token: Zeroizing::new(self.refresh_token),
            access_expires_at_unix_ms: self.expires_at_unix_ms,
        })
    }
}

fn validate_origin(raw: &str) -> Result<Url, String> {
    let mut origin =
        Url::parse(raw.trim()).map_err(|_| "desktop API origin is invalid".to_string())?;
    let loopback_test = option_env!("FS_DESKTOP_TEST_BUILD") == Some("1")
        && origin.scheme() == "http"
        && matches!(origin.host_str(), Some("127.0.0.1") | Some("localhost"));
    if origin.scheme() != "https" && !loopback_test {
        return Err("desktop API origin must use HTTPS".into());
    }
    if origin.username() != ""
        || origin.password().is_some()
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return Err("desktop API origin contains unsupported components".into());
    }
    if origin.path() != "/" {
        return Err("desktop API origin must not contain a path".into());
    }
    origin.set_path("/");
    Ok(origin)
}

fn validate_api_request(request: &DesktopApiRequest) -> Result<(String, String, bool), String> {
    if request.path.len() > 2_048
        || !request.path.starts_with("/api/")
        || request.path.contains('#')
    {
        return Err("desktop API path is outside the allowlist".into());
    }
    if request.body.len() > MAX_API_REQUEST_BYTES {
        return Err("desktop API request body is too large".into());
    }
    if !request.body.is_empty() && request.content_type != "application/json" {
        return Err("desktop API request content type is unsupported".into());
    }
    let method = request.method.trim().to_ascii_uppercase();
    let parsed = Url::parse(&format!("https://desktop.invalid{}", request.path))
        .map_err(|_| "desktop API path is invalid".to_string())?;
    if parsed.origin().ascii_serialization() != "https://desktop.invalid"
        || parsed.path().contains("..")
    {
        return Err("desktop API path is outside the allowlist".into());
    }
    let path = parsed.path();
    let allowed = |routes: &[(&str, &[&str])]| {
        routes
            .iter()
            .any(|(route, methods)| *route == path && methods.contains(&method.as_str()))
    };
    let public = allowed(PUBLIC_API_ROUTES);
    if !public && !allowed(AUTHENTICATED_API_ROUTES) {
        return Err("desktop API route or method is outside the allowlist".into());
    }
    Ok((request.path.clone(), method, public))
}

fn read_bounded(response: Response, limit: u64) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        return Err("desktop API response is too large".into());
    }
    let mut bytes = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "desktop API response could not be read".to_string())?;
    if bytes.len() as u64 > limit {
        return Err("desktop API response is too large".into());
    }
    Ok(bytes)
}

fn sanitize_reason(reason: Option<String>) -> String {
    let value = reason.unwrap_or_else(|| "desktop authentication failed".into());
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 240 || trimmed.chars().any(char::is_control) {
        "desktop authentication failed".into()
    } else {
        trimmed.into()
    }
}

#[cfg(test)]
#[path = "auth_api_tests.rs"]
mod tests;
