# Backend Rules for LeadNivesh API

## MANDATORY: API Documentation & Verification Sync

<CRITICAL_DIRECTIVE>
Whenever you add, modify, deprecate, or fix ANY backend endpoint, route, controller, Zod schema, or model, you MUST ALWAYS update the corresponding documentation, Postman collections, and automated tests as part of the SAME turn or pull request before concluding the task.

NEVER leave documentation, tests, or Postman collections stale or out-of-sync with the codebase.
</CRITICAL_DIRECTIVE>

### Required Actions on Any API Change:
1. **API Documentation (`docs/API_DOCUMENTATION.md`):**
   - Update the endpoint table with method, path, query/body params, and headers.
   - Document all HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `429`, `500`).
   - Detail operational scenarios (`discard`, `approve`, `change`, `restore`).
   - Include realistic success and error payloads.
2. **Postman Cloud Synchronization:**
   - Update `leadnivesh.postman_collection.json`.
   - Run `node scripts/pushAllCategories.js` to sync all 13 Category Collections with the `Lead Nivash` Postman cloud workspace.
3. **Automated Verification:**
   - Add/update the test in `scripts/testAllEndpoints.js`.
   - Run `node scripts/testAllEndpoints.js` to ensure 100% pass rate.
4. **References & Setup:**
   - Update `README.md` and `.env.example` if dependencies or environment variables change.
