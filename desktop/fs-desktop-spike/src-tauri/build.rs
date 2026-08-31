fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["desktop_runtime_info", "record_spike_probe"]),
    ))
    .expect("failed to build FS desktop spike metadata");
}
