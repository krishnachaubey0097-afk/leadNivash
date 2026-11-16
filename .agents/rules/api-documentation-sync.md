# MANDATORY RULE: Continuous API Documentation & Verification Sync

<CRITICAL_DIRECTIVE>
Whenever you add, modify, deprecate, or fix ANY backend endpoint, route, controller, Zod schema, or model, you MUST ALWAYS update the corresponding documentation, Postman collections, and verification tests as part of the SAME turn or pull request before concluding the task.

NEVER leave documentation, tests, or Postman collections stale or out-of-sync with the codebase.
</CRITICAL_DIRECTIVE>

---

## 1. Trigger Conditions
This rule triggers immediately upon changing or creating any of the following files:
* Route definitions: `backend/src/modules/**/*.routes.ts` or `backend/src/app.ts`
* Controllers & handlers: `backend/src/modules/**/*.controller.ts`
* Validation schemas: `backend/src/modules/**/*.schema.ts`
* Database models: `backend/src/modules/**/*.model.ts`
* Route middleware: `requireAuth.ts`, `roleGuard.ts`, `planGuard.ts`, `rateLimiter.ts`, `validate.ts`, `errorHandler.ts`

---

## 2. Mandatory Step-by-Step Sync Protocol

Whenever a trigger occurs, the developer/agent MUST execute the following 4 steps:

### Step 1: Update API Documentation (`backend/docs/API_DOCUMENTATION.md`)
1. **Endpoint Specifications:**
   * Method, Path, and Category.
   * Required Headers (`Authorization: Bearer <token>`, `Content-Type: application/json`).
   * Path parameters, Query parameters, and Request Body Schema with exact types and field constraints.
2. **Status Codes & Response Payloads:**
   * Document Success Status Codes (`200 OK` or `201 Created`) with realistic response envelope `{ success: true, data: ... }`.
   * Document possible Error Status Codes (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `429 Rate Limited`) and their specific error codes (e.g., `VALIDATION_ERROR`, `PLAN_LIMIT_REACHED`).
3. **Operational Lifecycles & State Transitions:**
   * If the endpoint modifies state transitions (such as property status `available`/`hold`/`sold`, deal stages `interested`/`shown`/`negotiating`/`finalized`/`lost`, AI parsing preview/commit, or trash restore/permanent delete), update the corresponding Lifecycle Scenario in Section 3 of `API_DOCUMENTATION.md`.

### Step 2: Update Postman Collections (Local & Cloud Sync)
1. **Local Master File:**
   * Update `backend/leadnivesh.postman_collection.json` with the new or updated endpoint, query params, sample request body, and header tokens.
2. **Postman Cloud Synchronization:**
   * Run the sync script to update the live Postman workspace (`Lead Nivash`):
     ```bash
     cd backend && node scripts/pushAllCategories.js
     ```
   * Ensure both the individual Category Collection and the Unified Master Suite in Postman reflect the update.

### Step 3: Update & Run Automated Verification Suite
1. **Add / Update Test Case:**
   * In `backend/scripts/testAllEndpoints.js`, add or update the verification test for the modified endpoint.
2. **Execute Test Runner:**
   ```bash
   cd backend && node scripts/testAllEndpoints.js
   ```
   * Ensure all test cases pass with a **100% success rate**. If any test fails, fix the implementation or test payload before finishing.

### Step 4: Update Skill & Architecture References
1. If endpoint routes or parameter structures change, update:
   * `.agents/skills/leadnivesh-backend/references/endpoints.md`
2. If environment variables, global middlewares, or setup steps change, update:
   * `backend/README.md`
   * `backend/.env.example`
