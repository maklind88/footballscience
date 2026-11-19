# Local Data Sensitivity Matrix — Draft 1

No production desktop cache or encryption layer exists yet. “Protected” below is a requirement, not a claim that encryption has been implemented.

| Data class | FS examples | Sensitivity | Initial offline default | Required controls | Residual risk / decision |
| --- | --- | --- | --- | --- | --- |
| Application code and compatibility metadata | shell assets, build IDs, protocol versions, release policy | Low | Cache | Signature/HTTPS, compatibility check, last-known-good activation | Broken or compromised deployment can affect UI; native bridge remains narrow |
| Device preferences | window state, theme, offline selections | Low | Local | App-owned directory, bounded schema, no secrets | Another same-OS-user process may read without application encryption |
| Ordinary coaching operations | schedule, periodization, session blocks, exercises, set pieces | Internal team | Selected only | Tenant/user partition, offline lease, local integrity, outbox durability | Stolen unlocked laptop can expose team plans without encryption |
| Match preparation | gameplans, opponent notes, staff responsibilities | Confidential team | Read-only selected match initially | Explicit download, short lease, revocation cleanup/lock | Competitive harm if device/cache is copied |
| Personal player identity | name, squad number, position, image, team membership | Personal data | Minimum current-team subset only | Data minimization, tenant/user partition, revocation | Public profile image bucket does not make all profile context public |
| Player development/performance | IDP goals, reviews, evidence, performance context | Sensitive personal | Online only initially | Security review before caching, explicit scope and lease | May reveal evaluations and employment-related information |
| Medical/health | injuries, clinical notes, RTP plans, restrictions, clearance | Highly sensitive health data | Online only | No first-release cache; later explicit legal/security decision, strong encryption, strict lease | Highest impact; browser visibility is not sufficient justification to cache |
| Recruitment and financial | transfer room, confidential scouting reports, valuations | Highly confidential | Online only | Explicit future approval, strong local protection and revocation | Competitive and contractual harm |
| Communications | chat messages, reactions, attachments, presence | Confidential/personal | Online only initially | No message-body cache; push contains minimum metadata | Notification and OS surfaces can still reveal limited metadata |
| Credentials | refresh token, offline lease secret/key material | Critical secret | Required only for desktop auth | One session authority; Keychain/Credential Manager; never logs/files/SQLite plaintext | Secure storage protects at rest, not a compromised running session |
| Access token | short-lived JWT | Secret | Memory only where possible | Narrow broker, short lifetime, never logs/support bundle | XSS can still act within the user's authorized session |
| Audit and admin data | user list, permissions, audit events | Sensitive security/identity | Online only | Server authoritative; minimum authorization summary only | Cached stale permissions must never extend authorization indefinitely |
| Raw video | full match/training files | Large and potentially sensitive | Explicit local selection only | Existing companion/app-owned directory, integrity hash, access lease policy | Disk volume and copied-file exposure; do not claim encryption |
| Derived media | clips, exports, drawings, tracking artifacts | Large/internal/personal | Explicit local selection | Atomic download, checksum/size, managed deletion, upload queue | May contain identifiable players or medical context |
| Rebuildable cache | server snapshots without pending edits | Varies by entity | Bounded | May be rebuilt only after outbox extraction; never mix tenants | Cache corruption is recoverable; authorization still applies |
| Unsynchronized operations | pending session mutations and attachments | Critical user work | Durable | Atomic entity+outbox transaction, backups/recovery, never automatic deletion | Highest durability priority even when sync is disabled |

## Initial protection position

- Do not claim database encryption. It is not implemented or verified.
- Depend on normal application-directory permissions and full-disk encryption only as environmental layers, not as proof that FS data is encrypted.
- Keep Medical, IDP, transfer, chat bodies, broad scouting datasets, and admin/audit datasets online-only until local encryption, lease, revocation, and recovery are proven.
- Partition every local record by stable user, organization, and team scope.
- Store refresh credentials in OS secure storage when implemented; never in plaintext files, localStorage, SQLite, logs, diagnostics, or installers.
- Preserve unauthorized/revoked pending work in quarantine without displaying or uploading it until authorization is safely resolved.
