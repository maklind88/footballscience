fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_runtime_info",
            "desktop_bootstrap_status",
            "desktop_prepare_shell_update",
            "desktop_candidate_status",
            "desktop_candidate_confirm",
            "desktop_candidate_report_failure",
            "desktop_open_recovery",
            "desktop_recovery_status",
            "desktop_recovery_read_selected_session",
            "desktop_session_authority",
            "desktop_read_selected_session",
            "desktop_session_sync_status",
            "desktop_apply_session_operation",
            "record_spike_probe",
            "internal_denied_probe",
        ]),
    ))
    .expect("failed to build FS desktop spike metadata");
}
