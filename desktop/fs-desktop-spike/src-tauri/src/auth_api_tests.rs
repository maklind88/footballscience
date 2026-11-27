use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

fn auth_session_payload(access: &str, refresh: &str) -> String {
    serde_json::json!({
        "ok": true,
        "schema": "fs-desktop-auth-response-v1",
        "session": {
            "accessToken": access,
            "refreshToken": refresh,
            "expiresAtUnixMs": 4_000_000_000_000_u64,
            "identity": {
                "schema": "fs-desktop-verified-identity-v1",
                "actorId": "11111111-1111-4111-8111-111111111111",
                "email": "coach@example.com",
                "role": "coach",
                "status": "active",
                "organizationId": "22222222-2222-4222-8222-222222222222",
                "clubId": "33333333-3333-4333-8333-333333333333",
                "teamId": "44444444-4444-4444-8444-444444444444",
                "displayName": "Coach Example",
                "firstName": "Coach",
                "lastName": "Example",
                "clubName": "Test Club",
                "teamName": "First Team",
                "verifiedAtUnixMs": 2_000_000_000_000_u64
            }
        },
        "reason": null
    })
    .to_string()
}

fn read_request(stream: &mut std::net::TcpStream) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4_096];
    loop {
        let read = stream.read(&mut chunk).unwrap();
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..read]);
        let Some(header_end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") else {
            continue;
        };
        let headers = String::from_utf8_lossy(&bytes[..header_end]);
        let content_length = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .unwrap_or(0);
        if bytes.len() >= header_end + 4 + content_length {
            break;
        }
    }
    String::from_utf8(bytes).unwrap()
}

fn write_json(stream: &mut std::net::TcpStream, status: &str, body: &str) {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    stream.flush().unwrap();
}

#[test]
fn api_allowlist_rejects_origins_traversal_unknown_routes_and_methods() {
    let valid = DesktopApiRequest {
        path: "/api/app-state?fresh=1".into(),
        method: "GET".into(),
        body: String::new(),
        content_type: String::new(),
    };
    assert!(validate_api_request(&valid).is_ok());
    for path in [
        "https://evil.example/api/app-state",
        "/api/../admin",
        "/api/not-real",
    ] {
        assert!(
            validate_api_request(&DesktopApiRequest {
                path: path.into(),
                method: "GET".into(),
                body: String::new(),
                content_type: String::new()
            })
            .is_err()
        );
    }
    assert!(
        validate_api_request(&DesktopApiRequest {
            method: "TRACE".into(),
            ..valid
        })
        .is_err()
    );
}

#[test]
fn public_routes_are_narrow_and_authenticated_routes_stay_private() {
    let public = validate_api_request(&DesktopApiRequest {
        path: "/api/auth-health".into(),
        method: "GET".into(),
        body: String::new(),
        content_type: String::new(),
    })
    .unwrap();
    assert!(public.2);
    assert!(
        validate_api_request(&DesktopApiRequest {
            path: "/api/send-reset".into(),
            method: "POST".into(),
            body: "{}".into(),
            content_type: "application/json".into(),
        })
        .is_err()
    );
    let private = validate_api_request(&DesktopApiRequest {
        path: "/api/platform-identity".into(),
        method: "GET".into(),
        body: String::new(),
        content_type: String::new(),
    })
    .unwrap();
    assert!(!private.2);
}

#[test]
fn native_transport_signs_in_refreshes_proxies_and_signs_out_without_exposing_tokens() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}/", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let mut requests = Vec::new();
        for index in 0..5 {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&mut stream);
            requests.push(request.clone());
            match index {
                0 => write_json(
                    &mut stream,
                    "200 OK",
                    &auth_session_payload("access-generation-01", "refresh-generation-01"),
                ),
                1 => write_json(
                    &mut stream,
                    "200 OK",
                    &auth_session_payload("access-generation-02", "refresh-generation-02"),
                ),
                2 => write_json(
                    &mut stream,
                    "200 OK",
                    r#"{"ok":true,"schema":"app-state-test-v1"}"#,
                ),
                3 | 4 => write_json(
                    &mut stream,
                    "200 OK",
                    r#"{"ok":true,"schema":"fs-desktop-auth-response-v1","session":null,"reason":null}"#,
                ),
                _ => unreachable!(),
            }
        }
        requests
    });

    let api = DesktopAuthApi::new_test_loopback(&origin).unwrap();
    let signed_in = api.sign_in("coach", "test-password").unwrap();
    assert_eq!(
        signed_in.snapshot.actor_id,
        "11111111-1111-4111-8111-111111111111"
    );
    assert_eq!(
        signed_in.snapshot.team_id,
        "44444444-4444-4444-8444-444444444444"
    );
    let refreshed = api.refresh(&signed_in.refresh_token).unwrap();
    assert_eq!(refreshed.refresh_token.as_str(), "refresh-generation-02");
    let response = api
        .request(
            &DesktopApiRequest {
                path: "/api/app-state?fresh=1".into(),
                method: "GET".into(),
                body: String::new(),
                content_type: String::new(),
            },
            Some(refreshed.access_token.as_str()),
        )
        .unwrap();
    assert_eq!(response.status, 200);
    api.reset_password("coach@example.com").unwrap();
    api.sign_out(Some(refreshed.access_token.as_str())).unwrap();

    let requests = server.join().unwrap();
    assert!(requests[0].contains("POST /api/desktop-auth HTTP/1.1"));
    assert!(requests[0].contains("\"password\":\"test-password\""));
    assert!(requests[1].contains("\"refreshToken\":\"refresh-generation-01\""));
    assert!(requests[2].contains("GET /api/app-state?fresh=1 HTTP/1.1"));
    assert!(requests[2].contains("authorization: Bearer access-generation-02"));
    assert!(requests[3].contains("\"action\":\"reset-password\""));
    assert!(requests[3].contains("\"identifier\":\"coach@example.com\""));
    assert!(!requests[3].contains("authorization:"));
    assert!(requests[4].contains("\"action\":\"sign-out\""));
    assert!(requests[4].contains("authorization: Bearer access-generation-02"));
}

#[test]
fn authorization_rejection_is_typed_for_native_revocation() {
    assert!(is_authorization_rejection(
        "desktop authorization rejected: membership revoked"
    ));
    assert!(!is_authorization_rejection(
        "desktop authentication service is unavailable"
    ));
}
