# LeadNivesh Backend API Specification

Comprehensive documentation for all 60 endpoints implemented across LeadNivesh Backend v1.1.

**Base URLs**:
- API Endpoints: `http://localhost:5000/api/v1`
- Public Pages: `http://localhost:5000`

---

## Complete Route Inventory (60 Total Routes)

| # | Method | Path | Auth / Role | Description |
|---|--------|------|-------------|-------------|
| 1 | `GET` | `/health` | Public | Liveness probe |
| 2 | `GET` | `/ready` | Public | Readiness probe (DB connectivity) |
| 3 | `GET` | `/p/:token` | Public (30/min) | Server-rendered public property flyer (OG tags, noindex) |
| 4 | `GET` | `/api/v1` | Public | API Root Status & Version |
| 5 | `POST` | `/api/v1/auth/register` | Public (10/min) | Broker registration with consent |
| 6 | `POST` | `/api/v1/auth/login` | Public (10/min) | Authenticate user & issue tokens |
| 7 | `POST` | `/api/v1/auth/refresh` | Cookie | Rotate refresh token with grace window |
| 8 | `POST` | `/api/v1/auth/logout` | Cookie | Revoke session & clear cookies |
| 9 | `POST` | `/api/v1/auth/forgot-password` | Public (10/min) | Request password reset token (SHA-256 hashed in DB) |
| 10 | `POST` | `/api/v1/auth/reset-password` | Public (10/min) | Set new password & revoke all active sessions |
| 11 | `GET` | `/api/v1/auth/sessions` | Bearer JWT | List active login sessions |
| 12 | `DELETE` | `/api/v1/auth/sessions/:id` | Bearer JWT | Revoke specific session (IDOR safe) |
| 13 | `GET` | `/api/v1/users/me` | Bearer JWT | Profile, agency branding, & plan limits |
| 14 | `PATCH` | `/api/v1/users/me` | Bearer JWT | Update agency details & preferences |
| 15 | `GET` | `/api/v1/users/me/export` | Bearer JWT | GDPR / DPDP full account data export |
| 16 | `DELETE` | `/api/v1/users/me` | Bearer JWT | Soft-delete with immediate PII anonymization |
| 17 | `POST` | `/api/v1/users/me/logo/sign` | Bearer JWT | Direct Cloudinary upload signature for agency logo |
| 18 | `POST` | `/api/v1/properties` | Bearer JWT | Quick add property listing (plan-guarded) |
| 19 | `GET` | `/api/v1/properties` | Bearer JWT | List active properties (excludes owner vault) |
| 20 | `POST` | `/api/v1/properties/photos/sign`| Bearer JWT | Direct Cloudinary upload signature for photos |
| 21 | `GET` | `/api/v1/properties/:id` | Bearer JWT | Single property details (includes owner vault) |
| 22 | `PATCH` | `/api/v1/properties/:id` | Bearer JWT | Update property details |
| 23 | `PATCH` | `/api/v1/properties/:id/status` | Bearer JWT | Update status (`available`, `hold`, `sold`) |
| 24 | `POST` | `/api/v1/properties/:id/share` | Bearer JWT | Generate public share flyer link |
| 25 | `DELETE` | `/api/v1/properties/:id/photos/{*publicId}` | Bearer JWT | Delete photo from property & Cloudinary |
| 26 | `DELETE` | `/api/v1/properties/:id` | Bearer JWT | Soft delete property listing (moves to Trash) |
| 27 | `GET` | `/api/v1/properties/:id/matches` | Bearer JWT | Ranked matching buyers for listing |
| 28 | `POST` | `/api/v1/buyers` | Bearer JWT | Quick add buyer requirement (plan-guarded) |
| 29 | `GET` | `/api/v1/buyers` | Bearer JWT | List active buyers |
| 30 | `GET` | `/api/v1/buyers/:id` | Bearer JWT | Single buyer details |
| 31 | `PATCH` | `/api/v1/buyers/:id` | Bearer JWT | Update buyer requirement |
| 32 | `PATCH` | `/api/v1/buyers/:id/status` | Bearer JWT | Update buyer status (`active`, `paused`, `closed`) |
| 33 | `DELETE` | `/api/v1/buyers/:id` | Bearer JWT | Soft delete buyer (moves to Trash) |
| 34 | `GET` | `/api/v1/buyers/:id/matches` | Bearer JWT | Ranked matching properties for buyer |
| 35 | `POST` | `/api/v1/matches/quick` | Bearer JWT (60/min)| Ad-hoc match evaluation with explanation text |
| 36 | `POST` | `/api/v1/deals` | Bearer JWT | Create deal pipeline item |
| 37 | `GET` | `/api/v1/deals` | Bearer JWT | List deals |
| 38 | `GET` | `/api/v1/deals/summary` | Bearer JWT | Revenue pipeline breakdown & counts |
| 39 | `GET` | `/api/v1/deals/:id` | Bearer JWT | Single deal with payment history |
| 40 | `PATCH` | `/api/v1/deals/:id/stage` | Bearer JWT | Transition stage (with manual override) |
| 41 | `POST` | `/api/v1/deals/:id/payments` | Bearer JWT | Record payment installment |
| 42 | `DELETE` | `/api/v1/deals/:id` | Bearer JWT | Soft delete deal (moves to Trash) |
| 43 | `POST` | `/api/v1/aliases` | Bearer JWT | Register custom locality alias |
| 44 | `GET` | `/api/v1/aliases` | Bearer JWT | List active locality aliases |
| 45 | `DELETE` | `/api/v1/aliases/:id` | Bearer JWT | Delete locality alias |
| 46 | `GET` | `/api/v1/dashboard` | Bearer JWT | Aggregated broker KPI summary |
| 47 | `POST` | `/api/v1/parse` | Bearer JWT (20/min)| Preview parsed WhatsApp message with AI/Regex |
| 48 | `POST` | `/api/v1/parse/commit` | Bearer JWT | Transactional commit of parsed listing/buyer |
| 49 | `DELETE` | `/api/v1/shares/:id` | Bearer JWT | Revoke property share link |
| 50 | `GET` | `/api/v1/inquiries` | Bearer JWT | Broker lists inquiries received on their listings |
| 51 | `GET` | `/api/v1/trash` | Bearer JWT | List trashed items (type, title, daysLeft) |
| 52 | `POST` | `/api/v1/trash/:type/:id/restore` | Bearer JWT | Restore item (plan-limit checked; share links return 410) |
| 53 | `DELETE` | `/api/v1/trash/:type/:id` | Bearer JWT | Permanent delete (requires confirmText; deletes Cloudinary) |
| 54 | `POST` | `/api/v1/public/inquiries` | Public (10/min) | Submit flyer inquiry (honeypot + IP hash) |
| 55 | `POST` | `/api/v1/public/contact` | Public (30/min) | Landing page lead to founder (honeypot + E.164) |
| 56 | `GET` | `/api/v1/admin/users` | Admin JWT | List all registered broker accounts |
| 57 | `PATCH` | `/api/v1/admin/users/:id/plan` | Admin JWT | Upgrade / set broker subscription plan |
| 58 | `GET` | `/api/v1/admin/usage` | Admin JWT | Platform usage aggregations |
| 59 | `GET` | `/api/v1/admin/inquiries` | Admin JWT | List all platform property inquiries |
| 60 | `GET` | `/api/v1/admin/contacts` | Admin JWT | List all founder contact leads |

---

## Detailed Specifications for New Endpoints (Backend v1.1)

### Password Reset

#### `POST /api/v1/auth/forgot-password`
- **Description**: Generates single-use 32-byte crypto token, hashes with SHA-256 in DB with 30-min expiry, sends email via Nodemailer. Returns generic message to prevent email enumeration.
- **Auth**: Public (Rate limited: 10 req/min)
- **Request Body**:
  ```json
  {
    "email": "broker@leadnivesh.com"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "If that email exists in our system, a password reset link has been sent."
    }
  }
  ```

#### `POST /api/v1/auth/reset-password`
- **Description**: Validates reset token, verifies expiry, validates 8-72 byte password schema, updates password hash with bcrypt cost 12, clears token fields, and **revokes all active sessions** across all devices.
- **Auth**: Public (Rate limited: 10 req/min)
- **Request Body**:
  ```json
  {
    "token": "32_byte_hex_token_from_email",
    "newPassword": "NewStrongPassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "Password has been reset successfully. Please log in with your new password."
    }
  }
  ```

---

### Trash Vault (`/api/v1/trash`)

#### `GET /api/v1/trash`
- **Description**: Lists soft-deleted items across properties, buyers, and deals. Excluded from matches, active lists, and counts.
- **Auth**: Bearer JWT
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": [
      {
        "type": "property",
        "id": "64a1b2c3d4e5f6a7b8c9d0e2",
        "title": "200 Gaj Plot in Sector 12",
        "deletedAt": "2026-11-11T10:00:00.000Z",
        "daysLeft": 28
      }
    ]
  }
  ```

#### `POST /api/v1/trash/:type/:id/restore`
- **Description**: Restores soft-deleted property, buyer, or deal.
  - Checks broker's subscription plan limits before restoring. Returns `402 PLAN_LIMIT_REACHED` if limits are exceeded.
  - Previous share links associated with the property return `410 Gone` and are **NOT** reactivated on restore.
- **Auth**: Bearer JWT
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "Property restored successfully",
      "id": "64a1b2c3d4e5f6a7b8c9d0e2",
      "type": "property"
    }
  }
  ```

#### `DELETE /api/v1/trash/:type/:id`
- **Description**: Permanently purges an item from trash.
  - Requires strict confirmation text `confirmText: "PERMANENT DELETE"`.
  - For properties: deletes all Cloudinary photo assets first, then removes DB document.
- **Auth**: Bearer JWT
- **Request Body**:
  ```json
  {
    "confirmText": "PERMANENT DELETE"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "Property permanently deleted"
    }
  }
  ```

---

### Broker Inquiries & Founder Leads

#### `GET /api/v1/inquiries`
- **Description**: Broker lists client inquiries submitted on their owned properties.
- **Auth**: Bearer JWT
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "64a1b2c3d4e5f6a7b8c9d0e3",
          "name": "Ramesh Gupta",
          "phoneE164": "+919812345678",
          "message": "Site visit this Sunday?",
          "createdAt": "2026-11-13T09:30:00.000Z"
        }
      ],
      "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
    }
  }
  ```

#### `POST /api/v1/public/contact`
- **Description**: Landing page contact form for prospective brokers reaching out to founder.
  - Anti-spam honeypot detection (`website`).
  - E.164 phone normalization and SHA-256 IP hashing.
- **Auth**: Public (Rate limited: 30 req/min)
- **Request Body**:
  ```json
  {
    "name": "Sanjay Bansal",
    "email": "sanjay@bansalproperties.com",
    "phone": "9812345678",
    "message": "Interested in deploying LeadNivesh for our 5-agent team in Panipat.",
    "city": "Panipat",
    "agencyName": "Bansal Properties"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "data": {
      "message": "Thank you for reaching out to LeadNivesh. We will get back to you shortly.",
      "id": "64a1b2c3d4e5f6a7b8c9d0e5"
    }
  }
  ```

#### `GET /api/v1/admin/contacts`
- **Description**: Administrator fetches inbound founder contact inquiries.
- **Auth**: Bearer JWT (Role: `admin`)
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "64a1b2c3d4e5f6a7b8c9d0e5",
          "name": "Sanjay Bansal",
          "email": "sanjay@bansalproperties.com",
          "phoneE164": "+919812345678",
          "message": "Interested in deploying LeadNivesh for our 5-agent team in Panipat.",
          "agencyName": "Bansal Properties",
          "city": "Panipat",
          "createdAt": "2026-11-13T09:45:00.000Z"
        }
      ],
      "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
    }
  }
  ```
