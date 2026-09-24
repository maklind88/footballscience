use super::*;

#[test]
fn generic_api_broker_drops_old_account_data_and_cannot_revoke_new_session() {
    for scenario in ["account", "logout", "rotation"] {
        for status in [200, 401] {
            let fixture = Arc::new(Fixture::new());
            fixture.enqueue(&Uuid::new_v4().to_string(), 7);
            let body =
                sync_queue::next_pending(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
                    .unwrap()
                    .unwrap()
                    .wire_body()
                    .unwrap();
            let (api, listener) = server();
            let server_fixture = fixture.clone();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                read_request(&mut stream);
                let authority = server_fixture.auth.lock().unwrap();
                match scenario {
                    "account" => {
                        let mut snapshot = authority.snapshot();
                        snapshot.actor_id = "00000000-0000-4000-8000-000000000102".into();
                        snapshot.partition_key = "another-account-partition".into();
                        authority
                            .activate_account(
                                snapshot,
                                Zeroizing::new("synthetic-new-account-access".into()),
                                Zeroizing::new("synthetic-new-account-refresh".into()),
                                now_unix_ms().unwrap() + 300_000,
                            )
                            .unwrap();
                    }
                    "logout" => authority.logout().unwrap(),
                    "rotation" => {
                        authority
                            .refresh_if_needed(600_000, |_| {
                                Ok(crate::authority::RefreshedCredentials {
                                    access_token: Zeroizing::new(
                                        "synthetic-access-rotated-002".into(),
                                    ),
                                    refresh_token: Zeroizing::new(
                                        "synthetic-refresh-rotated-002".into(),
                                    ),
                                    access_expires_at_unix_ms: now_unix_ms().unwrap() + 300_000,
                                    verified_snapshot: None,
                                })
                            })
                            .unwrap();
                    }
                    _ => unreachable!(),
                }
                drop(authority);
                respond(
                    &mut stream,
                    status,
                    r#"{"oldAccountData":"must not reach the new session"}"#,
                );
            });
            let result = crate::auth_request::request(
                &api,
                &fixture.auth,
                &crate::auth_api::DesktopApiRequest {
                    path: "/api/desktop-session-sync".into(),
                    method: "POST".into(),
                    body,
                    content_type: "application/json".into(),
                },
            );
            let error = match result {
                Err(error) => error,
                Ok(_) => panic!("old account response escaped the broker"),
            };
            assert!(error.contains("while awaiting response"));
            server.join().unwrap();
            assert_eq!(
                fixture.auth.lock().unwrap().snapshot().can_sync,
                scenario != "logout"
            );
        }
    }
}

#[test]
fn late_response_from_old_token_cannot_commit_or_revoke_rotated_credentials() {
    for status in [200, 401] {
        let fixture = Arc::new(Fixture::new());
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server_fixture = fixture.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let body = read_request(&mut stream);
            let authority = server_fixture.auth.lock().unwrap();
            let epoch = authority.snapshot().auth_epoch;
            authority
                .refresh_if_needed(600_000, |_| {
                    Ok(crate::authority::RefreshedCredentials {
                        access_token: Zeroizing::new("synthetic-access-rotated-002".into()),
                        refresh_token: Zeroizing::new("synthetic-refresh-rotated-002".into()),
                        access_expires_at_unix_ms: now_unix_ms().unwrap() + 300_000,
                        verified_snapshot: None,
                    })
                })
                .unwrap();
            assert_eq!(authority.snapshot().auth_epoch, epoch);
            drop(authority);
            respond(&mut stream, status, &ack(&body, "accepted").to_string());
        });
        assert!(
            fixture
                .sync(&api)
                .unwrap_err()
                .contains("credential rotated")
        );
        server.join().unwrap();
        assert_eq!(fixture.counts(), (1, 0));
        let authority = fixture.auth.lock().unwrap();
        assert!(authority.snapshot().can_sync);
        assert_eq!(
            authority.access_token().unwrap().as_str(),
            "synthetic-access-rotated-002"
        );
    }
}

#[test]
fn local_edit_during_inflight_push_survives_the_earlier_acknowledgement() {
    let fixture = Arc::new(Fixture::new());
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    let (api, listener) = server();
    let editing_fixture = fixture.clone();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let body = read_request(&mut stream);
        editing_fixture.enqueue(&Uuid::new_v4().to_string(), 8);
        respond(&mut stream, 200, &ack(&body, "accepted").to_string());
    });
    assert_eq!(fixture.sync(&api).unwrap().state, "pending");
    server.join().unwrap();
    fixture.reopen();
    assert_eq!(fixture.counts(), (1, 1));
    let local =
        local_data::read_selected_session(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
            .unwrap();
    assert_eq!(local.session.title, "Offline revision 9");
    assert_eq!(local.session.revision, 9);
}

#[test]
fn typed_block_duration_reaches_http_without_client_authorization_fields() {
    let fixture = Fixture::new();
    let request: SessionOperationRequest = serde_json::from_value(json!({
        "operationId": Uuid::new_v4().to_string(), "operationVersion": 1,
        "clientInstanceId": "00000000-0000-4000-8000-000000005001",
        "sessionId": SYNTHETIC_SESSION_ID, "baseRevision": 7, "context": fixture.context,
        "operation": { "operationType": "block.duration.set", "blockId": "00000000-0000-4000-8000-000000001101", "durationMinutes": 22 }
    })).unwrap();
    local_data::apply_operation(&mut fixture.db.lock().unwrap(), &request, 1000).unwrap();
    let (api, listener) = server();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let body = read_request(&mut stream);
        assert_eq!(body["operation"]["operationType"], "block.duration.set");
        assert_eq!(
            body["operation"]["payload"],
            json!({ "blockId": "00000000-0000-4000-8000-000000001101", "durationMinutes": 22 })
        );
        assert!(body["operation"].get("context").is_none());
        respond(&mut stream, 200, &ack(&body, "accepted").to_string());
    });
    assert_eq!(fixture.sync(&api).unwrap().state, "synced");
    server.join().unwrap();
    fixture.reopen();
    assert_eq!(fixture.counts(), (0, 1));
    assert_eq!(
        local_data::read_selected_session(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .blocks[0]
            .duration_minutes,
        22
    );
}

#[test]
fn native_http_handler_and_disposable_postgres_recover_lost_ack_then_preserve_conflict() {
    use std::io::BufRead;
    use std::process::{Command, Stdio};
    struct ServerProcess(std::process::Child);
    impl Drop for ServerProcess {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../local-integration/native-sync-server.mjs");
    let mut server = ServerProcess(
        Command::new("node")
            .arg(script)
            .arg("--native-sync-test-only")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Node and isolated desktop npm dependencies are required"),
    );
    let mut output = std::io::BufReader::new(server.0.stdout.take().unwrap());
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    let ready: Value = serde_json::from_str(&line).expect("local integration server did not start");
    let api = DesktopAuthApi::new_test_loopback(ready["origin"].as_str().unwrap()).unwrap();
    let fixture = Fixture::new();
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    assert!(fixture.sync(&api).is_err());
    fixture.reopen();
    assert_eq!(fixture.counts(), (1, 0));
    assert_eq!(fixture.sync(&api).unwrap().state, "synced");
    fixture.enqueue(&Uuid::new_v4().to_string(), 8);
    assert_eq!(fixture.sync(&api).unwrap().state, "conflict");
    fixture.reopen();
    assert_eq!(fixture.counts(), (1, 1));
    assert_eq!(fixture.sync(&api).unwrap().state, "conflict");
    line.clear();
    output.read_line(&mut line).unwrap();
    let evidence: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(
        evidence,
        json!({ "requests": 3, "serverApplications": 1, "revision": 9, "conflictPreserved": true })
    );
    assert!(server.0.wait().unwrap().success());
}

#[test]
fn rust_wire_matches_the_fixture_validated_by_the_real_js_handler() {
    let fixture = Fixture::new();
    fixture.enqueue("00000000-0000-4000-8000-000000006001", 7);
    let pending = sync_queue::next_pending(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
        .unwrap()
        .unwrap();
    let wire: Value = serde_json::from_str(&pending.wire_body().unwrap()).unwrap();
    let expected: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/native-sync-wire.json")).unwrap();
    assert_eq!(wire, expected);
}

#[test]
fn receipt_insert_and_queue_delete_roll_back_together_on_sqlite_failure() {
    let fixture = Fixture::new();
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    fixture.db.lock().unwrap().execute_batch(
        "CREATE TRIGGER fail_queue_delete BEFORE DELETE ON session_outbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END;"
    ).unwrap();
    let (api, listener) = server();
    let server = std::thread::spawn(move || {
        for kind in ["accepted", "already-applied"] {
            let (mut stream, _) = listener.accept().unwrap();
            let body = read_request(&mut stream);
            respond(&mut stream, 200, &ack(&body, kind).to_string());
        }
    });
    assert!(
        fixture
            .sync(&api)
            .unwrap_err()
            .contains("queue commit failed")
    );
    fixture.reopen();
    assert_eq!(fixture.counts(), (1, 0));
    fixture
        .db
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER fail_queue_delete")
        .unwrap();
    assert_eq!(fixture.sync(&api).unwrap().state, "synced");
    server.join().unwrap();
    assert_eq!(fixture.counts(), (0, 1));
}

#[test]
fn oversize_html_truncated_and_redirect_responses_preserve_queue() {
    for scenario in ["oversize", "html", "truncated", "redirect"] {
        let fixture = Fixture::new();
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let (redirect_api, redirect_listener) = server();
        drop(redirect_api);
        redirect_listener.set_nonblocking(true).unwrap();
        let redirect_address = redirect_listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            match scenario {
                "oversize" => {
                    // Declared length is enough to reject, without sending a large body.
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 32769\r\nConnection: close\r\n\r\n").unwrap();
                }
                "html" => {
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
                }
                "truncated" => {
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{{}}").unwrap();
                }
                "redirect" => {
                    write!(stream, "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{redirect_address}/stolen\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
                }
                _ => unreachable!(),
            }
        });
        assert!(fixture.sync(&api).is_err(), "{scenario}");
        server.join().unwrap();
        assert_eq!(fixture.counts(), (1, 0));
        assert_eq!(
            redirect_listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
}

#[test]
fn logout_lease_expiry_and_shell_change_during_http_preserve_pending_work() {
    for scenario in ["logout", "lease", "shell"] {
        let fixture = Arc::new(Fixture::new());
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server_fixture = fixture.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let body = read_request(&mut stream);
            match scenario {
                "logout" => server_fixture.auth.lock().unwrap().logout().unwrap(),
                "lease" => server_fixture
                    .auth
                    .lock()
                    .unwrap()
                    .expire_offline_lease_for_test(),
                _ => {}
            }
            respond(&mut stream, 200, &ack(&body, "accepted").to_string());
        });
        let calls = std::cell::Cell::new(0);
        let result = sync_once(
            &api,
            &fixture.auth,
            &fixture.db,
            &fixture.owner,
            &fixture.context,
            || {
                calls.set(calls.get() + 1);
                if scenario == "shell" && calls.get() == 2 {
                    Err("active generation changed".into())
                } else {
                    Ok(())
                }
            },
        );
        assert!(result.is_err());
        server.join().unwrap();
        fixture.reopen();
        assert_eq!(fixture.counts(), (1, 0));
    }
}

#[test]
fn scope_tampering_and_quarantined_predecessor_cannot_be_uploaded() {
    for field in ["team_id", "tenant_id", "actor_id", "organization_id"] {
        let fixture = Fixture::new();
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        fixture
            .db
            .lock()
            .unwrap()
            .execute(
                &format!("UPDATE session_outbox SET {field} = 'another-scope'"),
                [],
            )
            .unwrap();
        let (api, listener) = server();
        listener.set_nonblocking(true).unwrap();
        assert!(fixture.sync(&api).is_err());
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        assert_eq!(fixture.counts(), (1, 0));
    }
    let fixture = Fixture::new();
    let first = Uuid::new_v4().to_string();
    fixture.enqueue(&first, 7);
    fixture.enqueue(&Uuid::new_v4().to_string(), 8);
    local_data::quarantine_operation(&fixture.db.lock().unwrap(), &first, "tenant-denied", 1000)
        .unwrap();
    let (api, listener) = server();
    listener.set_nonblocking(true).unwrap();
    assert_eq!(fixture.sync(&api).unwrap().state, "revoked");
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
    assert_eq!(fixture.counts(), (2, 0));
}
