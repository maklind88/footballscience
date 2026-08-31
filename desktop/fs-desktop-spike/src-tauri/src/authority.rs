#![allow(
    dead_code,
    reason = "the secure refresh lifecycle is compiled now but only exercised by local contract tests until real authentication is authorized"
)]

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

pub const SYNTHETIC_ACTOR_ID: &str = "00000000-0000-4000-8000-000000000101";
pub const SYNTHETIC_ORGANIZATION_ID: &str = "00000000-0000-4000-8000-000000000201";
pub const SYNTHETIC_TENANT_ID: &str = "00000000-0000-4000-8000-000000000301";
pub const SYNTHETIC_TEAM_ID: &str = "00000000-0000-4000-8000-000000000401";
pub const SYNTHETIC_PARTITION_KEY: &str = "synthetic:tenant-301:actor-101";
pub const SYNTHETIC_AUTH_EPOCH: u64 = 1;

const CREDENTIAL_SERVICE: &str = "xyz.footballscience.desktop.session-authority.v1";
const MIN_OFFLINE_LEASE_SECONDS: u64 = 300;
const MAX_OFFLINE_LEASE_SECONDS: u64 = 604_800;
const DEFAULT_OFFLINE_LEASE_SECONDS: u64 = 86_400;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAuthoritySnapshot {
    pub state: &'static str,
    pub synthetic_identity: bool,
    pub actor_id: String,
    pub organization_id: String,
    pub tenant_id: String,
    pub team_id: String,
    pub partition_key: String,
    pub auth_epoch: u64,
    pub offline_lease_expires_at_unix_ms: u128,
    pub can_read_offline: bool,
    pub can_sync: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionContextProof {
    pub actor_id: String,
    pub organization_id: String,
    pub partition_key: String,
    pub auth_epoch: u64,
    pub frontend_build_id: String,
}

#[derive(Clone, Copy)]
pub struct OfflineLeasePolicy {
    duration_ms: u128,
}

impl OfflineLeasePolicy {
    pub fn from_compile_time() -> Self {
        let seconds = option_env!("FS_DESKTOP_OFFLINE_LEASE_SECONDS")
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(DEFAULT_OFFLINE_LEASE_SECONDS)
            .clamp(MIN_OFFLINE_LEASE_SECONDS, MAX_OFFLINE_LEASE_SECONDS);
        Self {
            duration_ms: u128::from(seconds) * 1_000,
        }
    }

    #[cfg(test)]
    fn seconds(seconds: u64) -> Self {
        Self {
            duration_ms: u128::from(
                seconds.clamp(MIN_OFFLINE_LEASE_SECONDS, MAX_OFFLINE_LEASE_SECONDS),
            ) * 1_000,
        }
    }
}

pub trait CredentialVault: Send + Sync {
    fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String>;
    fn write(&self, account: &str, secret: &[u8]) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

pub struct OsCredentialVault {
    service: String,
}

impl OsCredentialVault {
    pub fn production() -> Self {
        Self {
            service: CREDENTIAL_SERVICE.into(),
        }
    }

    #[cfg(test)]
    fn isolated(service: String) -> Self {
        Self { service }
    }

    fn entry(&self, account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, account)
            .map_err(|_| "operating-system credential entry is unavailable".to_string())
    }
}

impl CredentialVault for OsCredentialVault {
    fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String> {
        match self.entry(account)?.get_secret() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("operating-system credential read failed".into()),
        }
    }

    fn write(&self, account: &str, secret: &[u8]) -> Result<(), String> {
        self.entry(account)?
            .set_secret(secret)
            .map_err(|_| "operating-system credential write failed".to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("operating-system credential deletion failed".into()),
        }
    }
}

#[derive(Deserialize, Serialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredRefreshCredential {
    schema: String,
    actor_id: String,
    generation: u64,
    refresh_token: String,
}

struct AuthorityState {
    snapshot: SessionAuthoritySnapshot,
    access_token: Option<Zeroizing<String>>,
    access_expires_at_unix_ms: u128,
    revoked: bool,
}

pub struct RefreshedCredentials {
    pub access_token: Zeroizing<String>,
    pub refresh_token: Zeroizing<String>,
    pub access_expires_at_unix_ms: u128,
}

pub struct SessionAuthority {
    state: Mutex<AuthorityState>,
    refresh_owner: Mutex<()>,
    vault: Arc<dyn CredentialVault>,
    lease_policy: OfflineLeasePolicy,
}

impl SessionAuthority {
    pub fn new_os_synthetic() -> Result<Self, String> {
        Self::new_synthetic(
            Arc::new(OsCredentialVault::production()),
            OfflineLeasePolicy::from_compile_time(),
        )
    }

    fn new_synthetic(
        vault: Arc<dyn CredentialVault>,
        lease_policy: OfflineLeasePolicy,
    ) -> Result<Self, String> {
        let now = now_unix_ms()?;
        Ok(Self {
            state: Mutex::new(AuthorityState {
                snapshot: SessionAuthoritySnapshot {
                    state: "synthetic-offline-authorized",
                    synthetic_identity: true,
                    actor_id: SYNTHETIC_ACTOR_ID.into(),
                    organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
                    tenant_id: SYNTHETIC_TENANT_ID.into(),
                    team_id: SYNTHETIC_TEAM_ID.into(),
                    partition_key: SYNTHETIC_PARTITION_KEY.into(),
                    auth_epoch: SYNTHETIC_AUTH_EPOCH,
                    offline_lease_expires_at_unix_ms: now + lease_policy.duration_ms,
                    can_read_offline: true,
                    can_sync: false,
                },
                access_token: None,
                access_expires_at_unix_ms: 0,
                revoked: false,
            }),
            refresh_owner: Mutex::new(()),
            vault,
            lease_policy,
        })
    }

    pub fn snapshot(&self) -> SessionAuthoritySnapshot {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let now = now_unix_ms().ok();
        let mut snapshot = state.snapshot.clone();
        snapshot.can_read_offline = !state.revoked
            && now
                .map(|value| value < snapshot.offline_lease_expires_at_unix_ms)
                .unwrap_or(false);
        snapshot.can_sync = !state.revoked
            && state.access_token.is_some()
            && now
                .map(|value| value < state.access_expires_at_unix_ms)
                .unwrap_or(false);
        snapshot
    }

    pub fn validate(&self, proof: &SessionContextProof) -> Result<(), String> {
        let snapshot = self.snapshot();
        if !snapshot.can_read_offline {
            return Err("offline authorization lease is unavailable or expired".into());
        }
        if proof.actor_id != snapshot.actor_id
            || proof.organization_id != snapshot.organization_id
            || proof.partition_key != snapshot.partition_key
            || proof.auth_epoch != snapshot.auth_epoch
        {
            return Err("session context does not match the native authority".into());
        }
        if proof.frontend_build_id.trim().is_empty() || proof.frontend_build_id.len() > 80 {
            return Err("invalid frontend build ID".into());
        }
        Ok(())
    }

    pub fn activate_account(
        &self,
        snapshot: SessionAuthoritySnapshot,
        access_token: Zeroizing<String>,
        refresh_token: Zeroizing<String>,
        access_expires_at_unix_ms: u128,
    ) -> Result<(), String> {
        validate_identity_snapshot(&snapshot)?;
        validate_token(&access_token)?;
        validate_token(&refresh_token)?;
        let next_actor = snapshot.actor_id.clone();
        let previous_actor = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?
            .snapshot
            .actor_id
            .clone();
        self.persist_refresh(&next_actor, &refresh_token)?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "session authority lock poisoned".to_string())?;
            state.snapshot = SessionAuthoritySnapshot {
                state: "online-authorized",
                synthetic_identity: snapshot.synthetic_identity,
                offline_lease_expires_at_unix_ms: now_unix_ms()? + self.lease_policy.duration_ms,
                can_read_offline: true,
                can_sync: true,
                ..snapshot
            };
            state.access_token = Some(access_token);
            state.access_expires_at_unix_ms = access_expires_at_unix_ms;
            state.revoked = false;
        }
        if previous_actor != next_actor && Uuid::parse_str(&previous_actor).is_ok() {
            self.delete_refresh(&previous_actor)?;
        }
        Ok(())
    }

    pub fn refresh_if_needed<F>(
        &self,
        minimum_validity_ms: u128,
        refresh: F,
    ) -> Result<SessionAuthoritySnapshot, String>
    where
        F: FnOnce(&str) -> Result<RefreshedCredentials, String>,
    {
        let _owner = self
            .refresh_owner
            .lock()
            .map_err(|_| "session refresh lock poisoned".to_string())?;
        let now = now_unix_ms()?;
        {
            let state = self
                .state
                .lock()
                .map_err(|_| "session authority lock poisoned".to_string())?;
            if !state.revoked
                && state.access_token.is_some()
                && state.access_expires_at_unix_ms > now.saturating_add(minimum_validity_ms)
            {
                drop(state);
                return Ok(self.snapshot());
            }
        }
        let actor_id = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?
            .snapshot
            .actor_id
            .clone();
        let stored = self
            .load_refresh(&actor_id)?
            .ok_or_else(|| "secure refresh credential is unavailable".to_string())?;
        let refresh_token = Zeroizing::new(stored.refresh_token.clone());
        let refreshed = refresh(refresh_token.as_str())?;
        validate_token(&refreshed.access_token)?;
        validate_token(&refreshed.refresh_token)?;
        self.persist_refresh(&actor_id, &refreshed.refresh_token)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        if state.revoked || state.snapshot.actor_id != actor_id {
            return Err("session changed while refresh was in flight".into());
        }
        state.access_token = Some(refreshed.access_token);
        state.access_expires_at_unix_ms = refreshed.access_expires_at_unix_ms;
        state.snapshot.offline_lease_expires_at_unix_ms = now + self.lease_policy.duration_ms;
        state.snapshot.can_sync = true;
        drop(state);
        Ok(self.snapshot())
    }

    pub fn logout(&self) -> Result<(), String> {
        let actor_id = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?
            .snapshot
            .actor_id
            .clone();
        let deletion = if Uuid::parse_str(&actor_id).is_ok() {
            self.delete_refresh(&actor_id)
        } else {
            Ok(())
        };
        let mut state = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        state.access_token.take();
        state.access_expires_at_unix_ms = 0;
        state.snapshot.state = "signed-out";
        state.snapshot.offline_lease_expires_at_unix_ms = 0;
        state.snapshot.can_read_offline = false;
        state.snapshot.can_sync = false;
        state.snapshot.actor_id.clear();
        state.snapshot.organization_id.clear();
        state.snapshot.tenant_id.clear();
        state.snapshot.team_id.clear();
        state.snapshot.partition_key.clear();
        deletion
    }

    pub fn revoke(&self) -> Result<(), String> {
        let result = self.logout();
        let mut state = self
            .state
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        state.revoked = true;
        state.snapshot.state = "revoked";
        result
    }

    fn load_refresh(&self, actor_id: &str) -> Result<Option<StoredRefreshCredential>, String> {
        validate_actor_id(actor_id)?;
        let mut credentials = Vec::new();
        for slot in [refresh_slot(actor_id, 'a'), refresh_slot(actor_id, 'b')] {
            let Some(mut encoded) = self.vault.read(&slot)? else {
                continue;
            };
            let credential = serde_json::from_slice::<StoredRefreshCredential>(&encoded)
                .map_err(|_| "secure refresh credential is malformed".to_string());
            encoded.zeroize();
            let credential = credential?;
            if credential.schema != "fs-desktop-refresh-credential-v1"
                || credential.actor_id != actor_id
                || credential.generation == 0
            {
                return Err("secure refresh credential identity is invalid".into());
            }
            validate_token(&credential.refresh_token)?;
            credentials.push(credential);
        }
        credentials.sort_by_key(|credential| credential.generation);
        Ok(credentials.pop())
    }

    fn persist_refresh(&self, actor_id: &str, refresh_token: &str) -> Result<(), String> {
        validate_actor_id(actor_id)?;
        validate_token(refresh_token)?;
        let next_generation = self
            .load_refresh(actor_id)?
            .map(|credential| credential.generation.saturating_add(1))
            .unwrap_or(1);
        let target = if next_generation % 2 == 0 { 'b' } else { 'a' };
        let previous = if target == 'a' { 'b' } else { 'a' };
        let credential = StoredRefreshCredential {
            schema: "fs-desktop-refresh-credential-v1".into(),
            actor_id: actor_id.into(),
            generation: next_generation,
            refresh_token: refresh_token.into(),
        };
        let mut encoded = serde_json::to_vec(&credential)
            .map_err(|_| "secure refresh credential serialization failed".to_string())?;
        self.vault
            .write(&refresh_slot(actor_id, target), &encoded)?;
        encoded.zeroize();
        let verified = self
            .load_refresh(actor_id)?
            .ok_or_else(|| "secure refresh credential verification failed".to_string())?;
        if verified.generation != next_generation || verified.refresh_token != refresh_token {
            return Err("secure refresh credential verification failed".into());
        }
        self.vault.delete(&refresh_slot(actor_id, previous))?;
        Ok(())
    }

    fn delete_refresh(&self, actor_id: &str) -> Result<(), String> {
        validate_actor_id(actor_id)?;
        let first = self.vault.delete(&refresh_slot(actor_id, 'a'));
        let second = self.vault.delete(&refresh_slot(actor_id, 'b'));
        first.and(second)
    }

    #[cfg(test)]
    pub(crate) fn expire_offline_lease_for_test(&self) {
        let mut state = self.state.lock().unwrap();
        state.snapshot.offline_lease_expires_at_unix_ms = 0;
    }
}

fn validate_identity_snapshot(snapshot: &SessionAuthoritySnapshot) -> Result<(), String> {
    validate_actor_id(&snapshot.actor_id)?;
    for value in [
        &snapshot.organization_id,
        &snapshot.tenant_id,
        &snapshot.team_id,
    ] {
        Uuid::parse_str(value)
            .map_err(|_| "session authority contains an invalid identity".to_string())?;
    }
    if snapshot.partition_key.is_empty() || snapshot.partition_key.len() > 160 {
        return Err("session authority contains an invalid partition".into());
    }
    Ok(())
}

fn validate_actor_id(actor_id: &str) -> Result<(), String> {
    Uuid::parse_str(actor_id)
        .map(|_| ())
        .map_err(|_| "session authority contains an invalid actor".to_string())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.len() < 16 || token.len() > 16_384 || token.chars().any(char::is_control) {
        return Err("credential material is structurally invalid".into());
    }
    Ok(())
}

fn refresh_slot(actor_id: &str, slot: char) -> String {
    format!("{actor_id}:refresh:{slot}")
}

pub fn now_unix_ms() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|_| "system clock is before UNIX epoch".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;

    #[derive(Default)]
    struct MemoryVault {
        values: Mutex<HashMap<String, Vec<u8>>>,
    }

    impl CredentialVault for MemoryVault {
        fn read(&self, account: &str) -> Result<Option<Vec<u8>>, String> {
            Ok(self.values.lock().unwrap().get(account).cloned())
        }

        fn write(&self, account: &str, secret: &[u8]) -> Result<(), String> {
            self.values
                .lock()
                .unwrap()
                .insert(account.into(), secret.to_vec());
            Ok(())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.values.lock().unwrap().remove(account);
            Ok(())
        }
    }

    fn authority(vault: Arc<dyn CredentialVault>) -> SessionAuthority {
        SessionAuthority::new_synthetic(vault, OfflineLeasePolicy::seconds(300)).unwrap()
    }

    fn active_snapshot(actor_id: &str) -> SessionAuthoritySnapshot {
        SessionAuthoritySnapshot {
            state: "online-authorized",
            synthetic_identity: true,
            actor_id: actor_id.into(),
            organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
            tenant_id: SYNTHETIC_TENANT_ID.into(),
            team_id: SYNTHETIC_TEAM_ID.into(),
            partition_key: format!("synthetic:account:{actor_id}"),
            auth_epoch: 2,
            offline_lease_expires_at_unix_ms: 0,
            can_read_offline: true,
            can_sync: true,
        }
    }

    #[test]
    fn snapshot_and_bridge_proof_contain_no_credentials() {
        let authority = authority(Arc::new(MemoryVault::default()));
        let json = serde_json::to_string(&authority.snapshot()).unwrap();
        assert!(!json.to_ascii_lowercase().contains("token"));
        assert!(!json.to_ascii_lowercase().contains("secret"));
        assert!(json.contains(SYNTHETIC_PARTITION_KEY));
    }

    #[test]
    fn refresh_rotation_is_verified_before_previous_slot_is_removed() {
        let vault = Arc::new(MemoryVault::default());
        let authority = authority(vault.clone());
        authority
            .activate_account(
                active_snapshot(SYNTHETIC_ACTOR_ID),
                Zeroizing::new("access-token-generation-01".into()),
                Zeroizing::new("refresh-token-generation-01".into()),
                1,
            )
            .unwrap();
        authority
            .refresh_if_needed(10_000, |_| {
                Ok(RefreshedCredentials {
                    access_token: Zeroizing::new("access-token-generation-02".into()),
                    refresh_token: Zeroizing::new("refresh-token-generation-02".into()),
                    access_expires_at_unix_ms: now_unix_ms().unwrap() + 60_000,
                })
            })
            .unwrap();
        let stored = authority.load_refresh(SYNTHETIC_ACTOR_ID).unwrap().unwrap();
        assert_eq!(stored.generation, 2);
        assert_eq!(stored.refresh_token, "refresh-token-generation-02");
        assert_eq!(vault.values.lock().unwrap().len(), 1);
    }

    #[test]
    fn concurrent_refresh_callers_share_one_rotation_owner() {
        let authority = Arc::new(authority(Arc::new(MemoryVault::default())));
        authority
            .activate_account(
                active_snapshot(SYNTHETIC_ACTOR_ID),
                Zeroizing::new("expired-access-token-01".into()),
                Zeroizing::new("refresh-token-generation-01".into()),
                1,
            )
            .unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let workers = (0..12)
            .map(|_| {
                let authority = authority.clone();
                let calls = calls.clone();
                thread::spawn(move || {
                    authority
                        .refresh_if_needed(30_000, |_| {
                            calls.fetch_add(1, Ordering::SeqCst);
                            Ok(RefreshedCredentials {
                                access_token: Zeroizing::new("shared-access-token-02".into()),
                                refresh_token: Zeroizing::new("shared-refresh-token-02".into()),
                                access_expires_at_unix_ms: now_unix_ms().unwrap() + 120_000,
                            })
                        })
                        .unwrap()
                })
            })
            .collect::<Vec<_>>();
        for worker in workers {
            assert!(worker.join().unwrap().can_sync);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn logout_account_switch_and_revocation_remove_secure_credentials() {
        let vault = Arc::new(MemoryVault::default());
        let authority = authority(vault.clone());
        authority
            .activate_account(
                active_snapshot(SYNTHETIC_ACTOR_ID),
                Zeroizing::new("access-token-generation-01".into()),
                Zeroizing::new("refresh-token-generation-01".into()),
                now_unix_ms().unwrap() + 60_000,
            )
            .unwrap();
        let second_actor = "00000000-0000-4000-8000-000000000102";
        authority
            .activate_account(
                active_snapshot(second_actor),
                Zeroizing::new("access-token-generation-02".into()),
                Zeroizing::new("refresh-token-generation-02".into()),
                now_unix_ms().unwrap() + 60_000,
            )
            .unwrap();
        assert!(
            authority
                .load_refresh(SYNTHETIC_ACTOR_ID)
                .unwrap()
                .is_none()
        );
        assert!(authority.load_refresh(second_actor).unwrap().is_some());
        let switched = authority.snapshot();
        assert_eq!(switched.actor_id, second_actor);
        assert_eq!(
            switched.partition_key,
            format!("synthetic:account:{second_actor}")
        );
        assert!(
            !serde_json::to_string(&switched)
                .unwrap()
                .contains(SYNTHETIC_ACTOR_ID)
        );
        authority.revoke().unwrap();
        let snapshot = authority.snapshot();
        assert_eq!(snapshot.state, "revoked");
        assert!(!snapshot.can_read_offline);
        assert!(!snapshot.can_sync);
        assert!(snapshot.actor_id.is_empty());
        assert!(snapshot.partition_key.is_empty());
        assert!(vault.values.lock().unwrap().is_empty());
    }

    #[test]
    fn mismatched_partition_is_rejected() {
        let authority = authority(Arc::new(MemoryVault::default()));
        let proof = SessionContextProof {
            actor_id: SYNTHETIC_ACTOR_ID.into(),
            organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
            partition_key: "another-partition".into(),
            auth_epoch: SYNTHETIC_AUTH_EPOCH,
            frontend_build_id: "test-build".into(),
        };
        assert!(authority.validate(&proof).is_err());
    }

    #[test]
    #[ignore = "writes and deletes one synthetic credential in the real OS credential store"]
    fn os_credential_store_round_trip() {
        let service = format!("{CREDENTIAL_SERVICE}.test.{}", Uuid::new_v4());
        let vault = OsCredentialVault::isolated(service);
        let account = format!("{}:refresh:a", Uuid::new_v4());
        let secret = b"synthetic-keychain-round-trip-secret";
        vault.write(&account, secret).unwrap();
        assert_eq!(
            vault.read(&account).unwrap().as_deref(),
            Some(secret.as_slice())
        );
        vault.delete(&account).unwrap();
        assert!(vault.read(&account).unwrap().is_none());
    }
}
