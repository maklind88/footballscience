use super::*;
use std::collections::HashMap;

#[derive(Default)]
struct MemoryVault(Mutex<HashMap<String, Vec<u8>>>);

impl CredentialVault for MemoryVault {
    fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(self.0.lock().unwrap().get(account).cloned())
    }
    fn write(&self, account: &str, secret: &[u8]) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(account.into(), secret.to_vec());
        Ok(())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(account);
        Ok(())
    }
}

fn activate(authority: &SessionAuthority, actor: &str, generation: &str) {
    let mut snapshot = authority.snapshot();
    snapshot.actor_id = actor.into();
    snapshot.organization_id = SYNTHETIC_ORGANIZATION_ID.into();
    snapshot.tenant_id = SYNTHETIC_TENANT_ID.into();
    snapshot.team_id = SYNTHETIC_TEAM_ID.into();
    snapshot.partition_key = format!("synthetic:{actor}");
    snapshot.auth_epoch = 1;
    authority
        .activate_account(
            snapshot,
            Zeroizing::new(format!("synthetic-access-{generation}")),
            Zeroizing::new(format!("synthetic-refresh-{generation}")),
            1,
        )
        .unwrap();
}

fn refreshed() -> RefreshedCredentials {
    RefreshedCredentials {
        access_token: Zeroizing::new("synthetic-late-access-result".into()),
        refresh_token: Zeroizing::new("synthetic-late-refresh-result".into()),
        access_expires_at_unix_ms: now_unix_ms().unwrap() + 60_000,
        verified_snapshot: None,
    }
}

#[test]
fn security_review_late_refresh_cannot_restore_logged_out_or_revoked_credentials() {
    for revoke in [false, true] {
        let vault = Arc::new(MemoryVault::default());
        let authority =
            SessionAuthority::new_synthetic(vault.clone(), OfflineLeasePolicy::seconds(300))
                .unwrap();
        activate(&authority, SYNTHETIC_ACTOR_ID, "initial");
        let result = authority.refresh_if_needed(30_000, |_| {
            // Deterministic interleaving: invalidate after the request starts, before its response.
            if revoke {
                authority.revoke().unwrap();
            } else {
                authority.logout().unwrap();
            }
            Ok(refreshed())
        });
        assert!(result.is_err());
        assert!(!authority.snapshot().can_sync);
        assert!(
            vault.0.lock().unwrap().is_empty(),
            "late refresh recreated a deleted credential"
        );
    }
}

#[test]
fn security_review_late_refresh_cannot_replace_a_new_account_session() {
    for next_actor in [SYNTHETIC_ACTOR_ID, "00000000-0000-4000-8000-000000000102"] {
        let vault = Arc::new(MemoryVault::default());
        let authority =
            SessionAuthority::new_synthetic(vault.clone(), OfflineLeasePolicy::seconds(300))
                .unwrap();
        activate(&authority, SYNTHETIC_ACTOR_ID, "initial");
        let result = authority.refresh_if_needed(30_000, |_| {
            activate(&authority, next_actor, "new-session");
            Ok(refreshed())
        });
        assert!(
            result.is_err(),
            "old response accepted after session replacement"
        );
        assert_eq!(authority.snapshot().actor_id, next_actor);
        assert_eq!(
            authority
                .load_refresh(next_actor)
                .unwrap()
                .unwrap()
                .refresh_token,
            "synthetic-refresh-new-session"
        );
        assert_eq!(vault.0.lock().unwrap().len(), 2);
    }
}

// The two child invocations share only synthetic credentials on disk and the
// committed local database. They cannot inherit the first client's authority.
const RESTART_TEST_ROOT: &str = "FS_TEST_NATIVE_RESTART_ROOT";
const RESTART_TEST_PHASE: &str = "FS_TEST_NATIVE_RESTART_PHASE";
const RESTART_TEST_ORIGIN: &str = "FS_TEST_NATIVE_RESTART_ORIGIN";
const RESTART_OPERATION_ID: &str = "00000000-0000-4000-8000-000000005101";
const RESTART_TEST_ABRUPT_EXIT: i32 = 91;

struct RestartTestVault(std::path::PathBuf);

impl RestartTestVault {
    fn path(&self, account: &str) -> std::path::PathBuf {
        assert!(
            account == ACTIVE_ACCOUNT_POINTER
                || [
                    refresh_slot(SYNTHETIC_ACTOR_ID, 'a'),
                    refresh_slot(SYNTHETIC_ACTOR_ID, 'b')
                ]
                .iter()
                .any(|slot| slot == account)
        );
        self.0.join(account.replace(':', "-"))
    }
}

impl CredentialVault for RestartTestVault {
    fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String> {
        match std::fs::read(self.path(account)) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn write(&self, account: &str, secret: &[u8]) -> Result<(), String> {
        std::fs::write(self.path(account), secret).map_err(|error| error.to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match std::fs::remove_file(self.path(account)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

fn run_native_restart_phase(root: &std::path::Path, phase: &str, origin: &str) {
    use crate::{auth_api::DesktopAuthApi, local_data, sync_queue, sync_worker};

    let vault = Arc::new(RestartTestVault(root.join("synthetic-vault")));
    let policy = OfflineLeasePolicy::seconds(300);
    let authority = Mutex::new(match phase {
        "send" => {
            let authority = SessionAuthority::new_synthetic(vault, policy).unwrap();
            authority
                .activate_account(
                    authority.snapshot(),
                    Zeroizing::new("synthetic-access-only-001".into()),
                    Zeroizing::new("synthetic-refresh-only-001".into()),
                    now_unix_ms().unwrap() + 300_000,
                )
                .unwrap();
            authority
        }
        "replay" => SessionAuthority::restore_or_signed_out(vault, policy).unwrap(),
        other => panic!("unexpected restart proof phase: {other}"),
    });
    let db = Mutex::new(local_data::open(&root.join("sessions.sqlite3")).unwrap());
    let snapshot = authority.lock().unwrap().snapshot();
    let context = SessionContextProof {
        actor_id: snapshot.actor_id.clone(),
        organization_id: snapshot.organization_id.clone(),
        partition_key: snapshot.partition_key.clone(),
        auth_epoch: snapshot.auth_epoch,
        frontend_build_id: "synthetic-process-restart-test".into(),
    };
    let owner = Mutex::new(());
    let api = DesktopAuthApi::new_test_loopback(origin).unwrap();
    let sync = || sync_worker::sync_once(&api, &authority, &db, &owner, &context, || Ok(()));
    let queued = || sync_queue::next_pending(&db.lock().unwrap(), &context.partition_key).unwrap();

    if phase == "send" {
        let request = local_data::SessionOperationRequest {
            operation_id: RESTART_OPERATION_ID.into(),
            operation_version: 1,
            client_instance_id: "00000000-0000-4000-8000-000000005001".into(),
            session_id: local_data::SYNTHETIC_SESSION_ID.into(),
            base_revision: 7,
            context: context.clone(),
            operation: local_data::SessionOperation::RenameSession {
                title: "Offline revision 8".into(),
            },
        };
        local_data::apply_operation(&mut db.lock().unwrap(), &request, 1000).unwrap();
        assert!(sync().is_err(), "first acknowledgement must be lost");
        assert_eq!(queued().unwrap().request.operation_id, RESTART_OPERATION_ID);
        let receipts: i64 = db
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM operation_receipts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(receipts, 0);
        // Exit only this synthetic child, with the SQLite connection still open.
        // The next process must recover from disk without Rust drop handlers.
        std::process::exit(RESTART_TEST_ABRUPT_EXIT);
    }

    assert_eq!(snapshot.state, "offline-authorized");
    assert!(snapshot.can_read_offline);
    assert!(
        !snapshot.can_sync,
        "fresh process unexpectedly inherited the previous access token"
    );
    assert_eq!(snapshot.actor_id, SYNTHETIC_ACTOR_ID);
    assert_eq!(snapshot.team_id, SYNTHETIC_TEAM_ID);
    assert_eq!(snapshot.partition_key, SYNTHETIC_PARTITION_KEY);
    authority.lock().unwrap().validate(&context).unwrap();
    let local =
        local_data::read_selected_session(&db.lock().unwrap(), &context.partition_key).unwrap();
    assert_eq!(local.session.title, "Offline revision 8");
    assert_eq!(local.session.revision, 8);
    let pending = queued().unwrap();
    assert_eq!(pending.request.operation_id, RESTART_OPERATION_ID);
    assert_eq!(pending.request.context.auth_epoch, snapshot.auth_epoch);
    assert_eq!(
        sync().unwrap_err(),
        "queued operation does not match current native authority"
    );
    assert_eq!(
        queued().unwrap().wire_body().unwrap(),
        pending.wire_body().unwrap()
    );

    authority
        .lock()
        .unwrap()
        .refresh_if_needed(60_000, |stored| {
            assert_eq!(stored, "synthetic-refresh-only-001");
            Ok(RefreshedCredentials {
                access_token: Zeroizing::new("synthetic-access-after-restart-002".into()),
                refresh_token: Zeroizing::new("synthetic-refresh-after-restart-002".into()),
                access_expires_at_unix_ms: now_unix_ms().unwrap() + 300_000,
                verified_snapshot: Some(snapshot),
            })
        })
        .unwrap();

    assert_eq!(sync().unwrap().state, "synced");
    assert!(queued().is_none());
    let receipt: (String, i64) = db.lock().unwrap().query_row(
        "SELECT acknowledgement, resulting_revision FROM operation_receipts WHERE operation_id = ?",
        [RESTART_OPERATION_ID],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).unwrap();
    assert_eq!(receipt, ("already-applied".into(), 8));
}

#[test]
fn native_process_restart_replays_one_operation_under_restored_authority() {
    use std::io::BufRead;
    use std::process::{Child, Command, Stdio};

    if let Some(phase) = std::env::var_os(RESTART_TEST_PHASE) {
        let root = std::path::PathBuf::from(std::env::var_os(RESTART_TEST_ROOT).unwrap());
        assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
        let name = root.file_name().and_then(|name| name.to_str()).unwrap();
        assert!(Uuid::parse_str(name.strip_prefix("fs-native-restart-").unwrap()).is_ok());
        assert!(std::fs::symlink_metadata(&root).unwrap().is_dir());
        assert!(
            std::fs::symlink_metadata(root.join("synthetic-vault"))
                .unwrap()
                .is_dir()
        );
        run_native_restart_phase(
            &root,
            phase.to_str().unwrap(),
            &std::env::var(RESTART_TEST_ORIGIN).unwrap(),
        );
        return;
    }

    struct TestFiles(std::path::PathBuf);
    impl Drop for TestFiles {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    struct TestServer(Child);
    impl Drop for TestServer {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    let root = std::env::temp_dir().join(format!("fs-native-restart-{}", Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let files = TestFiles(root);
    std::fs::create_dir(files.0.join("synthetic-vault")).unwrap();
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../local-integration/native-sync-server.mjs");
    let mut server = TestServer(
        Command::new("node")
            .arg(script)
            .args(["--native-sync-test-only", "--native-sync-restart-only"])
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap(),
    );
    let mut output = std::io::BufReader::new(server.0.stdout.take().unwrap());
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    let ready: serde_json::Value = serde_json::from_str(&line).expect("isolated server must start");
    let origin = ready["origin"].as_str().unwrap();

    let (_, module) = module_path!().split_once("::").unwrap();
    let test_name =
        format!("{module}::native_process_restart_replays_one_operation_under_restored_authority");
    let executable = std::env::current_exe().unwrap();
    for phase in ["send", "replay"] {
        let result = Command::new(&executable)
            .args(["--exact", &test_name])
            .env(RESTART_TEST_PHASE, phase)
            .env(RESTART_TEST_ROOT, &files.0)
            .env(RESTART_TEST_ORIGIN, origin)
            .output()
            .unwrap();
        let expected_code = if phase == "send" {
            RESTART_TEST_ABRUPT_EXIT
        } else {
            0
        };
        assert_eq!(
            result.status.code(),
            Some(expected_code),
            "native {phase} process ended unexpectedly:\n{}\n{}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        if phase == "replay" {
            assert!(
                String::from_utf8_lossy(&result.stdout).contains("1 passed"),
                "native replay test was not selected"
            );
        }
    }

    line.clear();
    output.read_line(&mut line).unwrap();
    let report: serde_json::Value =
        serde_json::from_str(&line).expect("server must attest its independent state");
    assert_eq!(
        report,
        serde_json::json!({"requests": 2, "serverApplications": 1, "revision": 8})
    );
    assert!(server.0.wait().unwrap().success());
}
