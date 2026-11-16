# LeadNivesh Backend API & Core Engine

> **High-Performance Real Estate CRM & Match Engine Backend for Brokers**  
> Built with **Node.js v26+**, **Express 5**, **TypeScript**, **Mongoose 9**, and **MongoDB Atlas**.

---

## 🚀 Quick Start (Day-1 Developer Setup)

Follow these steps to run the backend locally in under 3 minutes:

### 1. Prerequisites
* **Node.js**: `v20.x` or higher (Tested and running on Node `v26.0.0`)
* **Package Manager**: `npm`
* **Database**: MongoDB Atlas Cluster or local MongoDB instance

### 2. Installation
```bash
# Navigate to the backend directory
cd backend

# Install project dependencies
npm install
```

### 3. Environment Variables Configuration
Copy the sample environment file and adjust your variables:
```bash
cp .env.example .env
```
Key configuration entries in `.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@leadnivash.ghzdpa7.mongodb.net/
JWT_SECRET=leadnivesh_jwt_secret_dev_key_at_least_32_characters_long
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=leadnivesh_refresh_secret_dev_key_at_least_32_characters_long
REFRESH_TOKEN_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 4. Start the Development Server
```bash
npm run dev
```
* **Server Address:** `http://localhost:5000`
* **Liveness Probe:** `http://localhost:5000/health`
* **Database Probe:** `http://localhost:5000/ready`

---

## 🧪 Automated Testing & Database Verification Suite

The repository includes two automated test suites:

### 1. Multi-Scenario Full Lifecycle & Database Verification (105 Tests)
Runs every operational scenario across all 13 categories (Happy Path, Validation Errors, RBAC Defense, Discard vs Finalize, Soft-delete, Trash Restore, Permanent Eradication) and **directly verifies the MongoDB Atlas database state** after every mutation:

```bash
# Run the 105-scenario API + MongoDB Atlas verification suite
node scripts/verifyAllScenariosWithDb.js
```
**Expected Output:**
```
================================================================
🏁 VERIFICATION SUITE COMPLETE
   Total Scenarios Tested : 105
   Passed (API + DB)      : 105 (100%)
   Failed                 : 0
================================================================
```

### 2. Fast Endpoint Smoke Test Suite (48 Endpoints)
```bash
node scripts/testAllEndpoints.js
```

---

## 📡 Postman Integration & Cloud Sync

All **13 Category Collections** and the **Complete Master Suite** are synchronized in Postman Cloud under the **`Lead Nivash`** workspace.

### How to access in Postman:
1. Open your Postman Desktop client or [Postman Web](https://web.postman.co/).
2. Select the **`Lead Nivash`** workspace from the top workspace picker.
3. If collections do not appear immediately, press **`Ctrl + R`** (or **View ➔ Reload**) to pull the latest cloud changes.
4. You will find:
   - `LeadNivesh - 00 - Health & Probes`
   - `LeadNivesh - 01 - Authentication & Sessions`
   - `LeadNivesh - 02 - Properties`
   - `LeadNivesh - 03 - Buyers & Requirements`
   - `LeadNivesh - 04 - Match Engine`
   - `LeadNivesh - 05 - Deals & Commission`
   - `LeadNivesh - 06 - AI Parsing Engine (WhatsApp / Raw Text)`
   - `LeadNivesh - 07 - Dashboard`
   - `LeadNivesh - 08 - Locality Aliases`
   - `LeadNivesh - 09 - User Profile & Settings`
   - `LeadNivesh - 10 - Public Endpoints & Inquiries`
   - `LeadNivesh - 11 - Trash & Recovery`
   - `LeadNivesh - 12 - Admin Management`
   - `LeadNivesh API (Category-Wise Complete Suite)`

---

## 📚 Complete API Documentation & Status Codes

For the complete API reference, error catalog, request/response structures, and real-world multi-scenario state transitions (`discard`, `approve`, `change`, `restore`), please consult:

👉 **[Complete API Documentation (docs/API_DOCUMENTATION.md)](docs/API_DOCUMENTATION.md)**

---

## 🏗️ Architecture & Project Directory Structure

```
backend/
├── docs/
│   └── API_DOCUMENTATION.md    # Exhaustive API reference and lifecycle scenarios
├── scripts/
│   ├── testAllEndpoints.js     # 48-endpoint automated verification suite
│   ├── updatePostman.js        # Postman Cloud synchronization script
│   └── pushAllCategories.js    # 13 category collection generator & uploader
├── src/
│   ├── config/                 # Environment validation, database, and Redis connectors
│   ├── middleware/             # Rate limiters, JWT auth, Zod validation, Error handlers
│   ├── modules/
│   │   ├── admin/              # User plan management, system usage
│   │   ├── aliases/            # Vernacular locality normalization
│   │   ├── auth/               # Multi-session JWT & cookie authentication
│   │   ├── buyers/             # Buyer requirements & budget tracking
│   │   ├── contact/            # Public contact form inquiries
│   │   ├── dashboard/          # Aggregated broker daily summaries
│   │   ├── deals/              # Deal stages, commission tracking in paise
│   │   ├── inquiries/          # Public flyer buyer inquiries
│   │   ├── matches/            # Real-time Property ⇄ Buyer match engine
│   │   ├── parse/              # WhatsApp / SMS unstructured text parser
│   │   ├── properties/         # Property inventory & status state machine
│   │   ├── shares/             # Public web flyer generation (/p/:token)
│   │   ├── trash/              # Soft delete recovery & permanent eradication
│   │   └── users/              # Broker profile, logo upload, GDPR export
│   ├── app.ts                  # Express application configuration & router mounting
│   └── server.ts               # HTTP server entry point & graceful shutdown hooks
└── package.json
```

---

## 🔒 Security Best Practices Implemented
* **NoSQL Injection Defense:** Automatic sanitization via custom `mongoSanitize` middleware.
* **HTTP Hardening:** Standard Helmet security headers with tuned Content Security Policy (CSP).
* **Cross-Site Scripting (XSS) & CSRF:** Refresh tokens stored in `httpOnly`, `sameSite: 'lax'`, `secure` cookies.
* **Rate Limiting:** Distinct rate limit windows for Authentication (5/15m), Public forms (5/hr), and Broker API (100/15m).
* **Strict Schema Validation:** All inputs validated with Zod in `.strict()` mode to reject unauthorized payloads.
