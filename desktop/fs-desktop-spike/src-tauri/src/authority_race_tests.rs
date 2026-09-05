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
        assert_eq!(vault.0.lock().unwrap().len(), 1);
    }
}
