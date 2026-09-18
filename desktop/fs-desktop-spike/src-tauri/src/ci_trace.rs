use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

const TRACE_FILE: &str = "fs-desktop-runtime-trace.log";

pub fn record(event: impl AsRef<str>) {
    if std::env::var("FS_DESKTOP_CI").as_deref() != Ok("1") {
        return;
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let path = std::env::temp_dir().join(TRACE_FILE);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{timestamp} {}", event.as_ref());
    }
}
