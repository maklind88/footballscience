use crate::bootstrap::{
    ACTIVE_CAPABILITIES, APP_READY_SCHEMA, MANIFEST_SCHEMA, NATIVE_APP_VERSION,
    SHELL_SOURCE_ORIGIN, ShellAsset, ShellManifest,
};
use crate::local_data::{LOCAL_SCHEMA_VERSION, SYNC_PROTOCOL_VERSION};
use reqwest::blocking::Client;
use semver::{Version, VersionReq};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

pub fn validate_manifest(manifest: &ShellManifest, now_unix_ms: u64) -> Result<(), String> {
    if manifest.schema != MANIFEST_SCHEMA || manifest.app_ready_schema != APP_READY_SCHEMA {
        return Err("unsupported signed shell manifest schema".into());
    }
    validate_identifier(&manifest.release_id, "release ID")?;
    validate_identifier(&manifest.build_id, "build ID")?;
    validate_identifier(&manifest.frontend_build_id, "frontend build ID")?;
    validate_identifier(&manifest.signing_key_id, "signing key ID")?;
    if manifest.release_id != manifest.build_id
        || manifest.frontend_build_id != manifest.build_id
        || manifest.entrypoint != "index.html"
        || manifest.release_sequence == 0
    {
        return Err("invalid immutable shell release identity".into());
    }
    if manifest.issued_at_unix_ms < 1_700_000_000_000
        || manifest.issued_at_unix_ms > now_unix_ms.saturating_add(300_000)
    {
        return Err("signed shell issued timestamp is invalid".into());
    }
    let native = Version::parse(NATIVE_APP_VERSION).map_err(|error| error.to_string())?;
    let requirement = VersionReq::parse(&manifest.native_version_requirement)
        .map_err(|_| "invalid native version requirement".to_string())?;
    if !requirement.matches(&native) {
        return Err("shell is incompatible with this native app version".into());
    }
    if manifest.local_schema_version != LOCAL_SCHEMA_VERSION
        || manifest.sync_protocol_version != SYNC_PROTOCOL_VERSION
    {
        return Err("shell data or sync compatibility mismatch".into());
    }
    let required: BTreeSet<_> = manifest
        .required_capabilities
        .iter()
        .map(String::as_str)
        .collect();
    let runtime: BTreeSet<_> = ACTIVE_CAPABILITIES.into_iter().collect();
    if required != runtime {
        return Err("shell capabilities do not exactly match the active native contract".into());
    }
    if manifest.assets.len() < 5 || manifest.assets.len() > 16 {
        return Err("shell asset count is outside the local integration boundary".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0_u64;
    for asset in &manifest.assets {
        validate_asset_path(&asset.path)?;
        validate_content_type(asset)?;
        if !paths.insert(asset.path.as_str()) {
            return Err("duplicate shell asset path".into());
        }
        if asset.sha256.len() != 64 || !asset.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid asset SHA-256".into());
        }
        if asset.bytes == 0 || asset.bytes > 524_288 {
            return Err("shell asset exceeds the per-file limit".into());
        }
        total = total
            .checked_add(asset.bytes)
            .ok_or_else(|| "shell asset byte total overflow".to_string())?;
    }
    if total > 2_097_152 {
        return Err("shell exceeds the total cache limit".into());
    }
    for required_path in [
        "index.html",
        "styles.css",
        "app.js",
        "bridge.mjs",
        "tauri-invoke.mjs",
    ] {
        if !paths.contains(required_path) {
            return Err(format!("missing required shell asset {required_path}"));
        }
    }
    Ok(())
}

pub fn bounded_get(client: &Client, url: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    bounded_get_response(client, url, max_bytes, None)
}

pub fn bounded_get_asset(
    client: &Client,
    url: &str,
    asset: &ShellAsset,
) -> Result<Vec<u8>, String> {
    bounded_get_response(client, url, asset.bytes as usize, Some(&asset.content_type))
}

fn bounded_get_response(
    client: &Client,
    url: &str,
    max_bytes: usize,
    expected_content_type: Option<&str>,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .send()
        .map_err(|error| format!("shell source unavailable: {error}"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(format!("shell source returned {}", response.status()));
    }
    if response.url().origin().ascii_serialization() != SHELL_SOURCE_ORIGIN {
        return Err("shell source origin changed".into());
    }
    if let Some(expected) = expected_content_type {
        let observed = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        if observed != expected {
            return Err("shell source content type does not match signed manifest".into());
        }
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("shell source body exceeds declared boundary".into());
    }
    let bytes = response.bytes().map_err(|error| error.to_string())?;
    if bytes.len() > max_bytes {
        return Err("shell source body exceeds declared boundary".into());
    }
    Ok(bytes.to_vec())
}

pub fn durable_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = File::create(path).map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

pub fn verify_generation(root: &Path, manifest: &ShellManifest) -> Result<(), String> {
    for asset in &manifest.assets {
        verify_asset(
            asset,
            &fs::read(root.join(&asset.path)).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(())
}

pub fn verify_asset(asset: &ShellAsset, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != asset.bytes || hex_sha256(bytes) != asset.sha256.to_ascii_lowercase() {
        return Err(format!("asset integrity failed for {}", asset.path));
    }
    Ok(())
}

fn validate_asset_path(value: &str) -> Result<(), String> {
    if value.to_ascii_lowercase().contains("token")
        || value.to_ascii_lowercase().contains("session.json")
        || value.to_ascii_lowercase().contains("medical")
        || value.to_ascii_lowercase().contains("outbox")
    {
        return Err("private or domain data is forbidden in the shell release".into());
    }
    let path = PathBuf::from(value);
    if value.starts_with('/')
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("invalid shell asset path".into());
    }
    if !matches!(
        path.extension().and_then(|item| item.to_str()),
        Some("html" | "css" | "js" | "mjs" | "svg" | "png" | "woff2")
    ) {
        return Err("unsupported shell asset type".into());
    }
    Ok(())
}

fn validate_content_type(asset: &ShellAsset) -> Result<(), String> {
    let extension = Path::new(&asset.path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let expected = match extension {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "woff2" => "font/woff2",
        _ => return Err("unsupported shell content type".into()),
    };
    if asset.content_type != expected {
        return Err("asset content type does not match its signed identity".into());
    }
    Ok(())
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.len() < 4
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(format!("invalid shell {label}"));
    }
    Ok(())
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
