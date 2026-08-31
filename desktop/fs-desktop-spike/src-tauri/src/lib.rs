use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    native_app_version: String,
    runtime: &'static str,
    local_schema_version: u32,
    sync_protocol_version: u32,
    capabilities: [&'static str; 2],
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SpikeProbe {
    candidate: String,
    boot_mode: String,
    shell_version: String,
    cache_version: String,
    payload_build_id: String,
    cached_payload: bool,
    service_worker_controlled: bool,
    unauthorized_command_rejected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredProbe<'a> {
    recorded_at_unix_ms: u128,
    probe: &'a SpikeProbe,
}

fn bounded_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max
}

fn validate_probe(probe: &SpikeProbe) -> Result<(), String> {
    if !matches!(probe.candidate.as_str(), "hosted" | "bundled") {
        return Err("unknown spike candidate".into());
    }
    if !matches!(probe.boot_mode.as_str(), "online" | "offline" | "unknown") {
        return Err("unknown boot mode".into());
    }
    if !bounded_text(&probe.shell_version, 40) {
        return Err("invalid shell version".into());
    }
    if !bounded_text(&probe.cache_version, 80) {
        return Err("invalid cache version".into());
    }
    if !bounded_text(&probe.payload_build_id, 80) {
        return Err("invalid payload build ID".into());
    }
    if !probe.unauthorized_command_rejected {
        return Err("ungranted native command was not rejected".into());
    }
    Ok(())
}

#[tauri::command]
fn desktop_runtime_info(app: tauri::AppHandle) -> RuntimeInfo {
    RuntimeInfo {
        native_app_version: app.package_info().version.to_string(),
        runtime: "tauri",
        local_schema_version: 0,
        sync_protocol_version: 0,
        capabilities: ["runtime.info", "spike.probe"],
    }
}

#[tauri::command]
fn record_spike_probe(probe: SpikeProbe) -> Result<(), String> {
    validate_probe(&probe)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system clock is before UNIX epoch".to_string())?
        .as_millis();
    let payload = serde_json::to_vec_pretty(&StoredProbe {
        recorded_at_unix_ms: now,
        probe: &probe,
    })
    .map_err(|error| error.to_string())?;
    let final_path =
        std::env::temp_dir().join(format!("fs-desktop-spike-{}.json", probe.candidate));
    let pending_path = final_path.with_extension("json.pending");
    fs::write(&pending_path, payload).map_err(|error| error.to_string())?;
    fs::rename(&pending_path, &final_path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn internal_denied_probe() -> bool {
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            record_spike_probe,
            internal_denied_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running FS desktop architecture spike");
}
