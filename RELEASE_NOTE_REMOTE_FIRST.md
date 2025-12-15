Release: remote-first refactor

- One-line summary: Replace global fetch monkey-patch with a centralized `remoteFetch` wrapper and centralize remote API calls (remoteUpsert/remoteDelete/_fetchJsonOrExplain) to support stable Apps Script exec usage.

Why: improves safety and maintainability by avoiding global fetch replacement, consolidating legacy URL rewrites, and enabling safer remote-first behavior.

Files changed:
- app.js (refactor: remoteFetch wrapper + updated API callers)
- tools/check_remote.js (smoke test for Apps Script exec endpoint)
- ROLLBACK.md (rollback instructions)

Verification: smoke test against Apps Script exec endpoint returned JSON for `?action=list&collection=bloklar_yeni_demo`.

