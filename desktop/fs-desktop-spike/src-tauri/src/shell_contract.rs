use crate::bootstrap::{
    APP_READY_SCHEMA, AppReadyEvidence, MANIFEST_SCHEMA, NATIVE_APP_VERSION, RUNTIME_CAPABILITIES,
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

pub fn validate_manifest(manifest: &ShellManifest) -> Result<(), String> {
    if manifest.schema != MANIFEST_SCHEMA || manifest.app_ready_schema != APP_READY_SCHEMA {
        return Err("unsupported shell manifest schema".into());
    }
    validate_build_id(&manifest.build_id)?;
    if manifest.frontend_build_id != manifest.build_id || manifest.entrypoint != "index.html" {
        return Err("invalid shell identity or entrypoint".into());
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
    let runtime: BTreeSet<_> = RUNTIME_CAPABILITIES.into_iter().collect();
    if !required.is_subset(&runtime)
        || !["bootstrap.confirm", "session.read"]
            .into_iter()
            .all(|capability| required.contains(capability))
    {
        return Err("shell requires unsupported or incomplete capabilities".into());
    }
    if manifest.assets.len() < 4 || manifest.assets.len() > 12 {
        return Err("shell asset count is outside the prototype boundary".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0_u64;
    for asset in &manifest.assets {
        validate_asset_path(&asset.path)?;
        if !paths.insert(asset.path.as_str()) {
            return Err("duplicate shell asset path".into());
        }
        if asset.sha256.len() != 64 || !asset.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid asset SHA-256".into());
        }
        if asset.bytes == 0 || asset.bytes > 524_288 {
            return Err("shell asset exceeds the per-file limit".into());
        }
        total += asset.bytes;
    }
    if total > 2_097_152 {
        return Err("shell exceeds the total cache limit".into());
    }
    for required_path in ["index.html", "styles.css", "app.js", "bridge.mjs"] {
        if !paths.contains(required_path) {
            return Err(format!("missing required shell asset {required_path}"));
        }
    }
    Ok(())
}

pub fn validate_ready_evidence(
    manifest: &ShellManifest,
    evidence: &AppReadyEvidence,
) -> Result<(), String> {
    if !evidence.shell_fully_initialized
        || evidence.schema != APP_READY_SCHEMA
        || evidence.build_id != manifest.build_id
        || evidence.frontend_build_id != manifest.frontend_build_id
        || evidence.local_schema_version != LOCAL_SCHEMA_VERSION
        || evidence.sync_protocol_version != SYNC_PROTOCOL_VERSION
    {
        return Err("candidate did not provide matching app-ready evidence".into());
    }
    let observed: BTreeSet<_> = evidence.capabilities.iter().map(String::as_str).collect();
    let required: BTreeSet<_> = manifest
        .required_capabilities
        .iter()
        .map(String::as_str)
        .collect();
    if !required.is_subset(&observed) {
        return Err("candidate did not observe all required native capabilities".into());
    }
    Ok(())
}

pub fn bounded_get(client: &Client, url: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
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

fn validate_build_id(value: &str) -> Result<(), String> {
    if value.len() < 4
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("invalid shell build ID".into());
    }
    Ok(())
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
