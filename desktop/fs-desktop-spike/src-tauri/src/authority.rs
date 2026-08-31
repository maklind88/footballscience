use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SYNTHETIC_ACTOR_ID: &str = "00000000-0000-4000-8000-000000000101";
pub const SYNTHETIC_ORGANIZATION_ID: &str = "00000000-0000-4000-8000-000000000201";
pub const SYNTHETIC_TENANT_ID: &str = "00000000-0000-4000-8000-000000000301";
pub const SYNTHETIC_TEAM_ID: &str = "00000000-0000-4000-8000-000000000401";
pub const SYNTHETIC_PARTITION_KEY: &str = "synthetic:tenant-301:actor-101";
pub const SYNTHETIC_AUTH_EPOCH: u64 = 1;

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

#[derive(Clone)]
pub struct SyntheticSessionAuthority {
    snapshot: SessionAuthoritySnapshot,
}

impl SyntheticSessionAuthority {
    pub fn new() -> Result<Self, String> {
        let now = now_unix_ms()?;
        Ok(Self {
            snapshot: SessionAuthoritySnapshot {
                state: "synthetic-offline-authorized",
                synthetic_identity: true,
                actor_id: SYNTHETIC_ACTOR_ID.into(),
                organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
                tenant_id: SYNTHETIC_TENANT_ID.into(),
                team_id: SYNTHETIC_TEAM_ID.into(),
                partition_key: SYNTHETIC_PARTITION_KEY.into(),
                auth_epoch: SYNTHETIC_AUTH_EPOCH,
                offline_lease_expires_at_unix_ms: now + 86_400_000,
                can_read_offline: true,
                can_sync: false,
            },
        })
    }

    pub fn snapshot(&self) -> SessionAuthoritySnapshot {
        let mut snapshot = self.snapshot.clone();
        snapshot.can_read_offline = self.lease_is_valid();
        snapshot
    }

    pub fn validate(&self, proof: &SessionContextProof) -> Result<(), String> {
        if !self.lease_is_valid() {
            return Err("offline authorization lease expired".into());
        }
        if proof.actor_id != self.snapshot.actor_id
            || proof.organization_id != self.snapshot.organization_id
            || proof.partition_key != self.snapshot.partition_key
            || proof.auth_epoch != self.snapshot.auth_epoch
        {
            return Err("session context does not match the native authority".into());
        }
        if proof.frontend_build_id.trim().is_empty() || proof.frontend_build_id.len() > 80 {
            return Err("invalid frontend build ID".into());
        }
        Ok(())
    }

    fn lease_is_valid(&self) -> bool {
        now_unix_ms()
            .map(|now| now < self.snapshot.offline_lease_expires_at_unix_ms)
            .unwrap_or(false)
    }
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

    #[test]
    fn synthetic_snapshot_contains_no_credentials() {
        let authority = SyntheticSessionAuthority::new().unwrap();
        let json = serde_json::to_string(&authority.snapshot()).unwrap();
        assert!(!json.contains("accessToken"));
        assert!(!json.contains("refreshToken"));
        assert!(!json.contains("secret"));
        assert!(json.contains(SYNTHETIC_PARTITION_KEY));
    }

    #[test]
    fn mismatched_partition_is_rejected() {
        let authority = SyntheticSessionAuthority::new().unwrap();
        let proof = SessionContextProof {
            actor_id: SYNTHETIC_ACTOR_ID.into(),
            organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
            partition_key: "another-partition".into(),
            auth_epoch: SYNTHETIC_AUTH_EPOCH,
            frontend_build_id: "test-build".into(),
        };
        assert!(authority.validate(&proof).is_err());
    }
}
