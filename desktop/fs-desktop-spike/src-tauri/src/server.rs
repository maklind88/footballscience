use crate::bootstrap;
use crate::runtime::DesktopRuntime;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;

const BOOTSTRAP_INDEX: &[u8] = include_bytes!("../../candidates/bootstrap/index.html");
const BOOTSTRAP_APP: &[u8] = include_bytes!("../../candidates/bootstrap/app.js");
const BOOTSTRAP_STYLE: &[u8] = include_bytes!("../../candidates/bootstrap/styles.css");
const FALLBACK_INDEX: &[u8] = include_bytes!("../../candidates/fallback/index.html");
const FALLBACK_APP: &[u8] = include_bytes!("../../candidates/fallback/app.js");
const FALLBACK_STYLE: &[u8] = include_bytes!("../../candidates/fallback/styles.css");
const FALLBACK_BRIDGE: &[u8] =
    include_bytes!("../../candidates/shared/desktop-bridge-contract.mjs");

pub fn start(runtime: Arc<DesktopRuntime>) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:47844")
        .map_err(|error| format!("trusted desktop bootstrap port unavailable: {error}"))?;
    std::thread::Builder::new()
        .name("fs-desktop-bootstrap".into())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let _ = handle(stream, &runtime);
                    }
                    Err(_) => break,
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn handle(mut stream: TcpStream, runtime: &Arc<DesktopRuntime>) -> Result<(), String> {
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    let mut request = [0_u8; 8192];
    let size = stream
        .read(&mut request)
        .map_err(|error| error.to_string())?;
    let request =
        std::str::from_utf8(&request[..size]).map_err(|_| "invalid HTTP request".to_string())?;
    let line = request
        .lines()
        .next()
        .ok_or_else(|| "empty HTTP request".to_string())?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");
    if target.starts_with("/bootstrap/diagnostic?") {
        eprintln!(
            "FS desktop bootstrap diagnostic: {}",
            target.chars().take(600).collect::<String>()
        );
        return respond(
            &mut stream,
            204,
            "text/plain; charset=utf-8",
            b"",
            method == "HEAD",
        );
    }
    eprintln!(
        "FS desktop bootstrap request: {method} {}",
        target.split('?').next().unwrap_or("/")
    );
    if method != "GET" && method != "HEAD" {
        return respond(
            &mut stream,
            405,
            "text/plain; charset=utf-8",
            b"Method not allowed",
            method == "HEAD",
        );
    }
    let path = target.split('?').next().unwrap_or("/");
    let static_asset = match path {
        "/" | "/bootstrap" | "/bootstrap/" | "/bootstrap/index.html" => {
            Some((BOOTSTRAP_INDEX, "text/html; charset=utf-8"))
        }
        "/bootstrap/app.js" => Some((BOOTSTRAP_APP, "text/javascript; charset=utf-8")),
        "/bootstrap/styles.css" => Some((BOOTSTRAP_STYLE, "text/css; charset=utf-8")),
        "/fallback" | "/fallback/" | "/fallback/index.html" => {
            Some((FALLBACK_INDEX, "text/html; charset=utf-8"))
        }
        "/fallback/app.js" => Some((FALLBACK_APP, "text/javascript; charset=utf-8")),
        "/fallback/styles.css" => Some((FALLBACK_STYLE, "text/css; charset=utf-8")),
        "/fallback/bridge.mjs" => Some((FALLBACK_BRIDGE, "text/javascript; charset=utf-8")),
        _ => None,
    };
    if let Some((body, content_type)) = static_asset {
        return respond(&mut stream, 200, content_type, body, method == "HEAD");
    }
    let components: Vec<_> = path.trim_start_matches('/').split('/').collect();
    if components.len() != 2 || !matches!(components[0], "active" | "candidate" | "previous") {
        return respond(
            &mut stream,
            404,
            "text/plain; charset=utf-8",
            b"Not found",
            method == "HEAD",
        );
    }
    let shell = runtime
        .shell
        .read()
        .map_err(|_| "shell state lock poisoned".to_string())?;
    match bootstrap::asset(&runtime.root, &shell, components[0], components[1]) {
        Ok((body, content_type)) => {
            respond(&mut stream, 200, &content_type, &body, method == "HEAD")
        }
        Err(_) => respond(
            &mut stream,
            404,
            "text/plain; charset=utf-8",
            b"Not found",
            method == "HEAD",
        ),
    }
}

fn respond(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) -> Result<(), String> {
    let status_text = match status {
        200 => "OK",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let headers = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ipc: http://ipc.localhost; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\r\nConnection: close\r\n\r\n",
        body.len(),
    );
    stream
        .write_all(headers.as_bytes())
        .map_err(|error| error.to_string())?;
    if !head_only {
        stream.write_all(body).map_err(|error| error.to_string())?;
    }
    stream.flush().map_err(|error| error.to_string())
}
