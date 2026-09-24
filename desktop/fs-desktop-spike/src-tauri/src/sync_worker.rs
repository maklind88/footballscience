//! One bounded push per explicit call. No timers, recursive retries, or remote activation.
use crate::auth_api::DesktopAuthApi;
use crate::authority::{SessionAuthority, SessionContextProof, now_unix_ms};
use crate::{local_data, sync_queue};
use rusqlite::Connection;
use std::sync::Mutex;

pub fn sync_once(
    api: &DesktopAuthApi,
    authority: &Mutex<SessionAuthority>,
    connection: &Mutex<Connection>,
    owner: &Mutex<()>,
    context: &SessionContextProof,
    validate_shell: impl Fn() -> Result<(), String>,
) -> Result<local_data::SessionSyncStatus, String> {
    let _owner = owner
        .try_lock()
        .map_err(|_| "desktop synchronization is already running".to_string())?;
    let (pending, token) = {
        let authority = authority
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        authority.validate(context)?;
        validate_shell()?;
        let connection = connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        let Some(pending) = sync_queue::next_pending(&connection, &context.partition_key)? else {
            return local_data::read_session_sync_status(&connection, &context.partition_key);
        };
        if pending.blocked() {
            return local_data::read_session_sync_status(&connection, &context.partition_key);
        }
        pending.authorize(&authority.snapshot())?;
        let token = authority.access_token()?;
        sync_queue::mark_attempt(&connection, &pending, timestamp()?)?;
        (pending, token)
    };

    // Neither SQLite nor authority is locked while the network is in flight.
    // An interrupted `sending` row is deliberately replayable with the same ID/body.
    let response = api.push_session_operation(pending.wire_body()?, token.as_str());

    // A late response must never acknowledge work or revoke a different account.
    let authority = authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?;
    authority.validate(context)?;
    validate_shell()?;
    pending.authorize(&authority.snapshot())?;
    // Refresh preserves auth_epoch. Fence the exact credential too, so an old 401
    // cannot revoke a newly rotated token from the same account/session epoch.
    if authority.access_token()?.as_str() != token.as_str() {
        return Err(
            "desktop sync credential rotated while awaiting response; local work preserved".into(),
        );
    }
    drop(token);
    let response = response?;
    let mut connection = connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    if matches!(response.status, 401 | 403) {
        local_data::quarantine_operation(
            &connection,
            &pending.request.operation_id,
            if response.status == 401 {
                "authorization-revoked"
            } else {
                "tenant-denied"
            },
            now_unix_ms()?,
        )?;
        if response.status == 401 {
            authority.revoke()?;
        }
        // Do not return a now-unauthorized partition's data to the caller.
        return Err("desktop synchronization authorization denied; local work preserved".into());
    }
    if response.status != 200 {
        return Err("desktop synchronization unavailable; local work preserved".into());
    }
    let ack = sync_queue::parse_ack(&response.body, &pending)?;
    sync_queue::commit_ack(&mut connection, &pending, &ack, timestamp()?)?;
    local_data::read_session_sync_status(&connection, &context.partition_key)
}

fn timestamp() -> Result<i64, String> {
    i64::try_from(now_unix_ms()?).map_err(|_| "desktop sync timestamp overflow".into())
}

#[cfg(test)]
#[path = "sync_worker_tests.rs"]
mod tests;
