use crate::bootstrap::*;
use crate::local_data::{LOCAL_SCHEMA_VERSION, SYNC_PROTOCOL_VERSION};
use crate::release_trust::KeyRole;
use crate::shell_contract;
use rusqlite::{Connection, params};

const TEST_NOW: u64 = 1_800_000_000_000;

fn manifest(build_id: &str, sequence: u64) -> ShellManifest {
    let assets = [
        ("index.html", "text/html; charset=utf-8"),
        ("styles.css", "text/css; charset=utf-8"),
        ("app.js", "text/javascript; charset=utf-8"),
        ("bridge.mjs", "text/javascript; charset=utf-8"),
        ("connectivity-state.mjs", "text/javascript; charset=utf-8"),
        ("session-authority.mjs", "text/javascript; charset=utf-8"),
        (
            "session-planner-offline.mjs",
            "text/javascript; charset=utf-8",
        ),
        ("tauri-invoke.mjs", "text/javascript; charset=utf-8"),
    ]
    .into_iter()
    .map(|(path, content_type)| ShellAsset {
        path: path.into(),
        sha256: "0".repeat(64),
        bytes: 1,
        content_type: content_type.into(),
    })
    .collect();
    ShellManifest {
        schema: MANIFEST_SCHEMA.into(),
        release_id: build_id.into(),
        build_id: build_id.into(),
        frontend_build_id: build_id.into(),
        release_sequence: sequence,
        issued_at_unix_ms: TEST_NOW - 1_000,
        native_version_requirement: ">=0.0.1, <0.1.0".into(),
        local_schema_version: LOCAL_SCHEMA_VERSION,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        required_capabilities: ACTIVE_CAPABILITIES
            .iter()
            .map(|item| item.to_string())
            .collect(),
        entrypoint: "index.html".into(),
        app_ready_schema: APP_READY_SCHEMA.into(),
        signing_key_id: "ephemeral-test-release-key".into(),
        recovery_authorization: None,
        assets,
    }
}

fn candidate(manifest: ShellManifest, nonce: &str) -> CandidateShell {
    CandidateShell {
        manifest,
        health_nonce: Some(nonce.into()),
        attempt_started_at_unix_ms: Some(1),
        deadline_unix_ms: Some(u64::MAX),
        failure_count: 0,
    }
}

fn insert_generation(connection: &Connection, manifest: &ShellManifest, status: &str) {
    connection
        .execute(
            "INSERT INTO shell_generations(
               build_id, release_id, release_sequence, manifest_json, signed_manifest_sha256,
               signature_json, signing_key_id, status, installed_at_unix_ms,
               attempt_started_at_unix_ms, candidate_deadline_unix_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, '{}', ?6, ?7, 1, ?8, ?9)",
            params![
                manifest.build_id,
                manifest.release_id,
                manifest.release_sequence as i64,
                serde_json::to_string(manifest).unwrap(),
                "0".repeat(64),
                manifest.signing_key_id,
                status,
                if status == "candidate" {
                    Some(1_i64)
                } else {
                    None
                },
                if status == "candidate" {
                    Some(i64::MAX)
                } else {
                    None
                },
            ],
        )
        .unwrap();
}

fn registry(active: &ShellManifest, staged: &ShellManifest) -> Connection {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    insert_generation(&connection, active, "active");
    insert_generation(&connection, staged, "candidate");
    connection
        .execute(
            "UPDATE shell_registry SET active_build_id = ?1, candidate_build_id = ?2 WHERE singleton = 1",
            params![active.build_id, staged.build_id],
        )
        .unwrap();
    connection
}

fn full_isolation_proof() -> CandidateNegativeChecks {
    CandidateNegativeChecks {
        session_authority_denied: true,
        session_read_denied: true,
        session_operation_denied: true,
        session_sync_status_denied: true,
        outbox_denied: true,
        active_confirmation_denied: true,
    }
}

fn confirmation(nonce: &str) -> ConfirmCandidateRequest {
    ConfirmCandidateRequest {
        schema: APP_READY_SCHEMA.into(),
        health_nonce: nonce.into(),
        shell_fully_initialized: true,
        negative_checks: full_isolation_proof(),
    }
}

#[test]
fn native_compatibility_requires_the_exact_active_capability_set() {
    let mut value = manifest("hosted-test-v1", 1);
    value
        .required_capabilities
        .push("filesystem.generic".into());
    assert!(shell_contract::validate_manifest(&value, TEST_NOW).is_err());
}

#[test]
fn manifest_rejects_private_data_payloads_and_mismatched_content_types() {
    let mut private = manifest("hosted-test-v1", 1);
    private.assets.push(ShellAsset {
        path: "session.json".into(),
        sha256: "0".repeat(64),
        bytes: 10,
        content_type: "application/json".into(),
    });
    assert!(shell_contract::validate_manifest(&private, TEST_NOW).is_err());

    let mut mismatched = manifest("hosted-test-v1", 1);
    mismatched.assets[0].content_type = "text/javascript; charset=utf-8".into();
    assert!(shell_contract::validate_manifest(&mismatched, TEST_NOW).is_err());
}

#[test]
fn remote_rollback_requires_a_distinct_recovery_key_and_signed_policy() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    connection
        .execute(
            "UPDATE shell_security_state SET highest_seen_release_sequence = 10 WHERE singleton = 1",
            [],
        )
        .unwrap();
    let mut rollback = manifest("hosted-test-v9", 9);
    assert!(enforce_sequence_for_test(&connection, &rollback, KeyRole::Release, TEST_NOW).is_err());
    rollback.recovery_authorization = Some(SignedRecoveryAuthorization {
        schema: RECOVERY_SCHEMA.into(),
        target_release_sequence: 9,
        authorized_from_sequence: 10,
        expires_at_unix_ms: TEST_NOW + 60_000,
        reason_code: "known-bad-release".into(),
    });
    assert!(enforce_sequence_for_test(&connection, &rollback, KeyRole::Release, TEST_NOW).is_err());
    assert!(enforce_sequence_for_test(&connection, &rollback, KeyRole::Recovery, TEST_NOW).is_ok());

    let forward = manifest("hosted-test-v11", 11);
    assert!(enforce_sequence_for_test(&connection, &forward, KeyRole::Release, TEST_NOW).is_ok());
    assert!(enforce_sequence_for_test(&connection, &forward, KeyRole::Recovery, TEST_NOW).is_err());
}

#[test]
fn candidate_can_only_promote_with_native_nonce_and_complete_isolation_proof() {
    let active = manifest("hosted-test-v1", 1);
    let staged = manifest("hosted-test-v2", 2);
    let mut connection = registry(&active, &staged);
    let mut state = ShellState {
        active: Some(active.clone()),
        previous: None,
        candidate: Some(candidate(staged.clone(), "native-nonce")),
    };
    let mut incomplete = confirmation("native-nonce");
    incomplete.negative_checks.session_read_denied = false;
    assert!(confirm_candidate(&mut connection, &mut state, &incomplete).is_err());
    assert_eq!(state.active.as_ref().unwrap().build_id, active.build_id);
    assert_eq!(
        state.candidate.as_ref().unwrap().manifest.build_id,
        staged.build_id
    );

    assert!(confirm_candidate(&mut connection, &mut state, &confirmation("wrong-nonce")).is_err());
    assert!(confirm_candidate(&mut connection, &mut state, &confirmation("native-nonce")).is_ok());
    assert_eq!(state.active.as_ref().unwrap().build_id, staged.build_id);
    assert_eq!(state.previous.as_ref().unwrap().build_id, active.build_id);
    assert!(state.candidate.is_none());
}

#[test]
fn active_build_validation_never_accepts_candidate_previous_or_fallback_identifiers() {
    let state = ShellState {
        active: Some(manifest("hosted-test-v2", 2)),
        previous: Some(manifest("hosted-test-v1", 1)),
        candidate: Some(candidate(manifest("hosted-test-v3", 3), "nonce")),
    };
    assert!(validate_active_frontend_build(&state, "hosted-test-v2").is_ok());
    for rejected in ["hosted-test-v1", "hosted-test-v3", "fallback"] {
        assert!(validate_active_frontend_build(&state, rejected).is_err());
    }
}

#[test]
fn quarantine_preserves_active_and_clears_candidate_authority() {
    let active = manifest("hosted-test-v1", 1);
    let staged = manifest("hosted-test-v2", 2);
    let connection = registry(&active, &staged);
    let mut state = ShellState {
        active: Some(active.clone()),
        previous: None,
        candidate: Some(candidate(staged.clone(), "native-nonce")),
    };
    assert!(quarantine_candidate(&connection, &mut state, "native-nonce", "timeout").unwrap());
    assert_eq!(state.active.as_ref().unwrap().build_id, active.build_id);
    assert!(state.candidate.is_none());
    let stored: (String, i64, Option<String>) = connection
        .query_row(
            "SELECT status, failure_count, failure_code FROM shell_generations WHERE build_id = ?1",
            [staged.build_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(stored, ("quarantined".into(), 1, Some("timeout".into())));
}

#[test]
fn modified_asset_is_rejected_against_the_signed_identity() {
    let original = b"verified frontend bytes";
    let asset = ShellAsset {
        path: "app.js".into(),
        sha256: shell_contract::hex_sha256(original),
        bytes: original.len() as u64,
        content_type: "text/javascript; charset=utf-8".into(),
    };
    assert!(shell_contract::verify_asset(&asset, original).is_ok());
    assert!(shell_contract::verify_asset(&asset, b"modified frontend bytes").is_err());
}

#[test]
fn immutable_build_id_cannot_be_reused_with_a_different_manifest_hash() {
    let known = manifest("hosted-test-v1", 1);
    let mut connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    insert_generation(&connection, &known, "active");
    connection
        .execute(
            "UPDATE shell_registry SET active_build_id = ?1 WHERE singleton = 1",
            [&known.build_id],
        )
        .unwrap();
    let mut state = ShellState {
        active: Some(known.clone()),
        previous: None,
        candidate: None,
    };
    let result = existing_release_result_for_test(
        &mut connection,
        &mut state,
        &known,
        &"f".repeat(64),
        TEST_NOW,
    );
    assert!(result.is_err());
    assert_eq!(state.active.as_ref().unwrap().build_id, known.build_id);
}
