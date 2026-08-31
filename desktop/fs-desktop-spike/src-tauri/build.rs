fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_runtime_info",
            "desktop_bootstrap_status",
            "desktop_prepare_shell_update",
            "desktop_confirm_shell_candidate",
            "desktop_session_authority",
            "desktop_read_selected_session",
            "desktop_apply_session_operation",
            "record_spike_probe",
            "internal_denied_probe",
        ]),
    ))
    .expect("failed to build FS desktop spike metadata");
}
