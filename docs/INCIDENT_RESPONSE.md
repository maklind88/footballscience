# Incident Response

Production incidents should be visible, boring to triage, and reversible.

## Production Incident Alert

`.github/workflows/production-incident-alert.yml` watches completed release and monitor workflows. If one fails, it opens or updates a GitHub issue titled `Production incident: <workflow>`.

It watches:

- `QA` failures on `main`
- `Supabase Migrations`
- `Production Deploy`
- `Production Monitor`
- `Production Rollback`

The issue contains the workflow run, branch, commit, live URL, actor, and first-response checklist. It must never include secrets, passwords, auth tokens, backup data, or user content.

## First Response

1. Open the linked workflow run and find the first failing step.
2. Check [footballscience.xyz](https://footballscience.xyz) before assuming users are affected.
3. If live is broken, use the manual `Production Rollback` workflow with a known-good deployment URL or id.
4. After any rollback or hotfix, confirm `npm run release:postdeploy` and authenticated live smoke pass.
5. Comment on the incident issue with the action taken and close it only after the signal is green again.

## Safety Rules

- Do not deploy over an open incident unless the deploy is the rollback or the explicit hotfix.
- Do not paste secrets into GitHub issues, Codex chat, workflow logs, or docs.
- Do not restore data until code health is verified first.
- Do not disable the failing monitor to make the release green.

## Readiness Check

Run:

```bash
npm run release:incident-readiness
```

This verifies the workflow, scripts, labels, docs, and QA hooks are still present.
