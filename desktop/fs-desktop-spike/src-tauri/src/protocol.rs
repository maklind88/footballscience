use crate::bootstrap;
use crate::runtime::DesktopState;
use std::borrow::Cow;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{Manager, Runtime, UriSchemeContext};

const BOOTSTRAP_INDEX: &[u8] = include_bytes!("../../candidates/bootstrap/index.html");
const BOOTSTRAP_APP: &[u8] = include_bytes!("../../candidates/bootstrap/app.js");
const BOOTSTRAP_STYLE: &[u8] = include_bytes!("../../candidates/bootstrap/styles.css");
const TAURI_INVOKE: &[u8] = include_bytes!("../../candidates/shared/tauri-invoke.mjs");
const FALLBACK_INDEX: &[u8] = include_bytes!("../../candidates/fallback/index.html");
const FALLBACK_APP: &[u8] = include_bytes!("../../candidates/fallback/app.js");
const FALLBACK_STYLE: &[u8] = include_bytes!("../../candidates/fallback/styles.css");

const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'";

pub fn active<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    if context.webview_label() != "main" {
        return response(
            StatusCode::FORBIDDEN,
            "text/plain; charset=utf-8",
            b"Forbidden".to_vec(),
            false,
        );
    }
    let head = request.method() == tauri::http::Method::HEAD;
    if request.method() != tauri::http::Method::GET && !head {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain; charset=utf-8",
            b"Method not allowed".to_vec(),
            false,
        );
    }
    let path = request.uri().path();
    if let Some((body, content_type)) = bootstrap_asset(path) {
        return response(StatusCode::OK, content_type, body.to_vec(), head);
    }
    let Some(asset_path) = path.strip_prefix("/active/") else {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"Not found".to_vec(),
            head,
        );
    };
    generation_asset(context.app_handle(), "active", asset_path, head)
}

pub fn candidate<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    if context.webview_label() != "candidate" {
        return response(
            StatusCode::FORBIDDEN,
            "text/plain; charset=utf-8",
            b"Forbidden".to_vec(),
            false,
        );
    }
    let head = request.method() == tauri::http::Method::HEAD;
    if request.method() != tauri::http::Method::GET && !head {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain; charset=utf-8",
            b"Method not allowed".to_vec(),
            false,
        );
    }
    let path = request.uri().path().trim_start_matches('/');
    let asset_path = if path.is_empty() { "index.html" } else { path };
    generation_asset(context.app_handle(), "candidate", asset_path, head)
}

pub fn recovery<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    if context.webview_label() != "recovery" {
        return response(
            StatusCode::FORBIDDEN,
            "text/plain; charset=utf-8",
            b"Forbidden".to_vec(),
            false,
        );
    }
    let head = request.method() == tauri::http::Method::HEAD;
    if request.method() != tauri::http::Method::GET && !head {
        return response(
            StatusCode::METHOD_NOT_ALLOWED,
            "text/plain; charset=utf-8",
            b"Method not allowed".to_vec(),
            false,
        );
    }
    let asset = match request.uri().path() {
        "/" | "/index.html" => Some((FALLBACK_INDEX, "text/html; charset=utf-8")),
        "/app.js" => Some((FALLBACK_APP, "text/javascript; charset=utf-8")),
        "/styles.css" => Some((FALLBACK_STYLE, "text/css; charset=utf-8")),
        "/tauri-invoke.mjs" => Some((TAURI_INVOKE, "text/javascript; charset=utf-8")),
        _ => None,
    };
    match asset {
        Some((body, content_type)) => response(StatusCode::OK, content_type, body.to_vec(), head),
        None => response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"Not found".to_vec(),
            head,
        ),
    }
}

fn bootstrap_asset(path: &str) -> Option<(&'static [u8], &'static str)> {
    match path {
        "/" | "/bootstrap" | "/bootstrap/" | "/bootstrap/index.html" => {
            Some((BOOTSTRAP_INDEX, "text/html; charset=utf-8"))
        }
        "/bootstrap/app.js" => Some((BOOTSTRAP_APP, "text/javascript; charset=utf-8")),
        "/bootstrap/styles.css" => Some((BOOTSTRAP_STYLE, "text/css; charset=utf-8")),
        "/bootstrap/tauri-invoke.mjs" => Some((TAURI_INVOKE, "text/javascript; charset=utf-8")),
        _ => None,
    }
}

fn generation_asset<R: Runtime>(
    app: &tauri::AppHandle<R>,
    channel: &str,
    asset_path: &str,
    head: bool,
) -> Response<Cow<'static, [u8]>> {
    let runtime = match app.state::<DesktopState>().runtime() {
        Ok(runtime) => runtime,
        Err(_) => {
            return response(
                StatusCode::SERVICE_UNAVAILABLE,
                "text/plain; charset=utf-8",
                b"Unavailable".to_vec(),
                head,
            );
        }
    };
    let shell = match runtime.shell.read() {
        Ok(shell) => shell,
        Err(_) => {
            return response(
                StatusCode::SERVICE_UNAVAILABLE,
                "text/plain; charset=utf-8",
                b"Unavailable".to_vec(),
                head,
            );
        }
    };
    match bootstrap::asset(&runtime.root, &shell, channel, asset_path) {
        Ok((body, content_type)) => response(StatusCode::OK, &content_type, body, head),
        Err(_) => response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"Not found".to_vec(),
            head,
        ),
    }
}

fn response(
    status: StatusCode,
    content_type: &str,
    body: Vec<u8>,
    head: bool,
) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Cross-Origin-Resource-Policy", "same-origin")
        .header("X-Frame-Options", "DENY")
        .header("Content-Security-Policy", CSP)
        .body(Cow::Owned(if head { Vec::new() } else { body }))
        .unwrap_or_else(|_| Response::new(Cow::Borrowed(&b"Response error"[..])))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_allowlist_has_no_private_or_domain_payload() {
        assert!(bootstrap_asset("/bootstrap/index.html").is_some());
        assert!(bootstrap_asset("/bootstrap/session.json").is_none());
        assert!(bootstrap_asset("/../fs-desktop-local-v1.sqlite3").is_none());
    }

    #[test]
    fn csp_forbids_external_navigation_dependencies() {
        assert!(CSP.contains("default-src 'self'"));
        assert!(CSP.contains("object-src 'none'"));
        assert!(!CSP.contains("https:"));
        assert!(!CSP.contains("*"));
    }
}
