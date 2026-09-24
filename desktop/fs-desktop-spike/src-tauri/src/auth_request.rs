//! Fence every authenticated broker response to its originating native session.
use crate::auth_api::{
    DesktopApiRequest, DesktopApiResponse, DesktopAuthApi, is_authorization_rejection,
};
use crate::authority::SessionAuthority;
use std::sync::Mutex;

pub fn request(
    api: &DesktopAuthApi,
    authority: &Mutex<SessionAuthority>,
    request: &DesktopApiRequest,
) -> Result<DesktopApiResponse, String> {
    let (expected, token) = {
        let authority = authority
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        let token = if authority.snapshot().actor_id.is_empty() {
            None
        } else {
            if let Err(error) = authority.refresh_if_needed(60_000, |refresh| api.refresh(refresh))
            {
                if is_authorization_rejection(&error) {
                    authority.revoke()?;
                }
                return Err(error);
            }
            Some(authority.access_token()?)
        };
        (authority.snapshot(), token)
    };
    let response = api.request(request, token.as_deref().map(String::as_str))?;
    let authority = authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?;
    let current = authority.snapshot();
    if current.actor_id != expected.actor_id
        || current.organization_id != expected.organization_id
        || current.tenant_id != expected.tenant_id
        || current.team_id != expected.team_id
        || current.partition_key != expected.partition_key
        || current.auth_epoch != expected.auth_epoch
    {
        return Err("desktop API session changed while awaiting response".into());
    }
    if let Some(token) = token {
        if authority.access_token()?.as_str() != token.as_str() {
            return Err("desktop API credential rotated while awaiting response".into());
        }
        if response.status == 401 {
            authority.revoke()?;
        }
    }
    Ok(response)
}
