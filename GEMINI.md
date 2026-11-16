# Project Rules for LeadNivesh

## MANDATORY: API Documentation & Verification Sync

<CRITICAL_DIRECTIVE>
Whenever you add, modify, deprecate, or fix ANY backend endpoint, route, controller, Zod schema, or model, you MUST ALWAYS update the corresponding documentation, Postman collections, and automated tests as part of the SAME turn or pull request before concluding the task.

NEVER leave documentation, tests, or Postman collections stale or out-of-sync with the codebase.
</CRITICAL_DIRECTIVE>

### Required Actions on Any API Change:
1. **API Documentation:** Update `backend/docs/API_DOCUMENTATION.md` with:
   - Method, path, query/body params, and headers.
   - All HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `429`, `500`).
   - Relevant operational lifecycle scenarios (e.g., `discard`, `approve`, `change`, `restore`).
   - Standard success `{ "success": true, "data": ... }` and error `{ "success": false, "error": { "code", "message", "fields" } }` envelopes.
2. **Postman Workspace Sync:**
   - Update `backend/leadnivesh.postman_collection.json`.
   - Run `node backend/scripts/pushAllCategories.js` to sync all 13 Category Collections to the live Postman workspace (`Lead Nivash`).
3. **Automated Verification:**
   - Update `backend/scripts/testAllEndpoints.js`.
   - Run `node backend/scripts/testAllEndpoints.js` and verify a 100% pass rate.
4. **Quickstart & Skills Reference:**
   - Update `backend/README.md` if setup or environment variables change.
   - Update `.agents/skills/leadnivesh-backend/references/endpoints.md` if endpoints are added or removed.
