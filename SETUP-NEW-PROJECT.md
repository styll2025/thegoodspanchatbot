# Setting up the parallel evaluation as its own project

This is the complete repository: the current evaluation (`/`) and the conversational evaluation (`/conversation`). The form's code stays because the conversation reuses its questions, rules and the standard plan used for comparison.
Build with `node scripts/build.mjs` (Node 18 or later). The built pages are already included.

## Cloudflare (new Worker)
1. Create a KV namespace (Storage & Databases → KV), for example `goodspan-v2-plans`, and put its id in `wrangler.jsonc`.
2. Connect the new GitHub repository to a new Worker (Workers & Pages → Create → Import a repository). Keep the Worker name `goodspan-evaluation-v2`, or any name other than the live one.
3. In the Worker's Settings → Variables and Secrets, add the secret `ANTHROPIC_API_KEY`. Without it, `/conversation` asks the approved questions and shows the standard plan, with no AI report.
   Optional: `GS_TALK_MODEL`, `GS_TALK_FAST_MODEL`, `GS_REPORT_MODEL`.
4. Add a custom domain or route for the new Worker, for example `v2.evaluation.thegoodspan.com`.

## Shared with the live evaluation (change if you want them separate)
- **Voice, interpretation and the "About you" summary** (`/api/interpret`, `/api/transcribe`, `/api/story`) are forwarded to the existing Pages deployment (`PAGES_API` in `worker.js`).
- **Completions go to the same Google Sheet** (`GS_SHEET_URL` in `scripts/build.mjs`). Rows from `/conversation` are marked with source `conversation-v2` and a "Report by" column, which makes the two easy to compare. To store the report itself in the sheet, paste the updated `scripts/completions.gs` into the Apps Script project and redeploy it.

## Before real members use it
- The approved statements in `core/evidence.js` are drafts: they need review by a qualified professional.
- Clinical sign-off of the safety rules, and the privacy notice link (`GS_PRIVACY_URL` in `scripts/build.mjs`).
