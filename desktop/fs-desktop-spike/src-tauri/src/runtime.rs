use crate::authority::SessionAuthority;
use crate::release_trust::ReleaseTrustStore;
use crate::{bootstrap, local_data};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

pub struct DesktopRuntime {
    pub root: PathBuf,
    pub connection: Mutex<Connection>,
    pub shell: RwLock<bootstrap::ShellState>,
    pub authority: Mutex<SessionAuthority>,
    pub release_trust: Option<ReleaseTrustStore>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeliveryMode {
    Bundled,
    Hosted,
    UnauthorizedOrigin,
}

pub fn delivery_mode() -> DeliveryMode {
    match option_env!("FS_DESKTOP_DELIVERY_MODE").unwrap_or("bundled") {
        "hosted" => DeliveryMode::Hosted,
        "unauthorized-origin" => DeliveryMode::UnauthorizedOrigin,
        _ => DeliveryMode::Bundled,
    }
}

impl DesktopRuntime {
    pub fn initialize(root: &Path) -> Result<Arc<Self>, String> {
        let database_path = root.join("fs-desktop-local-v1.sqlite3");
        let connection = local_data::open(&database_path)?;
        bootstrap::migrate(&connection)?;
        let release_trust = if delivery_mode() == DeliveryMode::Hosted {
            let trust = ReleaseTrustStore::from_compile_time()?;
            bootstrap::verify_persisted_registry(root, &connection, &trust)?;
            Some(trust)
        } else {
            None
        };
        bootstrap::recover_interrupted_candidate(&connection)?;
        let shell = bootstrap::load_state(&connection)?;
        Ok(Arc::new(Self {
            root: root.to_path_buf(),
            connection: Mutex::new(connection),
            shell: RwLock::new(shell),
            authority: Mutex::new(SessionAuthority::new_os_synthetic()?),
            release_trust,
        }))
    }

    pub fn release_trust(&self) -> Result<&ReleaseTrustStore, String> {
        self.release_trust.as_ref().ok_or_else(|| {
            "signed frontend release trust is unavailable in this delivery mode".into()
        })
    }
}

#[derive(Default)]
pub struct DesktopState {
    inner: Mutex<Option<Arc<DesktopRuntime>>>,
}

impl DesktopState {
    pub fn install(&self, runtime: Arc<DesktopRuntime>) -> Result<(), String> {
        let mut slot = self
            .inner
            .lock()
            .map_err(|_| "desktop state lock poisoned".to_string())?;
        if slot.is_some() {
            return Err("desktop runtime already initialized".into());
        }
        *slot = Some(runtime);
        Ok(())
    }

    pub fn runtime(&self) -> Result<Arc<DesktopRuntime>, String> {
        self.inner
            .lock()
            .map_err(|_| "desktop state lock poisoned".to_string())?
            .clone()
            .ok_or_else(|| "desktop runtime is not initialized".to_string())
    }
}
