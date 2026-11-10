use crate::bootstrap::{self, CANDIDATE_TIMEOUT_MS};
use crate::ci_trace;
use crate::runtime::{DeliveryMode, DesktopRuntime, delivery_mode};
use std::sync::Arc;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{App, AppHandle, Manager, Runtime, Url, WebviewUrl};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebviewRole {
    Active,
    Candidate,
    Recovery,
    Bundled,
    UnauthorizedProbe,
}

pub fn create_main<R: Runtime>(app: &mut App<R>) -> Result<(), String> {
    let (url, role, title) = match delivery_mode() {
        DeliveryMode::Hosted => (
            custom_url("fs-active://localhost/bootstrap/index.html")?,
            WebviewRole::Active,
            "FS Desktop Local Integration",
        ),
        DeliveryMode::Bundled => (
            WebviewUrl::App("bundled/index.html".into()),
            WebviewRole::Bundled,
            "FS Desktop Bundled Fallback Evidence",
        ),
        DeliveryMode::UnauthorizedOrigin => (
            WebviewUrl::External(
                "http://127.0.0.1:47843/"
                    .parse()
                    .map_err(|error| format!("invalid negative-probe URL: {error}"))?,
            ),
            WebviewRole::UnauthorizedProbe,
            "FS Desktop Unauthorized Origin Probe",
        ),
    };
    build_window(app.handle(), "main", url, role, title, true, false).map(|_| ())
}

pub fn start_candidate<R: Runtime>(
    app: &AppHandle<R>,
    runtime: Arc<DesktopRuntime>,
) -> Result<bootstrap::CandidateRuntimeStatus, String> {
    if let Some(existing) = app.get_webview_window("candidate") {
        existing.close().map_err(|error| error.to_string())?;
    }
    let status = {
        let mut shell = runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        bootstrap::begin_candidate_attempt(&connection, &mut shell, CANDIDATE_TIMEOUT_MS)?
    };
    let url = custom_url("fs-candidate://localhost/index.html")?;
    if let Err(error) = build_window(
        app,
        "candidate",
        url,
        WebviewRole::Candidate,
        "FS candidate verification",
        false,
        true,
    ) {
        let mut shell = runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        let _ = bootstrap::quarantine_candidate(
            &connection,
            &mut shell,
            &status.health_nonce,
            "initialization-failed",
        );
        return Err(error);
    }
    start_candidate_watchdog(
        app.clone(),
        runtime,
        status.health_nonce.clone(),
        status.deadline_unix_ms,
    );
    Ok(status)
}

pub fn open_recovery<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.get_webview_window("recovery").is_some() {
        return Ok(());
    }
    let recovery = build_window(
        app,
        "recovery",
        custom_url("fs-recovery://localhost/index.html")?,
        WebviewRole::Recovery,
        "FS Desktop Read-only Recovery",
        true,
        true,
    )?;
    recovery.show().map_err(|error| error.to_string())?;
    if let Some(main) = app.get_webview_window("main") {
        main.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn start_candidate_watchdog<R: Runtime>(
    app: AppHandle<R>,
    runtime: Arc<DesktopRuntime>,
    nonce: String,
    deadline: u64,
) {
    std::thread::Builder::new()
        .name("fs-candidate-watchdog".into())
        .spawn(move || {
            loop {
                let now = crate::authority::now_unix_ms().unwrap_or(u128::MAX);
                if now >= u128::from(deadline) {
                    let quarantined = (|| {
                        let mut shell = runtime.shell.write().ok()?;
                        let connection = runtime.connection.lock().ok()?;
                        bootstrap::quarantine_candidate(&connection, &mut shell, &nonce, "timeout")
                            .ok()
                    })()
                    .unwrap_or(false);
                    if quarantined && let Some(window) = app.get_webview_window("candidate") {
                        let _ = window.close();
                    }
                    break;
                }
                if runtime.shell.read().ok().is_none_or(|shell| {
                    shell
                        .candidate
                        .as_ref()
                        .and_then(|candidate| candidate.health_nonce.as_deref())
                        != Some(nonce.as_str())
                }) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        })
        .ok();
}

fn build_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    url: WebviewUrl,
    role: WebviewRole,
    title: &str,
    visible: bool,
    incognito: bool,
) -> Result<tauri::WebviewWindow<R>, String> {
    ci_trace::record(format!("window build started role={role:?} label={label}"));
    let window = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 540.0)
        .resizable(true)
        .visible(visible)
        .incognito(incognito)
        .use_https_scheme(false)
        .on_navigation(move |url| {
            let allowed = navigation_allowed(role, url);
            ci_trace::record(format!(
                "navigation role={role:?} allowed={allowed} url={url}"
            ));
            allowed
        })
        .on_page_load(move |_, payload| {
            ci_trace::record(format!(
                "page load role={role:?} event={:?} url={}",
                payload.event(),
                payload.url()
            ));
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .build()
        .map_err(|error| error.to_string())?;
    ci_trace::record(format!(
        "window build completed role={role:?} label={label}"
    ));
    Ok(window)
}

fn custom_url(value: &str) -> Result<WebviewUrl, String> {
    value
        .parse()
        .map(WebviewUrl::CustomProtocol)
        .map_err(|error| format!("invalid custom protocol URL: {error}"))
}

pub fn navigation_allowed(role: WebviewRole, url: &Url) -> bool {
    match role {
        WebviewRole::Active => {
            custom_origin(url, "fs-active")
                && (url.path().starts_with("/bootstrap/") || url.path().starts_with("/active/"))
        }
        WebviewRole::Candidate => custom_origin(url, "fs-candidate"),
        WebviewRole::Recovery => custom_origin(url, "fs-recovery"),
        WebviewRole::Bundled => {
            (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || ((url.scheme() == "http" || url.scheme() == "https")
                    && url.host_str() == Some("tauri.localhost"))
        }
        WebviewRole::UnauthorizedProbe => {
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port() == Some(47843)
        }
    }
}

fn custom_origin(url: &Url, scheme: &str) -> bool {
    custom_protocol_request_origin(url, scheme)
        || custom_origin_for_platform(
            url,
            scheme,
            cfg!(any(target_os = "windows", target_os = "android")),
        )
}

fn custom_protocol_request_origin(url: &Url, scheme: &str) -> bool {
    url.scheme() == scheme && url.host_str() == Some("localhost") && url.port().is_none()
}

fn custom_origin_for_platform(url: &Url, scheme: &str, http_virtual_origin: bool) -> bool {
    if http_virtual_origin {
        let windows_host = format!("{scheme}.localhost");
        url.scheme() == "http"
            && url.host_str() == Some(windows_host.as_str())
            && url.port().is_none()
    } else {
        url.scheme() == scheme && url.host_str() == Some("localhost") && url.port().is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_protocol_origin_differences_are_bounded() {
        let mac: Url = "fs-active://localhost/active/index.html".parse().unwrap();
        let windows: Url = "http://fs-active.localhost/active/index.html"
            .parse()
            .unwrap();
        let https_windows: Url = "https://fs-active.localhost/active/index.html"
            .parse()
            .unwrap();
        let lookalike: Url = "http://fs-active.evil.example/active/index.html"
            .parse()
            .unwrap();
        assert!(custom_protocol_request_origin(&mac, "fs-active"));
        assert!(custom_origin_for_platform(&mac, "fs-active", false));
        assert!(custom_origin_for_platform(&windows, "fs-active", true));
        assert!(!custom_origin_for_platform(
            &https_windows,
            "fs-active",
            true
        ));
        assert!(!custom_origin_for_platform(&lookalike, "fs-active", true));
    }

    #[test]
    fn privileged_windows_reject_external_navigation() {
        for role in [
            WebviewRole::Active,
            WebviewRole::Candidate,
            WebviewRole::Recovery,
        ] {
            assert!(!navigation_allowed(
                role,
                &"https://footballscience.xyz/".parse().unwrap()
            ));
            assert!(!navigation_allowed(
                role,
                &"https://accounts.google.com/".parse().unwrap()
            ));
        }
    }
}
