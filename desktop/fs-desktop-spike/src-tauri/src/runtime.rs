use crate::authority::SyntheticSessionAuthority;
use crate::{bootstrap, local_data};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

pub struct DesktopRuntime {
    pub root: PathBuf,
    pub connection: Mutex<Connection>,
    pub shell: RwLock<bootstrap::ShellState>,
    pub authority: Mutex<SyntheticSessionAuthority>,
}

impl DesktopRuntime {
    pub fn initialize(root: &Path) -> Result<Arc<Self>, String> {
        let database_path = root.join("fs-desktop-local-v1.sqlite3");
        let connection = local_data::open(&database_path)?;
        bootstrap::migrate(&connection)?;
        let shell = bootstrap::load_state(&connection)?;
        Ok(Arc::new(Self {
            root: root.to_path_buf(),
            connection: Mutex::new(connection),
            shell: RwLock::new(shell),
            authority: Mutex::new(SyntheticSessionAuthority::new()?),
        }))
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
