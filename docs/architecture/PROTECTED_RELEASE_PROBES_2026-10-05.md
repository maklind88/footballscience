# Protected release probes

Owner: System / Security. Scope: release tooling only, accompanying backup integrity PR #255 before save reliability PR #252. The user authorized Deploy safe and then the release-blocker correction.

## Observed failure

The unauthenticated staging branch probe followed Vercel Authentication to an HTML login page and reported a missing Supabase reference. Authenticated Vercel curl confirmed staging branch and custom domain use the staging database, distinct from production. No release had started.

## Correction

Shared release probes use bounded public requests without redirect following. For protected Vercel deployment URLs and the four read-only verification paths, they use pinned Vercel CLI 53.2.0 curl with its supported authenticated protection mechanism. A canonical local project link is mandatory before authentication. Curl does not follow redirects. CLI errors are redacted rather than emitting token-bearing command arguments. Other hosts, paths, writes, application errors and network failures never trigger an authenticated fallback.

Isolation and staging alias checks now require valid exact Supabase HTTPS origins; missing configuration cannot masquerade as a distinct production database. Production promotion retains project, SHA, target, deployment identity, database and byte-hash checks. Protection settings and domain routing are unchanged by the read helper.

## Validation

Targeted tests cover public and protected reads, denied responses, malformed JSON/login pages, missing configuration, exact database hosts, CLI failure redaction, wrong local project binding, and protected production artifacts with wrong database or content. Executable isolation scenarios cover correctly separated databases, identical databases, missing live configuration, branch mismatch and login HTML. The corrected isolation command also passed against current staging and production without deployment.

Full Safe Lane validation and production verification remain required for release.
