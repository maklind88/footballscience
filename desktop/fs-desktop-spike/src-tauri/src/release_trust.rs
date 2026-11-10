use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SIGNATURE_SCHEMA: &str = "fs-desktop-manifest-signature-v1";
pub const SIGNATURE_ALGORITHM: &str = "Ed25519";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyRole {
    Release,
    Recovery,
}

#[derive(Clone)]
pub struct TrustedKey {
    pub id: String,
    pub role: KeyRole,
    key: VerifyingKey,
}

impl TrustedKey {
    pub fn from_base64(id: &str, role: KeyRole, encoded: &str) -> Result<Self, String> {
        validate_key_id(id)?;
        let decoded = STANDARD
            .decode(encoded)
            .map_err(|_| "invalid pinned release public key encoding".to_string())?;
        let bytes: [u8; 32] = decoded
            .try_into()
            .map_err(|_| "invalid pinned release public key length".to_string())?;
        let key = VerifyingKey::from_bytes(&bytes)
            .map_err(|_| "invalid pinned Ed25519 public key".to_string())?;
        Ok(Self {
            id: id.to_string(),
            role,
            key,
        })
    }

    #[cfg(test)]
    pub fn from_verifying_key(id: &str, role: KeyRole, key: VerifyingKey) -> Self {
        Self {
            id: id.to_string(),
            role,
            key,
        }
    }
}

#[derive(Clone, Default)]
pub struct ReleaseTrustStore {
    keys: BTreeMap<String, TrustedKey>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedManifestSignature {
    pub signing_key_id: String,
    pub key_role: KeyRole,
    pub signature_base64: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetachedManifestSignature {
    pub schema: String,
    pub algorithm: String,
    pub signing_key_id: String,
    pub signature_base64: String,
}

impl ReleaseTrustStore {
    pub fn from_keys(keys: impl IntoIterator<Item = TrustedKey>) -> Result<Self, String> {
        let mut store = Self::default();
        for key in keys {
            if store.keys.insert(key.id.clone(), key).is_some() {
                return Err("duplicate pinned release signing key ID".into());
            }
        }
        if store.keys.is_empty() {
            return Err("no frontend release verification key is pinned".into());
        }
        Ok(store)
    }

    pub fn from_compile_time() -> Result<Self, String> {
        let release_id = option_env!("FS_DESKTOP_RELEASE_KEY_ID").unwrap_or("");
        let release_key = option_env!("FS_DESKTOP_RELEASE_PUBLIC_KEY_B64").unwrap_or("");
        if release_id.is_empty() || release_key.is_empty() {
            return Err("frontend release verification key was not pinned at build time".into());
        }
        let mut keys = vec![TrustedKey::from_base64(
            release_id,
            KeyRole::Release,
            release_key,
        )?];
        let recovery_id = option_env!("FS_DESKTOP_RECOVERY_KEY_ID").unwrap_or("");
        let recovery_key = option_env!("FS_DESKTOP_RECOVERY_PUBLIC_KEY_B64").unwrap_or("");
        if !recovery_id.is_empty() || !recovery_key.is_empty() {
            if recovery_id.is_empty() || recovery_key.is_empty() {
                return Err("incomplete pinned recovery verification key".into());
            }
            keys.push(TrustedKey::from_base64(
                recovery_id,
                KeyRole::Recovery,
                recovery_key,
            )?);
        }
        Self::from_keys(keys)
    }

    pub fn verify_exact_manifest_bytes(
        &self,
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
    ) -> Result<VerifiedManifestSignature, String> {
        if manifest_bytes.is_empty() || manifest_bytes.len() > 65_536 {
            return Err("signed frontend manifest is outside its byte boundary".into());
        }
        if signature_bytes.is_empty() || signature_bytes.len() > 2_048 {
            return Err("detached frontend signature is missing or oversized".into());
        }
        let envelope: DetachedManifestSignature = serde_json::from_slice(signature_bytes)
            .map_err(|_| "malformed detached frontend signature".to_string())?;
        if envelope.schema != SIGNATURE_SCHEMA || envelope.algorithm != SIGNATURE_ALGORITHM {
            return Err("unsupported detached frontend signature contract".into());
        }
        validate_key_id(&envelope.signing_key_id)?;
        let trusted = self
            .keys
            .get(&envelope.signing_key_id)
            .ok_or_else(|| "unknown frontend signing key".to_string())?;
        let raw_signature = STANDARD
            .decode(&envelope.signature_base64)
            .map_err(|_| "invalid frontend signature encoding".to_string())?;
        let signature = Signature::try_from(raw_signature.as_slice())
            .map_err(|_| "invalid frontend signature length".to_string())?;
        trusted
            .key
            .verify_strict(manifest_bytes, &signature)
            .map_err(|_| "frontend manifest signature verification failed".to_string())?;
        Ok(VerifiedManifestSignature {
            signing_key_id: trusted.id.clone(),
            key_role: trusted.role,
            signature_base64: envelope.signature_base64,
        })
    }
}

fn validate_key_id(value: &str) -> Result<(), String> {
    if value.len() < 8
        || value.len() > 80
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("invalid frontend signing key ID".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};
    use uuid::Uuid;

    fn ephemeral() -> (ReleaseTrustStore, SigningKey) {
        let seed: [u8; 32] = Sha256::digest(Uuid::new_v4().as_bytes()).into();
        let signing = SigningKey::from_bytes(&seed);
        let trusted = TrustedKey::from_verifying_key(
            "ephemeral-test-release-key",
            KeyRole::Release,
            signing.verifying_key(),
        );
        (ReleaseTrustStore::from_keys([trusted]).unwrap(), signing)
    }

    fn envelope(signing: &SigningKey, manifest: &[u8], key_id: &str) -> Vec<u8> {
        serde_json::to_vec(&DetachedManifestSignature {
            schema: SIGNATURE_SCHEMA.into(),
            algorithm: SIGNATURE_ALGORITHM.into(),
            signing_key_id: key_id.into(),
            signature_base64: STANDARD.encode(signing.sign(manifest).to_bytes()),
        })
        .unwrap()
    }

    #[test]
    fn exact_manifest_bytes_verify() {
        let (store, signing) = ephemeral();
        let manifest = br#"{"schema":"example"}"#;
        let verified = store
            .verify_exact_manifest_bytes(
                manifest,
                &envelope(&signing, manifest, "ephemeral-test-release-key"),
            )
            .unwrap();
        assert_eq!(verified.key_role, KeyRole::Release);
    }

    #[test]
    fn modified_manifest_fails_closed() {
        let (store, signing) = ephemeral();
        let signature = envelope(&signing, b"original", "ephemeral-test-release-key");
        assert!(
            store
                .verify_exact_manifest_bytes(b"modified", &signature)
                .is_err()
        );
    }

    #[test]
    fn malformed_missing_and_unknown_signatures_fail_closed() {
        let (store, signing) = ephemeral();
        assert!(store.verify_exact_manifest_bytes(b"manifest", b"").is_err());
        assert!(
            store
                .verify_exact_manifest_bytes(b"manifest", b"not-json")
                .is_err()
        );
        let unknown = envelope(&signing, b"manifest", "unknown-test-release-key");
        assert!(
            store
                .verify_exact_manifest_bytes(b"manifest", &unknown)
                .is_err()
        );
    }
}
