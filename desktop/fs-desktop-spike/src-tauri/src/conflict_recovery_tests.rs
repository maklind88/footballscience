use super::*;
use crate::conflict_recovery;

fn conflicted() -> Fixture {
    let f = Fixture::new();
    f.enqueue("00000000-0000-4000-8000-000000006001", 7);
    f.enqueue("00000000-0000-4000-8000-000000006002", 8);
    let db = f.db.lock().unwrap();
    let p = sync_queue::next_pending(&db, SYNTHETIC_PARTITION_KEY)
        .unwrap()
        .unwrap();
    let mut response = ack(
        &serde_json::from_str(&p.wire_body().unwrap()).unwrap(),
        "conflict",
    );
    response["resultingRevision"] = json!(10);
    let ack = sync_queue::parse_ack(&response.to_string(), &p).unwrap();
    drop(db);
    sync_queue::commit_ack(&mut f.db.lock().unwrap(), &p, &ack, 1000).unwrap();
    f
}

fn snapshot(revision: i64) -> Value {
    json!({"ok":true,"schema":"fs-desktop-session-snapshot-response-v1","syncProtocolVersion":1,
        "requestId":"recovery-test","snapshot":{"schema":"fs-desktop-session-snapshot-v1",
        "session":{"id":SYNTHETIC_SESSION_ID,"title":"Other coach version","sessionDate":"2026-09-01",
            "revision":revision,"content":{"source":"synthetic-selected-slice"}},
        "blocks":[{"id":"00000000-0000-4000-8000-000000001101","sortOrder":1,"revision":7,
            "payload":{"title":"Remote activation","durationMinutes":19}},
            {"id":"00000000-0000-4000-8000-000000001102","sortOrder":2,"revision":7,
            "payload":{"title":"Remote game","durationMinutes":31}}]}})
}

fn get_request(stream: &mut TcpStream) {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut bytes = Vec::new();
    while !bytes.windows(4).any(|b| b == b"\r\n\r\n") {
        let mut buf = [0; 1024];
        let n = stream.read(&mut buf).unwrap();
        assert!(n > 0 && bytes.len() < 8192);
        bytes.extend_from_slice(&buf[..n]);
    }
    let headers = String::from_utf8(bytes).unwrap();
    assert!(headers.starts_with(&format!("GET /api/desktop-session-sync?sessionId={SYNTHETIC_SESSION_ID}&syncProtocolVersion=1 HTTP/1.1")));
    assert!(
        headers
            .to_lowercase()
            .contains("authorization: bearer synthetic-access-only-001")
    );
}

fn call(f: &Fixture, body: Value, token: Option<&str>) -> Result<Value, String> {
    let (api, listener) = server();
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        get_request(&mut stream);
        respond(&mut stream, 200, &body.to_string());
    });
    let result =
        conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, token, || Ok(()));
    handle.join().unwrap();
    result
}

#[test]
fn review_cancel_is_read_only_and_rebase_preserves_originals_after_restart() {
    let f = conflicted();
    let review = call(&f, snapshot(10), None).unwrap();
    assert_eq!(review["operations"].as_array().unwrap().len(), 2);
    assert_eq!(review["localTitle"], "Offline revision 9");
    assert_eq!(review["serverTitle"], "Other coach version");
    assert_eq!(f.counts(), (2, 0));
    f.reopen();
    let result = call(&f, snapshot(10), review["reviewToken"].as_str()).unwrap();
    assert_eq!(result["uploaded"], false);
    assert_eq!(result["requeuedOperationCount"], 2);
    f.reopen();
    let mut db = f.db.lock().unwrap();
    let archive: String = db
        .query_row(
            "SELECT value FROM local_meta WHERE key = ?1",
            [format!(
                "session-recovery:{}",
                result["recoveryId"].as_str().unwrap()
            )],
            |r| r.get(0),
        )
        .unwrap();
    let archive: Value = serde_json::from_str(&archive).unwrap();
    assert_eq!(archive["originalRequests"].as_array().unwrap().len(), 2);
    assert_eq!(archive["originalProjection"]["session"]["revision"], 9);
    let original = serde_json::from_value(archive["originalRequests"][0].clone()).unwrap();
    assert!(local_data::apply_operation(&mut db, &original, 3000).is_err());
    let local = local_data::read_selected_session(&db, SYNTHETIC_PARTITION_KEY).unwrap();
    assert_eq!(local.session.title, "Offline revision 9");
    assert_eq!(local.session.revision, 12);
    assert_eq!(local.blocks[0].duration_minutes, 19);
    assert_eq!(local.blocks[0].title, "Remote activation");
    let first = sync_queue::next_pending(&db, SYNTHETIC_PARTITION_KEY)
        .unwrap()
        .unwrap();
    assert_eq!(first.request.base_revision, 10);
    assert_ne!(
        first.request.operation_id,
        "00000000-0000-4000-8000-000000006001"
    );
    assert_eq!(
        local_data::read_session_sync_status(&db, SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .state,
        "pending"
    );
    drop(db);
    // Repeating the confirmation cannot rebase again or cause a network request.
    let (api, _listener) = server();
    assert_eq!(
        conflict_recovery::run(
            &api,
            &f.auth,
            &f.db,
            &f.owner,
            &f.context,
            review["reviewToken"].as_str(),
            || Ok(())
        )
        .unwrap(),
        result
    );
}

#[test]
fn changed_server_or_local_work_requires_new_review_without_mutation() {
    let f = conflicted();
    let review = call(&f, snapshot(10), None).unwrap();
    assert!(
        call(&f, snapshot(11), review["reviewToken"].as_str())
            .unwrap_err()
            .contains("review changed")
    );
    f.enqueue(&Uuid::new_v4().to_string(), 9);
    assert!(
        call(&f, snapshot(10), review["reviewToken"].as_str())
            .unwrap_err()
            .contains("review changed")
    );
    assert_eq!(f.counts(), (3, 0));
    f.reopen();
    assert_eq!(
        local_data::read_session_sync_status(&f.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .state,
        "conflict"
    );
}

#[test]
fn malformed_unknown_or_structurally_changed_snapshots_preserve_everything() {
    let f = conflicted();
    let mut bodies = vec![snapshot(9), snapshot(10)];
    bodies[1]["snapshot"]["session"]["id"] = json!(Uuid::new_v4().to_string());
    let mut unknown = snapshot(10);
    unknown["snapshot"]["blocks"][0]["payload"]["medicalData"] = json!("never project this");
    bodies.push(unknown);
    let mut structural = snapshot(10);
    structural["snapshot"]["blocks"]
        .as_array_mut()
        .unwrap()
        .pop();
    bodies.push(structural);
    let mut duplicate = snapshot(10);
    duplicate["snapshot"]["blocks"][1] = duplicate["snapshot"]["blocks"][0].clone();
    bodies.push(duplicate);
    for body in bodies {
        assert!(call(&f, body, None).is_err());
        assert_eq!(f.counts(), (2, 0));
    }
}

#[test]
fn interrupted_rebase_rolls_back_archive_queue_and_projection_together() {
    let f = conflicted();
    let review = call(&f, snapshot(10), None).unwrap();
    f.db.lock()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER fail_rebase BEFORE INSERT ON session_outbox
        BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END;",
        )
        .unwrap();
    assert!(call(&f, snapshot(10), review["reviewToken"].as_str()).is_err());
    f.reopen();
    let db = f.db.lock().unwrap();
    assert_eq!(
        local_data::read_selected_session(&db, SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .session
            .revision,
        9
    );
    let archives: i64 = db
        .query_row(
            "SELECT count(*) FROM local_meta WHERE key LIKE 'session-recovery:%'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(archives, 0);
    assert_eq!(
        local_data::read_session_sync_status(&db, SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .state,
        "conflict"
    );
}

#[test]
fn late_snapshot_after_logout_never_returns_review_or_commits() {
    let f = conflicted();
    let (api, listener) = server();
    let result = std::thread::scope(|scope| {
        scope.spawn(|| {
            let (mut stream, _) = listener.accept().unwrap();
            get_request(&mut stream);
            f.auth.lock().unwrap().logout().unwrap();
            respond(&mut stream, 200, &snapshot(10).to_string());
        });
        conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, None, || Ok(()))
    });
    assert!(result.is_err());
    assert_eq!(f.counts(), (2, 0));
}

#[test]
fn quarantine_and_worker_lock_cannot_be_bypassed_by_recovery() {
    let f = conflicted();
    let (api, _listener) = server();
    let lock = f.owner.lock().unwrap();
    assert!(
        conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, None, || Ok(()))
            .is_err()
    );
    drop(lock);
    local_data::quarantine_operation(
        &f.db.lock().unwrap(),
        "00000000-0000-4000-8000-000000006001",
        "tenant-denied",
        3000,
    )
    .unwrap();
    assert!(
        conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, None, || Ok(()))
            .is_err()
    );
    assert_eq!(f.counts(), (2, 0));
}

#[test]
fn recovery_reapplies_duration_intent_but_preserves_unedited_remote_values() {
    let f = conflicted();
    let request = serde_json::from_value(json!({
        "operationId": Uuid::new_v4().to_string(), "operationVersion": 1,
        "clientInstanceId": "00000000-0000-4000-8000-000000005001",
        "sessionId": SYNTHETIC_SESSION_ID, "baseRevision": 9, "context": f.context,
        "operation": {"operationType": "block.duration.set",
            "blockId": "00000000-0000-4000-8000-000000001101", "durationMinutes": 22}
    }))
    .unwrap();
    local_data::apply_operation(&mut f.db.lock().unwrap(), &request, 2000).unwrap();
    let review = call(&f, snapshot(10), None).unwrap();
    assert_eq!(review["blocks"][0]["localMinutes"], 22);
    assert_eq!(review["blocks"][0]["serverMinutes"], 19);
    call(&f, snapshot(10), review["reviewToken"].as_str()).unwrap();
    f.reopen();
    let db = f.db.lock().unwrap();
    let local = local_data::read_selected_session(&db, SYNTHETIC_PARTITION_KEY).unwrap();
    assert_eq!(local.blocks[0].duration_minutes, 22);
    assert_eq!(local.blocks[1].duration_minutes, 31);
    assert_eq!(local.session.revision, 13);
    assert_eq!(
        sync_queue::pending_at(&db, SYNTHETIC_PARTITION_KEY, 2)
            .unwrap()
            .unwrap()
            .request
            .base_revision,
        12
    );
}

#[test]
fn rotated_credential_during_confirmation_never_creates_recovery_checkpoint() {
    let f = conflicted();
    let review = call(&f, snapshot(10), None).unwrap();
    let (api, listener) = server();
    let result = std::thread::scope(|scope| {
        scope.spawn(|| {
            let (mut stream, _) = listener.accept().unwrap();
            get_request(&mut stream);
            f.auth
                .lock()
                .unwrap()
                .refresh_if_needed(600_000, |_| {
                    Ok(crate::authority::RefreshedCredentials {
                        access_token: Zeroizing::new("synthetic-rotated-access".into()),
                        refresh_token: Zeroizing::new("synthetic-rotated-refresh".into()),
                        access_expires_at_unix_ms: now_unix_ms().unwrap() + 300_000,
                        verified_snapshot: None,
                    })
                })
                .unwrap();
            respond(&mut stream, 200, &snapshot(10).to_string());
        });
        conflict_recovery::run(
            &api,
            &f.auth,
            &f.db,
            &f.owner,
            &f.context,
            review["reviewToken"].as_str(),
            || Ok(()),
        )
    });
    assert!(result.unwrap_err().contains("credential changed"));
    assert_eq!(f.counts(), (2, 0));
}

#[test]
fn unavailable_snapshot_never_clears_conflict_or_original_operations() {
    for status in [401, 403, 429, 500, 503] {
        let f = conflicted();
        let (api, listener) = server();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            get_request(&mut stream);
            respond(&mut stream, status, "{}");
        });
        assert!(
            conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, None, || Ok(()))
                .is_err()
        );
        server.join().unwrap();
        f.reopen();
        assert_eq!(f.counts(), (2, 0));
        assert_eq!(
            local_data::read_session_sync_status(&f.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
                .unwrap()
                .state,
            "conflict"
        );
    }
}

#[test]
fn uncertain_or_corrupt_dependent_work_cannot_be_rebased() {
    for change in [
        "UPDATE session_outbox SET attempt_count = 1 WHERE base_revision = 8",
        "UPDATE session_outbox SET request_sha256 = 'altered' WHERE base_revision = 8",
        "UPDATE session_projection SET revision = 99",
        "UPDATE session_outbox SET team_id = 'another-team' WHERE base_revision = 8",
    ] {
        let f = conflicted();
        f.db.lock().unwrap().execute_batch(change).unwrap();
        let (api, listener) = server();
        listener.set_nonblocking(true).unwrap();
        assert!(
            conflict_recovery::run(&api, &f.auth, &f.db, &f.owner, &f.context, None, || Ok(()))
                .is_err()
        );
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        assert_eq!(f.counts(), (2, 0));
    }
}
