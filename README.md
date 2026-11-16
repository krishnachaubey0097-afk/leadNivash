# LeadNivesh Backend API (Backend v1.1)

LeadNivesh is a broker operating system, AI parsing pipeline, and multi-channel property matching platform purpose-built for Indian Tier-2/3 real estate markets (Panipat, NCR, Haryana/Punjab). Built with TypeScript, Express 5, and Mongoose with strict multi-tenant isolation, cryptographic protection, offline-ready domain models, and zero external DB dependency during testing.

---

## Key Highlights & Architectural Invariants

1. **Owner Vault Isolation (`select: false`)**: Private seller/landlord contact info is strictly segregated in property schemas, excluded from queries by default, and never leaks in public flyers, share links, API responses, or GDPR data exports.
2. **Session Security & Refresh Token Rotation**:
   - `sessionId.secret` pattern stored as `HttpOnly; SameSite=Strict; Path=/api/v1/auth`.
   - Atomic rotation on expected hash with a **15-second grace window** for concurrent in-flight requests.
   - **Breach Detection**: Any replay of a retired token outside the grace window immediately revokes all sessions across all devices.
3. **Anti-Enumeration & Lockout Defense**:
   - Dummy bcrypt hash comparison on unknown emails ensures constant-time responses.
   - Dual-scope lockout: 5 failed attempts per (email+IP) triggers 15-minute lockout; 20 attempts per email triggers 60-minute lockout.
4. **Password Reset (Single-Use Token Hashing)**:
   - `POST /api/v1/auth/forgot-password`: Generates 32-byte crypto token, stores SHA-256 hash in DB with 30-min expiry, sends email via Nodemailer. Generic response prevents email enumeration.
   - `POST /api/v1/auth/reset-password`: Validates token hash, validates 8–72 byte bcrypt password, updates hash, clears token, and **revokes all active sessions**.
5. **Trash Vault (`/api/v1/trash`)**:
   - Dedicated recycle bin for soft-deleted properties, buyers, and deals with 30-day countdown (`daysLeft`).
   - Trashed items excluded from active listings, matches, and pipeline totals.
   - Restoring checks subscription plan limits (`402 PLAN_LIMIT_REACHED` if exceeded).
   - Old share links return `410 Gone` and are **never** reactivated on restore.
   - Permanent delete (`confirmText: "PERMANENT DELETE"`) deletes Cloudinary photos before deleting documents.
   - Daily cron cleans expired items older than 30 days (photos first, then documents).
6. **Inquiry Redesign & Founder Contact**:
   - Brokers fetch their inquiries via `GET /api/v1/inquiries`.
   - Public flyer submissions trigger an `ActivityLog` event (`inquiry_received`) with strictly **NO PII**.
   - Public landing page inquiries at `POST /api/v1/public/contact` (honeypot, E.164 normalization, SHA-256 IP hashing), accessible by admins at `GET /api/v1/admin/contacts`.
7. **Pure Function Matching Engine**: Deterministic 0–100 match scoring with structured audit reasons (`{ code, text }`) and empty locality safeguards.
8. **Server-Side Deal Calculations**: Pipeline commission calculated exclusively on the server in integer paise using basis points (`bps`), strictly excluding lost deals from pipeline forecasts and gracefully supporting overpayment and manual stage overrides. Soft-deletion supported at `DELETE /api/v1/deals/:id`.
9. **DPDP/GDPR Account Deletion**: Immediate PII tombstoning (email -> hashed tombstone, freeing original email for instant re-registration), anonymization of owner vault and buyer contacts, followed by hard-purge by automated cron past grace period.
10. **AI Parsing Pipeline (PRD §7)**:
   - Phone tokenization (`tokenizePhones` / `detokenizePhones`) to shield client PII from LLM prompts.
   - Dual-layer architecture: Official Google Gen AI (`@google/genai`) Gemini adapter (`gemini-2.5-flash`) with prompt-injection boundary (`<untrusted_user_text>`) and deterministic offline `RegexFallbackProvider`.
   - Normalization: Canonical size in Gaj (`units.ts`), price in integer paise (`money.ts`), and locality aliases.
   - Strict Privacy: `ParseLog` records ONLY metadata (character count, latency, tokens, cost) with zero raw text or client PII stored.
   - Atomic Transactions: `POST /parse/commit` wraps listing/buyer creations in all-or-nothing MongoDB transactions.

---

## Prerequisites

- **Node.js**: Active LTS (v22.x or v24.x) — Developed & verified on Node v24.15.0
- **npm**: 10.x or 11.x
- **OS**: Windows 10/11 (PowerShell / CMD), macOS, or Linux

---

## Windows Quick-Start Guide (PowerShell)

### 1. Repository Setup

Open PowerShell and navigate to the backend directory:
```powershell
cd backend
```

### 2. Environment Configuration

Copy the template or create `.env`:
```powershell
Copy-Item .env.example .env
```

To generate a secure 32-byte hex key in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install Dependencies

```powershell
npm.cmd install
```

### 4. Run Test Suite (100% In-Memory, Never Touches Remote DB)

```powershell
npm.cmd test
```

### 5. Run AI Accuracy Evaluation Harness (PRD §7.7 Quality Gates)

Run offline deterministic evaluation on golden seeds (split into tuning & holdout):
```powershell
npm.cmd run eval
```

Run online evaluation with live Gemini model:
```powershell
npm.cmd run eval:llm
```

### 6. Verify Types & Security Audit

```powershell
npm.cmd run lint
npm.cmd audit
```

### 7. Seed Admin Account

```powershell
$env:ADMIN_PASSWORD="YourSecureAdminPassword123!"
npm.cmd run seed:admin
```

### 8. Start Development Server

```powershell
npm.cmd run dev
```

---

## Postman Collection & Environment

Ready-to-import Postman assets covering all 60 endpoints with automatic bearer auth:
- **Collection**: `backend/postman/leadnivesh.postman_collection.json`
- **Environment**: `backend/postman/leadnivesh.postman_environment.json`

Import both files into Postman and set `baseUrl` to `http://localhost:5000/api/v1`.

---

## Complete API Route Inventory (60 Distinct Endpoints)

| # | Module | Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|---|---|
| 1 | **Health** | `GET` | `/health` | Public | 100/min | Liveness probe |
| 2 | **Health** | `GET` | `/ready` | Public | 100/min | Database readiness check |
| 3 | **Base** | `GET` | `/api/v1` | Public | 100/min | Base API info & version |
| 4 | **Auth** | `POST` | `/api/v1/auth/register` | Public | 10/min | Register broker account & set HttpOnly cookie |
| 5 | **Auth** | `POST` | `/api/v1/auth/login` | Public | 10/min | Login with constant-time check & lockout |
| 6 | **Auth** | `POST` | `/api/v1/auth/refresh` | Cookie | 100/min | Refresh token rotation with 15s grace window |
| 7 | **Auth** | `POST` | `/api/v1/auth/logout` | Bearer | 100/min | Revoke active session & clear cookie |
| 8 | **Auth** | `POST` | `/api/v1/auth/forgot-password` | Public | 10/min | Request single-use password reset link |
| 9 | **Auth** | `POST` | `/api/v1/auth/reset-password` | Public | 10/min | Reset password & revoke all sessions |
| 10 | **Auth** | `GET` | `/api/v1/auth/sessions` | Bearer | 100/min | List active login sessions |
| 11 | **Auth** | `DELETE`| `/api/v1/auth/sessions/:id` | Bearer | 100/min | Revoke specific session (IDOR safe) |
| 12 | **Users** | `GET` | `/api/v1/users/me` | Bearer | 100/min | Broker profile and plan limits |
| 13 | **Users** | `PATCH`| `/api/v1/users/me` | Bearer | 100/min | Update profile and agency settings |
| 14 | **Users** | `POST` | `/api/v1/users/me/logo/sign` | Bearer | 100/min | Sign Cloudinary upload for agency logo |
| 15 | **Users** | `GET` | `/api/v1/users/me/export` | Bearer | 100/min | DPDP/GDPR compliant data export |
| 16 | **Users** | `DELETE`| `/api/v1/users/me` | Bearer | 100/min | Soft-delete, anonymize PII & free email |
| 17 | **Properties** | `POST` | `/api/v1/properties` | Bearer | 100/min | Create property listing with planGuard check |
| 18 | **Properties** | `GET` | `/api/v1/properties` | Bearer | 100/min | List properties (Owner Vault strictly omitted) |
| 19 | **Properties** | `GET` | `/api/v1/properties/:id` | Bearer | 100/min | Property detail (Owner Vault explicitly loaded) |
| 20 | **Properties** | `PATCH`| `/api/v1/properties/:id` | Bearer | 100/min | Update property |
| 21 | **Properties** | `PATCH`| `/api/v1/properties/:id/status`| Bearer | 100/min | Change listing status (`available`, `hold`, `sold`) |
| 22 | **Properties** | `DELETE`| `/api/v1/properties/:id` | Bearer | 100/min | Soft-delete property (moves to Trash) |
| 23 | **Properties** | `POST` | `/api/v1/properties/photos/sign`| Bearer | 100/min | Sign Cloudinary photo upload |
| 24 | **Properties** | `DELETE`| `/api/v1/properties/:id/photos/{*publicId}`| Bearer | 100/min | Delete photo scoped to user folder |
| 25 | **Properties** | `GET` | `/api/v1/properties/:id/matches`| Bearer | 100/min | Ranked matching buyers for property |
| 26 | **Properties** | `POST` | `/api/v1/properties/:id/share` | Bearer | 100/min | Generate 30-day public share link |
| 27 | **Buyers** | `POST` | `/api/v1/buyers` | Bearer | 100/min | Create buyer requirement with planGuard check |
| 28 | **Buyers** | `GET` | `/api/v1/buyers` | Bearer | 100/min | List active buyers |
| 29 | **Buyers** | `GET` | `/api/v1/buyers/:id` | Bearer | 100/min | Buyer detail |
| 30 | **Buyers** | `PATCH`| `/api/v1/buyers/:id` | Bearer | 100/min | Update buyer criteria |
| 31 | **Buyers** | `PATCH`| `/api/v1/buyers/:id/status` | Bearer | 100/min | Update buyer status (`active`, `paused`, `closed`) |
| 32 | **Buyers** | `DELETE`| `/api/v1/buyers/:id` | Bearer | 100/min | Soft-delete buyer (moves to Trash) |
| 33 | **Buyers** | `GET` | `/api/v1/buyers/:id/matches` | Bearer | 100/min | Ranked matching properties for buyer |
| 34 | **Matches** | `POST` | `/api/v1/matches/quick` | Bearer | 60/min | Quick compatibility evaluation with reason code & text |
| 35 | **Deals** | `POST` | `/api/v1/deals` | Bearer | 100/min | Create deal with server-computed commission |
| 36 | **Deals** | `GET` | `/api/v1/deals` | Bearer | 100/min | List active deals |
| 37 | **Deals** | `GET` | `/api/v1/deals/summary` | Bearer | 100/min | Pipeline financial summary |
| 38 | **Deals** | `GET` | `/api/v1/deals/:id` | Bearer | 100/min | Deal detail and payment records |
| 39 | **Deals** | `PATCH`| `/api/v1/deals/:id/stage` | Bearer | 100/min | Advance deal stage with override support |
| 40 | **Deals** | `POST` | `/api/v1/deals/:id/payments` | Bearer | 100/min | Record payment with overpayment detection |
| 41 | **Deals** | `DELETE`| `/api/v1/deals/:id` | Bearer | 100/min | Soft delete deal (moves to Trash) |
| 42 | **Aliases** | `POST` | `/api/v1/aliases` | Bearer | 100/min | Create custom locality alias |
| 43 | **Aliases** | `GET` | `/api/v1/aliases` | Bearer | 100/min | List system and user locality aliases |
| 44 | **Aliases** | `DELETE`| `/api/v1/aliases/:id` | Bearer | 100/min | Delete locality alias |
| 45 | **Dashboard** | `GET` | `/api/v1/dashboard` | Bearer | 100/min | Daily broker cockpit |
| 46 | **AI Parse** | `POST` | `/api/v1/parse` | Bearer | 20/min | Parse WhatsApp message into normalized preview |
| 47 | **AI Parse** | `POST` | `/api/v1/parse/commit` | Bearer | 100/min | Atomic transaction committing parsed entity |
| 48 | **Shares** | `DELETE`| `/api/v1/shares/:id` | Bearer | 100/min | Revoke share link (invalidates flyer to 410) |
| 49 | **Inquiries** | `GET` | `/api/v1/inquiries` | Bearer | 100/min | Broker lists inquiries received on their listings |
| 50 | **Trash** | `GET` | `/api/v1/trash` | Bearer | 100/min | List trashed items (type, title, daysLeft) |
| 51 | **Trash** | `POST` | `/api/v1/trash/:type/:id/restore` | Bearer | 100/min | Restore item (plan-limit checked; share links return 410) |
| 52 | **Trash** | `DELETE`| `/api/v1/trash/:type/:id` | Bearer | 100/min | Permanent delete (requires confirmText; deletes Cloudinary) |
| 53 | **Public Flyer**| `GET` | `/p/:token` | Public | 30/min | Server-rendered HTML flyer with OG tags & noindex |
| 54 | **Public Inquiries** | `POST` | `/api/v1/public/inquiries` | Public | 10/min | Submit buyer inquiry with honeypot trap |
| 55 | **Public Contact** | `POST` | `/api/v1/public/contact` | Public | 30/min | Landing page lead to founder |
| 56 | **Admin** | `GET` | `/api/v1/admin/users` | Admin | 100/min | List brokers with plan tiers |
| 57 | **Admin** | `PATCH`| `/api/v1/admin/users/:id/plan` | Admin | 100/min | Upgrade/change broker plan tier (audit logged) |
| 58 | **Admin** | `GET` | `/api/v1/admin/usage` | Admin | 100/min | Platform usage metrics aggregation |
| 59 | **Admin** | `GET` | `/api/v1/admin/inquiries` | Admin | 100/min | List client inquiries across platform |
| 60 | **Admin** | `GET` | `/api/v1/admin/contacts` | Admin | 100/min | List founder contact leads |
