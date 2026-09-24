use crate::bootstrap::{ShellAsset, WebBundleContract};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

pub const WEB_BUNDLE_SCHEMA: &str = "fs-desktop-web-bundle-v1";
pub const WEB_BUNDLE_CONTENT_TYPE: &str = "application/vnd.footballscience.web-bundle";
pub const WEB_BUNDLE_MAX_FILES: usize = 4_096;
pub const WEB_BUNDLE_MAX_HEADER_BYTES: usize = 2 * 1024 * 1024;
pub const WEB_BUNDLE_MAX_FILE_BYTES: u64 = 24 * 1024 * 1024;
pub const WEB_BUNDLE_MAX_TOTAL_BYTES: u64 = 128 * 1024 * 1024;
const MAGIC: &[u8; 8] = b"FSWEBPK1";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WebBundleIndex {
    schema: String,
    files: Vec<WebBundleFile>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WebBundleFile {
    path: String,
    sha256: String,
    bytes: u64,
    offset: u64,
    content_type: String,
}

struct ParsedBundle<'a> {
    files: Vec<WebBundleFile>,
    payload: &'a [u8],
}

pub fn validate_contract(contract: &WebBundleContract, asset: &ShellAsset) -> Result<(), String> {
    if contract.schema != WEB_BUNDLE_SCHEMA
        || contract.asset_path != asset.path
        || asset.content_type != WEB_BUNDLE_CONTENT_TYPE
        || contract.file_count < 5
        || contract.file_count as usize > WEB_BUNDLE_MAX_FILES
        || contract.unpacked_bytes == 0
        || contract.unpacked_bytes > WEB_BUNDLE_MAX_TOTAL_BYTES
        || !valid_sha256(&contract.index_sha256)
    {
        return Err("signed web bundle contract is invalid".into());
    }
    Ok(())
}

pub fn extract(
    bundle_bytes: &[u8],
    destination: &Path,
    contract: &WebBundleContract,
) -> Result<(), String> {
    let parsed = parse_bundle(bundle_bytes, contract)?;
    if destination.exists() {
        fs::remove_dir_all(destination).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in parsed.files {
        let start = usize::try_from(entry.offset).map_err(|_| "web bundle offset overflow")?;
        let length = usize::try_from(entry.bytes).map_err(|_| "web bundle size overflow")?;
        let end = start
            .checked_add(length)
            .ok_or_else(|| "web bundle payload overflow".to_string())?;
        durable_write(&destination.join(&entry.path), &parsed.payload[start..end])?;
    }
    verify_extracted(bundle_bytes, destination, contract)
}

pub fn verify_extracted(
    bundle_bytes: &[u8],
    web_root: &Path,
    contract: &WebBundleContract,
) -> Result<(), String> {
    let parsed = parse_bundle(bundle_bytes, contract)?;
    for entry in parsed.files {
        let path = checked_extracted_path(web_root, &entry.path)?;
        let bytes = fs::read(path)
            .map_err(|_| format!("extracted web asset is unavailable: {}", entry.path))?;
        verify_file(&entry, &bytes)?;
    }
    Ok(())
}

pub fn read_extracted_asset(
    bundle_path: &Path,
    web_root: &Path,
    asset_path: &str,
    contract: &WebBundleContract,
) -> Result<(Vec<u8>, String), String> {
    validate_path(asset_path)?;
    let index = read_index(bundle_path, contract)?;
    let entry = index
        .files
        .into_iter()
        .find(|entry| entry.path == asset_path)
        .ok_or_else(|| "asset is not declared in the signed web bundle".to_string())?;
    let bytes = fs::read(checked_extracted_path(web_root, asset_path)?)
        .map_err(|_| "signed web asset is unavailable".to_string())?;
    verify_file(&entry, &bytes)?;
    Ok((bytes, entry.content_type))
}

fn parse_bundle<'a>(
    bytes: &'a [u8],
    contract: &WebBundleContract,
) -> Result<ParsedBundle<'a>, String> {
    let prefix = MAGIC.len() + 4;
    if bytes.len() < prefix || &bytes[..MAGIC.len()] != MAGIC {
        return Err("web bundle magic is invalid".into());
    }
    let header_len = u32::from_be_bytes(
        bytes[MAGIC.len()..prefix]
            .try_into()
            .map_err(|_| "web bundle header is truncated")?,
    ) as usize;
    if header_len == 0 || header_len > WEB_BUNDLE_MAX_HEADER_BYTES {
        return Err("web bundle index length is invalid".into());
    }
    let payload_start = prefix
        .checked_add(header_len)
        .ok_or_else(|| "web bundle index overflow".to_string())?;
    if payload_start > bytes.len() {
        return Err("web bundle index is truncated".into());
    }
    let header = &bytes[prefix..payload_start];
    let index = validate_index(header, contract)?;
    let payload = &bytes[payload_start..];
    let mut expected_offset = 0_u64;
    for entry in &index.files {
        if entry.offset != expected_offset {
            return Err("web bundle offsets are non-canonical".into());
        }
        let start = usize::try_from(entry.offset).map_err(|_| "web bundle offset overflow")?;
        let length = usize::try_from(entry.bytes).map_err(|_| "web bundle size overflow")?;
        let end = start
            .checked_add(length)
            .ok_or_else(|| "web bundle payload overflow".to_string())?;
        if end > payload.len() {
            return Err(format!("web bundle payload is truncated: {}", entry.path));
        }
        verify_file(entry, &payload[start..end])?;
        expected_offset = expected_offset
            .checked_add(entry.bytes)
            .ok_or_else(|| "web bundle byte total overflow".to_string())?;
    }
    if expected_offset != contract.unpacked_bytes || expected_offset as usize != payload.len() {
        return Err("web bundle contains trailing, missing or unindexed bytes".into());
    }
    Ok(ParsedBundle {
        files: index.files,
        payload,
    })
}

fn read_index(bundle_path: &Path, contract: &WebBundleContract) -> Result<WebBundleIndex, String> {
    let mut file =
        File::open(bundle_path).map_err(|_| "signed web bundle is unavailable".to_string())?;
    let mut prefix = [0_u8; 12];
    file.read_exact(&mut prefix)
        .map_err(|_| "web bundle header is truncated".to_string())?;
    if &prefix[..MAGIC.len()] != MAGIC {
        return Err("web bundle magic is invalid".into());
    }
    let header_len = u32::from_be_bytes(
        prefix[MAGIC.len()..]
            .try_into()
            .map_err(|_| "web bundle header is truncated")?,
    ) as usize;
    if header_len == 0 || header_len > WEB_BUNDLE_MAX_HEADER_BYTES {
        return Err("web bundle index length is invalid".into());
    }
    let mut header = vec![0_u8; header_len];
    file.read_exact(&mut header)
        .map_err(|_| "web bundle index is truncated".to_string())?;
    validate_index(&header, contract)
}

fn validate_index(header: &[u8], contract: &WebBundleContract) -> Result<WebBundleIndex, String> {
    if hex_sha256(header) != contract.index_sha256 {
        return Err("web bundle index does not match its signed contract".into());
    }
    let index: WebBundleIndex =
        serde_json::from_slice(header).map_err(|_| "web bundle index is malformed".to_string())?;
    if index.schema != WEB_BUNDLE_SCHEMA
        || index.files.len() != contract.file_count as usize
        || index.files.len() < 5
        || index.files.len() > WEB_BUNDLE_MAX_FILES
    {
        return Err("web bundle index contract mismatch".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0_u64;
    for entry in &index.files {
        validate_path(&entry.path)?;
        if !paths.insert(entry.path.as_str()) {
            return Err("duplicate web bundle path".into());
        }
        if !valid_sha256(&entry.sha256)
            || entry.bytes == 0
            || entry.bytes > WEB_BUNDLE_MAX_FILE_BYTES
            || entry.content_type != content_type_for(&entry.path)?
        {
            return Err(format!("invalid web bundle asset metadata: {}", entry.path));
        }
        total = total
            .checked_add(entry.bytes)
            .ok_or_else(|| "web bundle byte total overflow".to_string())?;
        if total > WEB_BUNDLE_MAX_TOTAL_BYTES {
            return Err("web bundle exceeds its unpacked byte boundary".into());
        }
    }
    if total != contract.unpacked_bytes {
        return Err("web bundle unpacked size does not match its signed contract".into());
    }
    for required in [
        "index.html",
        "app.js",
        "app-runtime.js",
        "styles.css",
        "platform-auth-boot.js",
        "desktop/candidate-readiness.js",
        "desktop/platform-bootstrap.js",
    ] {
        if !paths.contains(required) {
            return Err(format!("web bundle is missing required asset {required}"));
        }
    }
    Ok(index)
}

fn verify_file(entry: &WebBundleFile, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != entry.bytes || hex_sha256(bytes) != entry.sha256 {
        return Err(format!("web bundle asset integrity failed: {}", entry.path));
    }
    Ok(())
}

fn checked_extracted_path(root: &Path, asset_path: &str) -> Result<PathBuf, String> {
    validate_path(asset_path)?;
    let mut current = root.to_path_buf();
    for component in Path::new(asset_path).components() {
        let Component::Normal(value) = component else {
            return Err("invalid extracted web asset path".into());
        };
        current.push(value);
        if let Ok(metadata) = fs::symlink_metadata(&current)
            && metadata.file_type().is_symlink()
        {
            return Err("symlinks are forbidden in the extracted web release".into());
        }
    }
    Ok(current)
}

fn validate_path(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 240
        || value.starts_with('/')
        || value.contains("//")
        || value.contains('\\')
        || value.contains('\0')
    {
        return Err("invalid web bundle asset path".into());
    }
    if Path::new(value)
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("invalid web bundle asset path".into());
    }
    content_type_for(value)?;
    Ok(())
}

fn content_type_for(value: &str) -> Result<&'static str, String> {
    match Path::new(value).extension().and_then(|item| item.to_str()) {
        Some("cjs" | "js" | "mjs") => Ok("text/javascript; charset=utf-8"),
        Some("css") => Ok("text/css; charset=utf-8"),
        Some("html") => Ok("text/html; charset=utf-8"),
        Some("jpg" | "jpeg") => Ok("image/jpeg"),
        Some("json") => Ok("application/json; charset=utf-8"),
        Some("png") => Ok("image/png"),
        Some("svg") => Ok("image/svg+xml"),
        Some("webmanifest") => Ok("application/manifest+json; charset=utf-8"),
        Some("woff2") => Ok("font/woff2"),
        _ => Err("unsupported web bundle asset type".into()),
    }
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn durable_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = File::create(path).map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_unsupported_types() {
        for path in [
            "../index.html",
            "/index.html",
            "a\\b.js",
            "a//b.js",
            "secret.pem",
        ] {
            assert!(validate_path(path).is_err(), "{path}");
        }
    }
}
