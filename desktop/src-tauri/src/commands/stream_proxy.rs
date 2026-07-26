// Enigma2/Dreambox receivers (and most bare-metal IPTV boxes) send no
// CORS headers on their stream/API endpoints, so a direct fetch() from
// the webview to e.g. http://192.168.x.x:8001/... gets its response
// body blocked from JS even though the request itself reaches the box
// fine — the browser enforces CORS regardless of Tauri's own settings,
// since it applies to any cross-origin fetch initiated by page script.
//
// The fix is a tiny local reverse proxy: the frontend fetches
// http://127.0.0.1:PROXY_PORT/proxy?url=<target>, this Rust code makes
// the real request (not subject to browser CORS at all) and streams
// the response back with an Access-Control-Allow-Origin header that —
// unlike the receiver's — we actually control.
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

pub const PROXY_PORT: u16 = 47821;

pub fn start() {
    thread::spawn(|| {
        let server = match Server::http(("127.0.0.1", PROXY_PORT)) {
            Ok(s) => s,
            Err(e) => {
                log::error!("reelix: stream proxy failed to bind :{}: {}", PROXY_PORT, e);
                return;
            }
        };

        for request in server.incoming_requests() {
            // Each request handled in its own thread so a slow/live
            // stream download doesn't block the others.
            thread::spawn(move || handle_request(request));
        }
    });
}

fn handle_request(request: tiny_http::Request) {
    let target = match target_url(request.url()) {
        Some(t) => t,
        None => {
            let _ = request.respond(Response::from_string("missing or invalid ?url=").with_status_code(400));
            return;
        }
    };

    log::info!("reelix: stream proxy fetching {}", target);

    let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();

    match ureq::get(&target).call() {
        Ok(res) => {
            let content_type = res.header("Content-Type").unwrap_or("application/octet-stream").to_string();
            let content_type_header = Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()).unwrap();

            // No content_length here — a live channel never ends, so
            // this streams via chunked transfer encoding for as long as
            // the player keeps reading, instead of buffering the whole
            // (infinite) body in memory first.
            let response = Response::new(StatusCode(200), vec![content_type_header, cors_header], res.into_reader(), None, None);
            let _ = request.respond(response);
        }
        Err(e) => {
            log::warn!("reelix: stream proxy request to {} failed: {}", target, e);
            let response = Response::from_string(format!("upstream request failed: {}", e))
                .with_status_code(502)
                .with_header(cors_header);
            let _ = request.respond(response);
        }
    }
}

fn target_url(request_url: &str) -> Option<String> {
    let query = request_url.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("url=") {
            return urlencoding_decode(value);
        }
    }
    None
}

fn urlencoding_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}
