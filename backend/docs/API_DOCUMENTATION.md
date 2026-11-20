# LeadNivesh Broker Platform — API Documentation & Integration Specification

> **Base URL:** `http://localhost:5000`  
> **API Version Prefix:** `/api/v1`  
> **Protocol:** HTTP/1.1 (Dev), HTTPS (Staging / Production)  
> **Content-Type:** `application/json`  
> **Postman Workspace:** `Lead Nivash` (Cloud Synced)  
> **Test Suite:** `node scripts/testAllEndpoints.js` (48/48 Endpoints Automated Verification)

---

## 1. Architectural Standards & Design Conventions

### 1.1 Multi-Tenant Isolation
All broker-facing records (`Property`, `Buyer`, `Deal`, `LocalityAlias`, `ShareLink`) are strictly scoped by `userId`. Every query verifies ownership; cross-tenant access is rejected with `404 NOT_FOUND` or `403 FORBIDDEN`.

### 1.2 Monetary Representation (Paise Standard)
To avoid floating-point math rounding issues inherent in IEEE 754 numbers:
* **All prices, demands, budgets, deals, and commission payments are represented strictly in integer paise.**
* Formula: `₹1.00 = 100 paise`.
* Example: `₹50,00,000` (50 Lakhs) = `500000000` paise.
* All schema validators enforce `z.number().int().min(10000)` (Minimum ₹100).

### 1.3 Uniform Envelope Format

#### Success Envelope (`200 OK`, `201 Created`):
```json
{
  "success": true,
  "data": {
    "_id": "67389a9c84918e38d0111111",
    "title": "3 BHK Luxury Floor in Sector 12",
    "priceDemandPaise": 850000000,
    "status": "available",
    "createdAt": "2026-11-16T18:00:00.000Z"
  }
}
```

#### Paginated List Envelope:
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

#### Standard Error Envelope:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "body.priceDemandPaise": ["Price must be an integer in paise"],
      "body.size.unit": ["Invalid enum value. Expected 'gaj' | 'sqft' | 'marla' | 'kanal' | 'acre' | 'bigha'"]
    }
  }
}
```

---

## 2. HTTP Status Codes & Error Catalog

| HTTP Status | Error Code | Trigger Condition / Cause | Corrective Action |
|---|---|---|---|
| **`200 OK`** | *(None)* | Request succeeded (GET, PATCH, DELETE, login). | Process returned payload. |
| **`201 Created`** | *(None)* | New resource created (POST `/properties`, POST `/buyers`, etc.). | Location or newly created object returned in `data`. |
| **`400 Bad Request`** | `VALIDATION_ERROR` | Schema validation failed via Zod or Mongoose (missing field, wrong type, extra strict keys). | Check `error.fields` for exact field path and requirements. |
| **`400 Bad Request`** | `INVALID_REQUEST` | Malformed ObjectId (CastError) or invalid URL parameter. | Ensure all entity IDs are 24-character hex MongoDB ObjectIds. |
| **`401 Unauthorized`** | `UNAUTHORIZED` | Missing `Authorization: Bearer <token>` header on protected routes. | Pass a valid JWT Access Token. |
| **`401 Unauthorized`** | `TOKEN_EXPIRED` | Access Token has expired (15-minute lifespan). | Call `POST /api/v1/auth/refresh` using httpOnly cookie to get a fresh token. |
| **`401 Unauthorized`** | `TOKEN_INVALID` | Malformed JWT or forged signature. | Clear client credentials and re-authenticate via `/login`. |
| **`401 Unauthorized`** | `INVALID_CREDENTIALS` | Incorrect email or password during login. | Prompt user to verify credentials. |
| **`403 Forbidden`** | `FORBIDDEN` | Endpoint requires `admin` role, but requester has `broker` role. | Contact system administrator for elevated privileges. |
| **`403 Forbidden`** | `PLAN_LIMIT_REACHED` | Broker is on `trial` or `lite` tier and reached max allowed properties/buyers. | Upgrade tier via Admin (`PATCH /api/v1/admin/users/:id/plan`). |
| **`403 Forbidden`** | `ACCOUNT_SUSPENDED` | Broker account has been deactivated by an admin. | Contact support to reactivate account. |
| **`404 Not Found`** | `NOT_FOUND` | Resource ID does not exist, was permanently deleted, or belongs to another broker. | Check resource ID or restore from trash. |
| **`409 Conflict`** | `CONFLICT` | Unique key violation (e.g., email already registered in system). | Use a different email address or recover existing account. |
| **`429 Too Many Requests`**| `RATE_LIMIT_EXCEEDED`| Surpassed rate limiter quota (5 login attempts / 15m; 100 API calls / 15m; 5 flyer inquiries / hr). | Back off and wait until rate limiter window resets. |
| **`500 Internal Error`**| `INTERNAL_ERROR` | Unhandled runtime exception or crash on the server. | Reported to Sentry; check server logs. |
| **`503 Service Unavailable`**| `DATABASE_UNAVAILABLE`| `/ready` probe detected MongoDB Atlas connection failure or disconnection. | Verify Atlas network access (IP allowlist) and connection string. |

---

## 3. Operational Lifecycles & State Transitions

### 3.1 Scenario 1: Property Inventory Lifecycle
```
[Draft/Incoming] ──► POST /properties (Create) ──► status: "available"
                           │
             ┌─────────────┴──────────────┐
             ▼                            ▼
      PATCH /:id (Change details)   PATCH /:id/status (Hold: deposit received)
             │                            │
             │                            ▼
             │                      PATCH /:id/status (Sold / Rented)
             │                            │
             ▼                            ▼
     DELETE /properties/:id ──► isDeleted: true (Soft Deleted / Discarded)
             │
             ├──► POST /trash/properties/:id/restore (Approve / Recover to available)
             │
             └──► DELETE /trash/properties/:id (Permanent Purge)
```

#### Detailed Operations:
1. **Creation (`201 Created`):**
   * Payload requires `type`, `locality`, `size` (`value` + `unit`), `priceDemandPaise`.
   * Defaults: `status: "available"`, `purpose: "Sale"`, `city: "Panipat"`.
2. **Field Changes (`200 OK`):**
   * Use `PATCH /api/v1/properties/:id`. Allows updating price, photos, facing, description, tags, and owner details without affecting status.
3. **Status Transitions (`200 OK`):**
   * Use `PATCH /api/v1/properties/:id/status` with `{ "status": "hold" | "sold" | "rented" | "available" }`.
   * When placed on `hold`, property is excluded from automated buyer quick-matching.
4. **Discard / Trash (`200 OK`):**
   * Calling `DELETE /api/v1/properties/:id` sets `isDeleted: true` and logs `deletedAt: Date`.
   * The property is hidden from `/properties` lists and match results.
5. **Restore (`200 OK`):**
   * Call `POST /api/v1/trash/properties/:id/restore` to revert `isDeleted: false`.
6. **Permanent Delete (`200 OK`):**
   * Call `DELETE /api/v1/trash/properties/:id` to remove the document permanently from MongoDB.

---

### 3.2 Scenario 2: Deal & Commission Pipeline
```
[Match Found] ──► POST /deals ──► stage: "interested"
                        │
                        ▼
               PATCH /deals/:id/stage ──► stage: "shown"
                        │
                        ▼
               PATCH /deals/:id/stage ──► stage: "negotiating"
                        │
           ┌────────────┴─────────────┐
           ▼                          ▼
[Approve / Won]                  [Discard / Lost]
stage: "finalized"               stage: "lost"
(expectedPaise locked)           (REQUIRES: lostReason)
           │                          ▲
           ▼                          │ If deal falls through
POST /deals/:id/payments              │
(Record commission received)          │
           │                          │
           ▼                          │
When total >= expectedPaise           │
stage: "paid"                         │
```

#### Critical Validation Rules:
* **Discarding a Deal (`stage: 'lost'`):**
  * **Rule:** When updating a deal to `lost`, `lostReason` is **mandatory** and cannot be empty.
  * **Failure Scenario (`400 Bad Request`):**
    ```json
    // Request: PATCH /api/v1/deals/67389a.../stage
    { "stage": "lost" }
    
    // Response:
    {
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "A reason is required when moving a deal to Lost"
      }
    }
    ```
  * **Success Scenario (`200 OK`):**
    ```json
    // Request: PATCH /api/v1/deals/67389a.../stage
    {
      "stage": "lost",
      "lostReason": "Buyer bought directly from owner to save broker commission."
    }
    ```
* **Commission Computation:**
  * Mode `percent`: `expectedPaise = Math.round((valuePaise * bps) / 10000)`. (e.g., 2% = 200 bps).
  * Mode `flat`: `expectedPaise = flatPaise`.

---

### 3.3 Scenario 3: AI Parser Engine (WhatsApp & SMS Raw Text)
```
[Raw WhatsApp Message]
          │
          ▼
POST /api/v1/parse (Preview & Extraction)
          │
          ▼
Broker Reviews Parsed Output:
  - Extracted Locality & Canonical Key
  - Extracted Price & Size
  - Missing field warnings
          │
    ┌─────┴────────────────────────────────┐
    ▼                                      ▼
[Discard / Reject]               [Change & Commit / Approve]
Discard preview response         POST /api/v1/parse/commit
No DB write                      { itemType: "listing", data: { ...overrides } }
                                 Writes clean record to DB!
```

#### Example Raw Text Ingest:
```json
POST /api/v1/parse
{
  "rawText": "Urgent sale! 200 gaj plot in Model Town near Arya Bal Bharti School, Panipat. Demand 65 Lakh negotiable. Owner: Ramesh 9876543210."
}
```

#### Extraction Output (`200 OK`):
```json
{
  "success": true,
  "data": {
    "detectedType": "listing",
    "confidence": 0.95,
    "extracted": {
      "type": "Plot",
      "locality": "Model Town",
      "localityKey": "model-town",
      "city": "Panipat",
      "size": { "value": 200, "unit": "gaj" },
      "priceDemandPaise": 650000000,
      "landmark": "Near Arya Bal Bharti School",
      "owner": { "name": "Ramesh", "phone": "9876543210" }
    }
  }
}
```

---

### 3.4 Scenario 4: Public Share Flyer & Inquiry Flow
```
Broker Property ──► POST /properties/:id/share ──► Generates public flyer URL: /p/:token
                                                          │
                                                          ▼
Buyer opens flyer in mobile browser ──────────────► GET /p/:token (Render clean HTML flyer)
                                                          │
                                                          ▼
Buyer fills inquiry form ─────────────────────────► POST /api/v1/public/inquiries
                                                          │
                                                    ┌─────┴─────────────────────┐
                                                    │ Bot Detection (Honeypot)  │
                                                    │ If `website` field filled │
                                                    │ ➔ Silent discard          │
                                                    └─────┬─────────────────────┘
                                                          │
                                                          ▼
Broker notifications & dashboard ─────────────────► GET /api/v1/inquiries
```

---

## 4. Endpoints Master Directory (13 Categories / 59 Endpoints)

### Category 00 — Health & Probes
* `GET /` — Root Welcome Info. Returns API status, version `1.0.0`, probes, and resource endpoints (`200 OK`).
* `GET /health` — Liveness check. Returns uptime and server timestamp. (`200 OK`).
* `GET /ready` — Readiness check. Verifies active MongoDB Atlas connection. (`200 OK` or `503 Service Unavailable`).
* `GET /api/v1` — API root service status. Returns version `1.0.0`. (`200 OK`).

### Category 01 — Authentication & Session Management
* `POST /api/v1/auth/register` — Create new broker account (`201 Created`).
* `POST /api/v1/auth/login` — Authenticate broker, issue access token & httpOnly cookie (`200 OK`).
* `POST /api/v1/auth/google` — Google OAuth token exchange & account login/registration with mobile validation (`200 OK`).
* `POST /api/v1/auth/refresh` — Rotate refresh token & issue fresh 15m access token (`200 OK`).
* `POST /api/v1/auth/logout` — Invalidate current session and clear refresh cookie (`200 OK`).
* `POST /api/v1/auth/forgot-password` — Issue password reset token via email (`200 OK`).
* `POST /api/v1/auth/reset-password` — Set new password using reset token (`200 OK`).
* `GET /api/v1/auth/sessions` — List all active login devices and IPs for the current broker (`200 OK`).
* `DELETE /api/v1/auth/sessions/:id` — Remote-revoke a specific session/device (`200 OK`).

### Category 02 — Property Inventory
* `POST /api/v1/properties` — Create property listing (`201 Created`).
* `GET /api/v1/properties` — List properties with pagination, search, and locality filters (`200 OK`).
* `GET /api/v1/properties/:id` — Fetch full property details (`200 OK`).
* `PATCH /api/v1/properties/:id` — Update property attributes (price, size, description, photos) (`200 OK`).
* `PATCH /api/v1/properties/:id/status` — Transition status (`available`, `hold`, `sold`, `rented`) (`200 OK`).
* `DELETE /api/v1/properties/:id` — Soft-delete property to Trash (`200 OK`).
* `POST /api/v1/properties/:id/share` — Generate signed public shareable link (`200 OK`).
* `GET /api/v1/properties/:id/matches` — Find matching buyers for this property (`200 OK`).

### Category 03 — Buyers & Requirements
* `POST /api/v1/buyers` — Register new buyer requirement (`201 Created`).
* `GET /api/v1/buyers` — List buyers with status & locality filters (`200 OK`).
* `GET /api/v1/buyers/:id` — Fetch buyer profile (`200 OK`).
* `PATCH /api/v1/buyers/:id` — Update budget, preferred localities, or contact details (`200 OK`).
* `DELETE /api/v1/buyers/:id` — Soft-delete buyer to Trash (`200 OK`).
* `GET /api/v1/buyers/:id/matches` — Find matching properties for this buyer (`200 OK`).

### Category 04 — Match Engine
* `POST /api/v1/matches/quick` — Run ad-hoc real-time match evaluation between an uncommitted property and buyer requirement (`200 OK`).
* `GET /api/v1/properties/:id/matches` — Compute score-ranked buyers for an inventory property (`200 OK`).
* `GET /api/v1/buyers/:id/matches` — Compute score-ranked properties for a buyer requirement (`200 OK`).

### Category 05 — Deals & Commission Pipeline
* `POST /api/v1/deals` — Create new deal linked to buyer and property (`201 Created`).
* `GET /api/v1/deals` — List broker deals (`200 OK`).
* `GET /api/v1/deals/:id` — Get deal details, payment records, and timeline (`200 OK`).
* `PATCH /api/v1/deals/:id/stage` — Update stage (`interested` ➔ `shown` ➔ `negotiating` ➔ `finalized` ➔ `paid` OR `lost`) (`200 OK`).
* `POST /api/v1/deals/:id/payments` — Log commission payment received in paise (`200 OK`).
* `DELETE /api/v1/deals/:id` — Soft-delete deal to Trash (`200 OK`).

### Category 06 — AI Parsing Engine
* `POST /api/v1/parse` — Extract structured entity from raw WhatsApp/SMS message (`200 OK`).
* `POST /api/v1/parse/commit` — Commit reviewed and modified entity directly into the inventory or buyer list (`201 Created`).

### Category 07 — Broker Dashboard
* `GET /api/v1/dashboard/today` — Aggregated daily summary: total inventory value, active deals, follow-ups scheduled for today, and inquiries (`200 OK`).
* `GET /api/v1/dashboard` — Alias to `/dashboard/today` (`200 OK`).

### Category 08 — Locality Aliases & Regional Normalization
* `GET /api/v1/aliases` — List all normalized localities and vernacular aliases (`200 OK`).
* `POST /api/v1/aliases` — Define new canonical locality and its variations (`201 Created`).
* `PATCH /api/v1/aliases/:id` — Append or modify alias strings (`200 OK`).
* `DELETE /api/v1/aliases/:id` — Delete locality alias mapping (`200 OK`).

### Category 09 — User Profile & Broker Branding
* `GET /api/v1/users/me` — Get current logged-in broker's profile and plan details (`200 OK`).
* `PATCH /api/v1/users/me` — Update broker agency name, phone, or bio (`200 OK`).
* `POST /api/v1/users/me/logo/sign` — Generate signed Cloudinary upload params for agency logo (`200 OK`).
* `GET /api/v1/users/me/export` — Download full GDPR/data backup of all broker inventory, buyers, and deals as JSON (`200 OK`).
* `DELETE /api/v1/users/me` — Permanently delete broker account and purge data (`200 OK`).

### Category 10 — Public Endpoints & Consumer Inquiries
* `GET /p/:token` — Render branded public property flyer webpage for consumers (`200 OK`).
* `POST /api/v1/public/inquiries` — Public endpoint: consumer submits property inquiry (`201 Created`).
* `POST /api/v1/public/contact` — Public landing page contact lead form (`201 Created`).
* `GET /api/v1/inquiries` — Broker endpoint: view inquiries received on owned properties (`200 OK`).

### Category 11 — Trash & Recovery System
* `GET /api/v1/trash` — List all soft-deleted properties, buyers, and deals (`200 OK`).
* `POST /api/v1/trash/:type/:id/restore` — Recover an item from trash back to active state (`200 OK`).
* `DELETE /api/v1/trash/:type/:id` — Permanently eradicate an item from MongoDB (`200 OK`).

### Category 12 — Admin Operations
* `GET /api/v1/admin/users` — List all registered platform brokers with pagination and tier filter (`200 OK`).
* `PATCH /api/v1/admin/users/:id/plan` — Upgrade or downgrade a broker's tier (`trial`, `lite`, `pro`) and set expiry date (`200 OK`).
* `GET /api/v1/admin/usage` — View system-wide aggregate statistics (`200 OK`).
* `GET /api/v1/admin/inquiries` — View system-wide public property inquiries (`200 OK`).
* `GET /api/v1/admin/contacts` — View public landing page contact leads (`200 OK`).
