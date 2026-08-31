use crate::bootstrap::*;
use crate::local_data::{LOCAL_SCHEMA_VERSION, SYNC_PROTOCOL_VERSION};
use crate::shell_contract;
use rusqlite::{Connection, params};

fn manifest(build_id: &str) -> ShellManifest {
    let assets = ["index.html", "styles.css", "app.js", "bridge.mjs"]
        .into_iter()
        .map(|path| ShellAsset {
            path: path.into(),
            sha256: "0".repeat(64),
            bytes: 1,
            content_type: "text/plain".into(),
        })
        .collect();
    ShellManifest {
        schema: MANIFEST_SCHEMA.into(),
        build_id: build_id.into(),
        frontend_build_id: build_id.into(),
        native_version_requirement: ">=0.0.1, <0.1.0".into(),
        local_schema_version: LOCAL_SCHEMA_VERSION,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        required_capabilities: vec!["bootstrap.confirm".into(), "session.read".into()],
        entrypoint: "index.html".into(),
        app_ready_schema: APP_READY_SCHEMA.into(),
        assets,
    }
}

fn ready(build_id: &str, local_schema_version: u32) -> AppReadyEvidence {
    AppReadyEvidence {
        schema: APP_READY_SCHEMA.into(),
        build_id: build_id.into(),
        frontend_build_id: build_id.into(),
        local_schema_version,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        capabilities: RUNTIME_CAPABILITIES
            .iter()
            .map(|item| item.to_string())
            .collect(),
        shell_fully_initialized: true,
    }
}

fn registry(active: &ShellManifest, candidate: &ShellManifest) -> Connection {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    for (manifest, status) in [(active, "active"), (candidate, "candidate")] {
        connection.execute(
            "INSERT INTO shell_generations(build_id, manifest_json, manifest_sha256, status, installed_at_unix_ms)
             VALUES (?1, ?2, 'test', ?3, 1)",
            params![manifest.build_id, serde_json::to_string(manifest).unwrap(), status],
        ).unwrap();
    }
    connection.execute(
        "UPDATE shell_registry SET active_build_id = ?1, candidate_build_id = ?2 WHERE singleton = 1",
        params![active.build_id, candidate.build_id],
    ).unwrap();
    connection
}

#[test]
fn native_compatibility_rejects_unavailable_capability() {
    let mut value = manifest("hosted-test-v1");
    value
        .required_capabilities
        .push("filesystem.generic".into());
    assert!(shell_contract::validate_manifest(&value).is_err());
}

#[test]
fn manifest_rejects_private_data_payloads() {
    let mut value = manifest("hosted-test-v1");
    value.assets.push(ShellAsset {
        path: "session.json".into(),
        sha256: "0".repeat(64),
        bytes: 10,
        content_type: "application/json".into(),
    });
    assert!(shell_contract::validate_manifest(&value).is_err());
}

#[test]
fn app_ready_must_match_native_compatibility() {
    let value = manifest("hosted-test-v1");
    assert!(shell_contract::validate_ready_evidence(&value, &ready(&value.build_id, 999)).is_err());
}

#[test]
fn one_build_id_cannot_describe_two_shell_manifests() {
    let first = manifest("hosted-test-v1");
    let mut changed = first.clone();
    changed.assets[0].sha256 = "1".repeat(64);
    let state = ShellState {
        active: Some(first),
        previous: None,
        candidate: None,
    };
    assert!(incoming_is_current(&state, &changed).is_err());
}

#[test]
fn healthy_candidate_promotes_atomically_and_retains_previous() {
    let active = manifest("hosted-test-v1");
    let candidate = manifest("hosted-test-v2");
    let mut connection = registry(&active, &candidate);
    let nonce = "health-nonce".to_string();
    let mut state = ShellState {
        active: Some(active.clone()),
        previous: None,
        candidate: Some(CandidateShell {
            manifest: candidate.clone(),
            health_nonce: nonce.clone(),
        }),
    };
    confirm_candidate(
        &mut connection,
        &mut state,
        &ConfirmCandidateRequest {
            build_id: candidate.build_id.clone(),
            health_nonce: nonce,
            evidence: ready(&candidate.build_id, LOCAL_SCHEMA_VERSION),
        },
    )
    .unwrap();
    let row: (String, String, Option<String>) = connection
        .query_row(
            "SELECT active_build_id, previous_build_id, candidate_build_id FROM shell_registry",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(row, (candidate.build_id, active.build_id, None));
}

#[test]
fn failed_app_ready_preserves_active_and_candidate_for_recovery() {
    let active = manifest("hosted-test-v1");
    let candidate = manifest("hosted-test-v2");
    let mut connection = registry(&active, &candidate);
    let mut state = ShellState {
        active: Some(active.clone()),
        previous: None,
        candidate: Some(CandidateShell {
            manifest: candidate.clone(),
            health_nonce: "nonce".into(),
        }),
    };
    let result = confirm_candidate(
        &mut connection,
        &mut state,
        &ConfirmCandidateRequest {
            build_id: candidate.build_id.clone(),
            health_nonce: "nonce".into(),
            evidence: ready(&candidate.build_id, 999),
        },
    );
    assert!(result.is_err());
    let row: (String, String) = connection
        .query_row(
            "SELECT active_build_id, candidate_build_id FROM shell_registry",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(row, (active.build_id, candidate.build_id));
}
