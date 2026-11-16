---
name: leadnivesh-backend
description: >-
  LeadNivesh Broker Platform backend lifecycle, testing, and Postman sync engine.
  Use this skill whenever the user asks to start, test, health-check, debug, or deploy
  the LeadNivesh backend API, sync/update Postman collections, check MongoDB Atlas connectivity,
  or run the 48-endpoint automated verification suite.
---

# LeadNivesh Backend Engineering & Testing Skill

This skill provides automated runbooks, health diagnostics, test suites, and Postman Cloud synchronization for the **LeadNivesh Broker Platform** Node.js + Express + MongoDB Atlas backend.

---

## ⚡ Quick Capabilities

| Action | Command / Script | Purpose |
| :--- | :--- | :--- |
| **Full Health Check** | `powershell -ExecutionPolicy Bypass -File .agents/skills/leadnivesh-backend/scripts/check-status.ps1` | Probes `/health`, `/ready`, checks public IP, and verifies Atlas connection. |
| **Start Live Backend** | `cd backend; npm run dev` | Starts live server on `http://localhost:5000` with hot-reload and Atlas connection. |
| **Complete 105-Scenario DB Verification** | `node backend/scripts/verifyAllScenariosWithDb.js` | Executes full lifecycle tests across all 13 categories and directly asserts MongoDB state. |
| **Run 48-Endpoint Test Suite** | `node backend/scripts/testAllEndpoints.js` | Runs automated E2E tests across all 13 API categories (100% pass guarantee). |
| **Sync Postman Collections** | `node backend/scripts/publishCategoryCollections.js <PMAK_KEY>` | Pushes all 13 category collections live to Postman Cloud workspace `Lead Nivash`. |

---

## 🛠️ Operational Workflows

### 1. Dynamic IP & MongoDB Atlas Connection
The local development machine connects via a dynamic internet connection that rotates IP addresses.
- To check current public IP:
  ```powershell
  Invoke-RestMethod -Uri 'https://api.ipify.org'
  ```
- To verify whether current IP is in Atlas whitelist:
  Call MongoDB Atlas MCP tool `atlas-inspect-access-list` for project `6af6b0bb52e332316b9901c2`.
- **Permanent Solution:** Add `0.0.0.0/0` (Allow Access from Anywhere) in MongoDB Atlas Network Access so IP changes never interrupt server execution.

### 2. Starting the Backend Server
Always run from the `backend/` directory:
```powershell
cd F:\Work\leadnivash\backend
npm run dev
```
Verify the server starts with:
- `✅ MongoDB connected successfully`
- `🚀 LeadNivesh API server listening on http://localhost:5000`

### 3. Automated End-to-End Verification
To verify that all 13 categories and 48 endpoints are responding correctly:
```powershell
cd F:\Work\leadnivash\backend
node scripts/testAllEndpoints.js
```
Expected output:
```text
TOTAL ENDPOINTS TESTED : 48
PASSED (2xx OK)        : 48 (100%)
FAILED                 : 0
```

### 4. Postman Cloud Workspace Synchronization
Workspace ID: `9e692ab1-88a8-4e7a-aa95-c3edfff5dd5f` (Lead Nivash)

- To update the unified Master Suite:
  ```powershell
  cd F:\Work\leadnivash\backend
  node scripts/publishToPostman.js <YOUR_POSTMAN_API_KEY>
  ```
- To update all 13 individual Category Collections:
  ```powershell
  cd F:\Work\leadnivash\backend
  node scripts/publishCategoryCollections.js <YOUR_POSTMAN_API_KEY>
  ```

---

## 📋 Continuous Documentation & Postman Sync Rule

Whenever any backend endpoint, route, controller, Zod schema, or model is created, updated, or deprecated:
1. **API Documentation:** Update `backend/docs/API_DOCUMENTATION.md` with methods, paths, params, status codes, and lifecycles.
2. **Postman Workspace:** Run `node backend/scripts/pushAllCategories.js` to sync all 13 collections to Postman Cloud.
3. **Automated Verification:** Update and run `node backend/scripts/testAllEndpoints.js` (guaranteeing 100% pass rate).
4. **References:** Update `backend/README.md` and [references/endpoints.md](./references/endpoints.md).

---

## 📂 Architecture & Endpoints Reference
For complete endpoint contracts and schemas, see [references/endpoints.md](./references/endpoints.md) and [backend/docs/API_DOCUMENTATION.md](../../backend/docs/API_DOCUMENTATION.md).
