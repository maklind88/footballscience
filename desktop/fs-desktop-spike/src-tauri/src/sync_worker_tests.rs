use super::*;
use crate::authority::{CredentialVault, SYNTHETIC_PARTITION_KEY};
use crate::local_data::{SYNTHETIC_SESSION_ID, SessionOperation, SessionOperationRequest};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;
use zeroize::Zeroizing;

#[path = "sync_fault_tests.rs"]
mod faults;

#[derive(Default)]
struct MemoryVault(Mutex<HashMap<String, Vec<u8>>>);
impl CredentialVault for MemoryVault {
    fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(self.0.lock().unwrap().get(account).cloned())
    }
    fn write(&self, account: &str, value: &[u8]) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(account.into(), value.to_vec());
        Ok(())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(account);
        Ok(())
    }
}

struct Fixture {
    root: std::path::PathBuf,
    db: Mutex<Connection>,
    auth: Mutex<SessionAuthority>,
    owner: Mutex<()>,
    context: SessionContextProof,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("fs-native-sync-{}", Uuid::new_v4()));
        let db = Mutex::new(local_data::open(&root.join("local.sqlite3")).unwrap());
        let authority = SessionAuthority::new_sync_test(Arc::new(MemoryVault::default())).unwrap();
        activate(&authority);
        let snapshot = authority.snapshot();
        let context = SessionContextProof {
            actor_id: snapshot.actor_id,
            organization_id: snapshot.organization_id,
            partition_key: snapshot.partition_key,
            auth_epoch: snapshot.auth_epoch,
            frontend_build_id: "native-sync-test".into(),
        };
        Self {
            root,
            db,
            auth: Mutex::new(authority),
            owner: Mutex::new(()),
            context,
        }
    }

    fn enqueue(&self, id: &str, revision: i64) {
        let request = SessionOperationRequest {
            operation_id: id.into(),
            operation_version: 1,
            client_instance_id: "00000000-0000-4000-8000-000000005001".into(),
            session_id: SYNTHETIC_SESSION_ID.into(),
            base_revision: revision,
            context: SessionContextProof {
                actor_id: self.context.actor_id.clone(),
                organization_id: self.context.organization_id.clone(),
                partition_key: self.context.partition_key.clone(),
                auth_epoch: self.context.auth_epoch,
                frontend_build_id: self.context.frontend_build_id.clone(),
            },
            operation: SessionOperation::RenameSession {
                title: format!("Offline revision {}", revision + 1),
            },
        };
        local_data::apply_operation(&mut self.db.lock().unwrap(), &request, 1000).unwrap();
    }

    fn sync(&self, api: &DesktopAuthApi) -> Result<local_data::SessionSyncStatus, String> {
        sync_once(
            api,
            &self.auth,
            &self.db,
            &self.owner,
            &self.context,
            || Ok(()),
        )
    }

    fn reopen(&self) {
        // Close the actual file-backed connection; no in-memory projection survives.
        let mut db = self.db.lock().unwrap();
        *db = Connection::open_in_memory().unwrap();
        *db = local_data::open(&self.root.join("local.sqlite3")).unwrap();
    }

    fn counts(&self) -> (i64, i64) {
        self.db.lock().unwrap().query_row("SELECT (SELECT count(*) FROM session_outbox), (SELECT count(*) FROM operation_receipts)",
            [], |row| Ok((row.get(0)?, row.get(1)?))).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        *self.db.get_mut().unwrap() = Connection::open_in_memory().unwrap();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn activate(authority: &SessionAuthority) {
    authority
        .activate_account(
            authority.snapshot(),
            Zeroizing::new("synthetic-access-only-001".into()),
            Zeroizing::new("synthetic-refresh-only-001".into()),
            now_unix_ms().unwrap() + 300_000,
        )
        .unwrap();
}

fn server() -> (DesktopAuthApi, TcpListener) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let api =
        DesktopAuthApi::new_test_loopback(&format!("http://{}/", listener.local_addr().unwrap()))
            .unwrap();
    (api, listener)
}

fn read_request(stream: &mut TcpStream) -> Value {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 4096];
        let count = stream.read(&mut chunk).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&chunk[..count]);
        assert!(bytes.len() < 40 * 1024);
        if let Some(end) = bytes.windows(4).position(|x| x == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let length = headers
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap();
            if bytes.len() >= end + 4 + length {
                assert!(headers.starts_with("POST /api/desktop-session-sync HTTP/1.1"));
                assert!(
                    headers
                        .to_ascii_lowercase()
                        .contains("authorization: bearer synthetic-access-only-001")
                );
                let body: Value =
                    serde_json::from_slice(&bytes[end + 4..end + 4 + length]).unwrap();
                assert_eq!(body["schema"], "fs-desktop-session-sync-request-v1");
                assert_eq!(body.as_object().unwrap().len(), 5);
                assert!(body.get("actorId").is_none());
                return body;
            }
        }
    }
}

fn ack(body: &Value, kind: &str) -> Value {
    json!({ "ok": true, "schema": "fs-desktop-session-sync-response-v1", "syncProtocolVersion": 1,
        "requestId": "synthetic-request", "operationId": body["operation"]["operationId"],
        "acknowledgement": kind, "acknowledgementId": "00000000-0000-4000-8000-000000009001",
        "resultingRevision": body["operation"]["baseRevision"].as_i64().unwrap() + 1, "result": {} })
}

fn respond(stream: &mut TcpStream, status: u16, body: &str) {
    write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
}

#[test]
fn lost_http_ack_replays_identical_request_after_database_restart() {
    let fixture = Fixture::new();
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    let (api, listener) = server();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let first = read_request(&mut stream);
        // Server accepted the operation; its response is lost before client commit.
        drop(stream);
        let (mut stream, _) = listener.accept().unwrap();
        let replay = read_request(&mut stream);
        assert_eq!(first, replay);
        respond(
            &mut stream,
            200,
            &ack(&replay, "already-applied").to_string(),
        );
    });
    assert!(fixture.sync(&api).is_err());
    assert_eq!(fixture.counts(), (1, 0));
    fixture.reopen();
    assert_eq!(fixture.sync(&api).unwrap().state, "synced");
    server.join().unwrap();
    fixture.reopen();
    assert_eq!(fixture.counts(), (0, 1));
    assert_eq!(
        local_data::read_selected_session(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .session
            .revision,
        8
    );
}

#[test]
fn revision_order_wins_over_uuid_and_timestamp_order() {
    let fixture = Fixture::new();
    fixture.enqueue("ffffffff-ffff-4fff-8fff-ffffffffffff", 7);
    fixture.enqueue("00000000-0000-4000-8000-000000000001", 8);
    let (api, listener) = server();
    let server = std::thread::spawn(move || {
        for revision in [7, 8] {
            let (mut stream, _) = listener.accept().unwrap();
            let body = read_request(&mut stream);
            assert_eq!(body["operation"]["baseRevision"], revision);
            let mut response = ack(&body, "accepted");
            response["acknowledgementId"] = json!(Uuid::new_v4().to_string());
            respond(&mut stream, 200, &response.to_string());
        }
    });
    assert_eq!(fixture.sync(&api).unwrap().pending_operation_count, 1);
    assert_eq!(fixture.sync(&api).unwrap().pending_operation_count, 0);
    server.join().unwrap();
    assert_eq!(fixture.counts(), (0, 2));
}

#[test]
fn conflict_survives_restart_and_blocks_dependent_operations() {
    let fixture = Fixture::new();
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    fixture.enqueue(&Uuid::new_v4().to_string(), 8);
    let (api, listener) = server();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut response = ack(&read_request(&mut stream), "conflict");
        response["resultingRevision"] = json!(20);
        response["acknowledgementId"] = Value::Null;
        respond(&mut stream, 200, &response.to_string());
    });
    assert_eq!(fixture.sync(&api).unwrap().state, "conflict");
    server.join().unwrap();
    fixture.reopen();
    // Listener is gone: success here also proves there was no second HTTP request.
    assert_eq!(fixture.sync(&api).unwrap().state, "conflict");
    assert_eq!(fixture.counts(), (2, 0));
    assert_eq!(
        local_data::read_selected_session(&fixture.db.lock().unwrap(), SYNTHETIC_PARTITION_KEY)
            .unwrap()
            .session
            .title,
        "Offline revision 9"
    );
}

#[test]
fn invalid_acknowledgements_never_delete_pending_work() {
    for mutation in [
        "operationId",
        "resultingRevision",
        "schema",
        "syncProtocolVersion",
        "acknowledgementId",
        "extra",
        "ok",
        "result",
    ] {
        let fixture = Fixture::new();
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut response = ack(&read_request(&mut stream), "accepted");
            response[mutation] = json!("invalid");
            respond(&mut stream, 200, &response.to_string());
        });
        assert!(fixture.sync(&api).is_err(), "{mutation}");
        server.join().unwrap();
        fixture.reopen();
        assert_eq!(fixture.counts(), (1, 0), "{mutation}");
    }
}

#[test]
fn transient_http_errors_preserve_retryable_work_without_automatic_retry() {
    for status in [429, 500, 503] {
        let fixture = Fixture::new();
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            respond(&mut stream, status, "{}");
        });
        assert!(fixture.sync(&api).is_err());
        server.join().unwrap();
        assert_eq!(fixture.counts(), (1, 0));
        assert_eq!(
            fixture
                .db
                .lock()
                .unwrap()
                .query_row("SELECT attempt_count FROM session_outbox", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}

#[test]
fn authorization_denial_quarantines_without_losing_work() {
    for status in [401, 403] {
        let fixture = Fixture::new();
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            respond(&mut stream, status, "{}");
        });
        assert!(
            fixture
                .sync(&api)
                .unwrap_err()
                .contains("authorization denied")
        );
        server.join().unwrap();
        fixture.reopen();
        assert_eq!(fixture.counts(), (1, 0));
        assert_eq!(
            local_data::read_session_sync_status(
                &fixture.db.lock().unwrap(),
                SYNTHETIC_PARTITION_KEY
            )
            .unwrap()
            .quarantined_operation_count,
            1
        );
        if status == 401 {
            assert!(!fixture.auth.lock().unwrap().snapshot().can_sync);
        }
    }
}

#[test]
fn late_ack_and_late_401_cannot_affect_reauthenticated_account() {
    for status in [200, 401] {
        let fixture = Arc::new(Fixture::new());
        fixture.enqueue(&Uuid::new_v4().to_string(), 7);
        let (api, listener) = server();
        let server_fixture = fixture.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let body = read_request(&mut stream);
            // Reauthentication changes epoch; locks must be available during network IO.
            activate(&server_fixture.auth.lock().unwrap());
            assert!(server_fixture.db.try_lock().is_ok());
            respond(&mut stream, status, &ack(&body, "accepted").to_string());
        });
        assert!(fixture.sync(&api).unwrap_err().contains("native authority"));
        server.join().unwrap();
        assert_eq!(fixture.counts(), (1, 0));
        assert!(fixture.auth.lock().unwrap().snapshot().can_sync);
    }
}

#[test]
fn expired_lease_single_owner_and_corrupt_queue_fail_before_network() {
    let fixture = Fixture::new();
    fixture.enqueue(&Uuid::new_v4().to_string(), 7);
    let (api, listener) = server();
    drop(listener);
    let owner = fixture.owner.lock().unwrap();
    assert!(fixture.sync(&api).unwrap_err().contains("already running"));
    drop(owner);
    fixture
        .db
        .lock()
        .unwrap()
        .execute("UPDATE session_outbox SET payload_json = '{}'", [])
        .unwrap();
    assert!(fixture.sync(&api).unwrap_err().contains("integrity"));
    fixture.auth.lock().unwrap().expire_offline_lease_for_test();
    assert!(fixture.sync(&api).unwrap_err().contains("expired"));
    assert_eq!(fixture.counts(), (1, 0));
}
