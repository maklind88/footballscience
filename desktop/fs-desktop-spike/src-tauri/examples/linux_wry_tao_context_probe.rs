#[cfg(not(target_os = "linux"))]
fn main() -> std::process::ExitCode {
    eprintln!("This WebKitGTK control requires Linux.");
    std::process::ExitCode::FAILURE
}

#[cfg(target_os = "linux")]
fn main() -> std::process::ExitCode {
    match linux::run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Wry/Tao control failed: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::error::Error;
    use std::fs::{self, DirBuilder};
    use std::os::unix::fs::DirBuilderExt;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};
    use tauri_runtime_wry::tao::{
        event::Event,
        event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy, EventLoopWindowTarget},
        platform::{run_return::EventLoopExtRunReturn, unix::WindowExtUnix},
        window::{Window, WindowBuilder},
    };
    use tauri_runtime_wry::wry::{
        Error as WryError, WebContext, WebView, WebViewBuilder, WebViewBuilderExtUnix,
        http::{Method, Request, Response, StatusCode, header::CONTENT_TYPE},
    };

    const SCHEME: &str = "fs-probe";
    const START_URL: &str = "fs-probe://localhost/index.html";
    const READY_TITLE: &str = "fs-probe-ready";
    const DEADLINE: Duration = Duration::from_secs(12);

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum WindowCase {
        PersistentMain,
        EphemeralCandidate,
        EphemeralRecovery,
    }

    impl WindowCase {
        fn label(self) -> &'static str {
            match self {
                Self::PersistentMain => "persistent-main",
                Self::EphemeralCandidate => "ephemeral-candidate",
                Self::EphemeralRecovery => "ephemeral-recovery",
            }
        }
    }

    fn fixture_response(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        let (status, kind, body) = if request.method() == Method::GET
            && request.uri().scheme_str() == Some(SCHEME)
            && request
                .uri()
                .authority()
                .map(|authority| authority.as_str())
                == Some("localhost")
            && request.uri().query().is_none()
        {
            match request.uri().path() {
                "/index.html" => (
                    StatusCode::OK,
                    "text/html; charset=utf-8",
                    "<!doctype html><meta charset=utf-8><title>loading</title><script type=module src=/app.mjs></script>",
                ),
                "/app.mjs" => (
                    StatusCode::OK,
                    "text/javascript; charset=utf-8",
                    "document.title = 'fs-probe-ready';",
                ),
                _ => (
                    StatusCode::NOT_FOUND,
                    "text/plain",
                    "Unknown fixture resource",
                ),
            }
        } else {
            (
                StatusCode::FORBIDDEN,
                "text/plain",
                "Fixture request denied",
            )
        };
        Response::builder()
            .status(status)
            .header(CONTENT_TYPE, kind)
            .header(
                "Content-Security-Policy",
                "default-src 'none'; script-src 'self'",
            )
            .body(body.as_bytes().to_vec())
            .expect("static response headers are valid")
    }

    fn open_window(
        target: &EventLoopWindowTarget<WindowCase>,
        proxy: &EventLoopProxy<WindowCase>,
        shared_context: &mut WebContext,
        case: WindowCase,
    ) -> Result<(WebView, Window), Box<dyn Error>> {
        let incognito = case != WindowCase::PersistentMain;
        let window = WindowBuilder::new()
            .with_title(case.label())
            .with_visible(case != WindowCase::EphemeralCandidate)
            .build(target)?;
        let container = window.default_vbox().ok_or("missing GTK container")?;

        if case == WindowCase::EphemeralCandidate {
            let duplicate = WebViewBuilder::new_with_web_context(shared_context)
                .with_incognito(true)
                .with_asynchronous_custom_protocol(SCHEME.into(), |_, request, responder| {
                    responder.respond(fixture_response(request));
                })
                .build_gtk(container);
            match duplicate {
                Err(WryError::DuplicateCustomProtocol(scheme)) if scheme == SCHEME => {
                    println!("PASS borrowed persistent context rejected duplicate scheme");
                }
                _ => {
                    return Err(
                        "borrowed persistent context did not produce DuplicateCustomProtocol"
                            .into(),
                    );
                }
            }
        }

        let builder = if incognito {
            WebViewBuilder::new()
        } else {
            WebViewBuilder::new_with_web_context(shared_context)
        };
        let proxy = proxy.clone();
        let webview = builder
            .with_id(case.label())
            .with_incognito(incognito)
            .with_navigation_handler(|url| url == START_URL)
            .with_document_title_changed_handler(move |title| {
                if title == READY_TITLE {
                    let _ = proxy.send_event(case);
                }
            })
            .with_asynchronous_custom_protocol(SCHEME.into(), move |id, request, responder| {
                let mut response = fixture_response(request);
                if id != case.label() {
                    *response.status_mut() = StatusCode::FORBIDDEN;
                    response.body_mut().clear();
                }
                responder.respond(response);
            })
            .with_url(START_URL)
            .build_gtk(container)?;
        Ok((webview, window))
    }

    fn verify(profile: PathBuf) -> Result<(), Box<dyn Error>> {
        let mut event_loop = EventLoopBuilder::<WindowCase>::with_user_event().build();
        let proxy = event_loop.create_proxy();
        let mut context = WebContext::new(Some(profile));
        let mut current = WindowCase::PersistentMain;
        let mut windows = vec![open_window(&event_loop, &proxy, &mut context, current)?];
        let mut deadline = Instant::now() + DEADLINE;
        let mut completed = false;

        let exit = event_loop.run_return(|event, target, flow| {
            *flow = ControlFlow::WaitUntil(deadline);
            if Instant::now() >= deadline {
                eprintln!(
                    "Timed out waiting for {} JavaScript marker",
                    current.label()
                );
                *flow = ControlFlow::ExitWithCode(1);
                return;
            }
            let Event::UserEvent(ready) = event else {
                return;
            };
            if ready != current {
                return;
            }

            println!(
                "PASS {} loaded HTML and executed its module",
                current.label()
            );
            current = match current {
                WindowCase::PersistentMain => WindowCase::EphemeralCandidate,
                WindowCase::EphemeralCandidate => WindowCase::EphemeralRecovery,
                WindowCase::EphemeralRecovery => {
                    completed = true;
                    *flow = ControlFlow::Exit;
                    return;
                }
            };
            match open_window(target, &proxy, &mut context, current) {
                Ok(window) => {
                    windows.push(window);
                    deadline = Instant::now() + DEADLINE;
                    *flow = ControlFlow::WaitUntil(deadline);
                }
                Err(error) => {
                    eprintln!("Unable to open {}: {error}", current.label());
                    *flow = ControlFlow::ExitWithCode(1);
                }
            }
        });

        if exit != 0 || !completed {
            return Err("Wry/Tao window sequence did not complete".into());
        }
        Ok(())
    }

    pub fn run() -> Result<(), Box<dyn Error>> {
        let profile =
            std::env::temp_dir().join(format!("fs-wry-tao-probe-{}", uuid::Uuid::new_v4()));
        DirBuilder::new().mode(0o700).create(&profile)?;
        let result = verify(profile.clone());
        let cleanup = fs::remove_dir_all(profile);
        result?;
        cleanup?;
        Ok(())
    }
}
