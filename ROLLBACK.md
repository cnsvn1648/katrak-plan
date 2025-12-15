Rollback instructions — Remote-first refactor (app.js)

If anything goes wrong after this change, follow these steps to revert to the previous behavior quickly.

1) Revert `app.js` to the previous committed version (fast):

   git checkout -- app.js

   This will discard working-tree changes in `app.js` and restore the last committed version.

2) If you already committed this refactor and want to undo the commit:

   git log --oneline
   # find the commit hash prior to the refactor (eg. abc1234)
   git reset --hard abc1234

   Note: `git reset --hard` will reset the branch to the specified commit and discard subsequent commits. Use with caution.

3) If you want to keep the refactor commit but reintroduce the previous fetch-rewrite temporarily, you can reapply the old behavior from `app.js.bak` (if present):

   cp app.js.bak app.js
   # then test locally and commit if OK
   git add app.js
   git commit -m "revert: restore fetch-rewrite from app.js.bak as temporary rollback"

4) Restore localStorage flags (optional):

   If you need to revert the user's client preference flags (so clients prefer local again), instruct users to clear or update these keys in their browser devtools console:

   // revert remote preference (in browser console)
   localStorage.removeItem('v92_gs_use_remote');
   localStorage.removeItem('v92_gs_webapp_url');
   localStorage.removeItem('v92_gs_remote_preferred_at');
   localStorage.removeItem('v92_gs_remote_only_enabled');

   Or to explicitly prefer local for the current browser session:
   localStorage.setItem('v92_use_local_proxy','1');

5) Roll back migration snapshots or server state (Apps Script):

   - The server-side pre_remote snapshot was uploaded to collection `pre_remote_only_backups` with id `pre_remote_only_1765817266248` as a rollback assist.
   - If you need to revert server-side records, use the migration tool logs to identify upserted record ids and remove them via the Apps Script admin UI (or POST action=delete&id=...).

6) If you need help restoring a previous release branch or creating a hotfix branch, run:

   # create a hotfix branch from the commit before the refactor
   git checkout -b hotfix/restore-local abc1234

7) Contact/Notes

   If you need me to perform the rollback for you, reply with "ROLLBACK_NOW" and include how you'd like the server/local preference flags handled (e.g., clear remote flag for all clients, or keep server data but disable client writes). I'll prepare the exact git commands and, if permitted, run them.

Safety notes:
- Do not run `git reset --hard` if you have uncommitted desired changes in other files unless you have first stashed them.
- Always back up `app.js` (and `app.js.bak` if present) before making destructive operations.


Generated: 15 Aralık 2025
