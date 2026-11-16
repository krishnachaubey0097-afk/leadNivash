# LeadNivesh API Endpoint Contracts & Schema Reference

Base URL: `http://localhost:5000`  
API Prefix: `/api/v1`

---

### Category 00: Health & Platform Probes
- `GET /health` - Process liveness probe. Returns `{ success: true, status: "ok", uptime: <seconds> }`.
- `GET /ready` - MongoDB Atlas connection readiness. Returns `{ success: true, status: "ready", database: "connected" }`.
- `GET /api/v1` - API version and platform name.

### Category 01: Authentication & Sessions
- `POST /api/v1/auth/login` - Body: `{ email, password }`. Returns `{ accessToken, user }`.
- `POST /api/v1/auth/register` - Body: `{ name, email, password, phone, agency, consent }`.
- `POST /api/v1/auth/refresh` - Issues new access token via httpOnly refresh cookie.
- `POST /api/v1/auth/logout` - Revokes current refresh token session.
- `GET /api/v1/auth/sessions` - List active sessions for authenticated user.
- `DELETE /api/v1/auth/sessions/:id` - Revoke session by ID.

### Category 02: Properties (Listings)
- `POST /api/v1/properties` - Create property. Body requires `title`, `type`, `purpose`, `locality`, `city`, `size: { value, unit }`, `priceDemandPaise`, `status`.
- `GET /api/v1/properties` - List properties with filters (`city`, `locality`, `status`, `minPrice`, `maxPrice`, `page`, `limit`).
- `GET /api/v1/properties/:id` - Get property by ID.
- `PATCH /api/v1/properties/:id` - Update property fields.
- `PATCH /api/v1/properties/:id/status` - Update status (`available`, `hold`, `sold`, `rented`).
- `POST /api/v1/properties/:id/share` - Body: `{ template: "flyer" }`. Returns `{ token, url }`.
- `GET /api/v1/properties/:id/matches` - Returns ranked matching buyers for this property.
- `DELETE /api/v1/properties/:id` - Moves property to trash (soft delete).

### Category 03: Buyers & Requirements
- `POST /api/v1/buyers` - Create buyer. Body requires `name`, `phone`, `localities: [{ display, key }]`, `types`, `budget: { minPaise, maxPaise }`, `urgency`.
- `GET /api/v1/buyers` - List buyers with filters (`urgency`, `status`, `page`, `limit`).
- `GET /api/v1/buyers/:id` - Get buyer details.
- `PATCH /api/v1/buyers/:id` - Update buyer criteria.
- `GET /api/v1/buyers/:id/matches` - Returns ranked matching properties for this buyer.
- `DELETE /api/v1/buyers/:id` - Moves buyer to trash (soft delete).

### Category 04: Match Engine
- `POST /api/v1/matches/quick` - Ad-hoc AI scoring. Evaluates property `{ type, purpose, localityKey, priceDemandPaise, sizeGaj }` against buyer `{ purpose, types, localities, budget, sizeGaj }` with `tolerancePct`.

### Category 05: Deals & Commission
- `POST /api/v1/deals` - Create deal. Body: `{ buyerId, propertyId, propertyTitleSnapshot, valuePaise, commission: { mode, bps }, stage }`.
- `GET /api/v1/deals` - List broker deals.
- `GET /api/v1/deals/summary` - Pipeline breakdown (counts and commission amounts per stage).
- `PATCH /api/v1/deals/:id/stage` - Update stage (`interested`, `shown`, `negotiating`, `finalized`, `paid`, `lost`).
- `POST /api/v1/deals/:id/payments` - Record commission advance: `{ amountPaise, note, receivedAt }`.

### Category 06: AI Parsing Engine
- `POST /api/v1/parse` - Parse unstructured Hindi/English/Hinglish WhatsApp message into property or buyer schema.
- `POST /api/v1/parse/commit` - Commit parsed entity into database.

### Category 07: Broker Dashboard
- `GET /api/v1/dashboard/today` - Metrics overview (active listings, hot buyers, follow-ups due today, pending commission).

### Category 08: Locality Aliases
- `GET /api/v1/aliases` - List aliases for a city.
- `POST /api/v1/aliases` - Create custom alias: `{ city, canonical, aliases: [] }`.
- `DELETE /api/v1/aliases/:id` - Delete alias.

### Category 09: User Profile & Agency
- `GET /api/v1/users/me` - Profile, agency, plan limits.
- `PATCH /api/v1/users/me` - Update agency branding, RERA number, preferences.
- `POST /api/v1/users/me/logo/sign` - Cloudinary upload signature for agency logo.
- `GET /api/v1/users/me/export` - GDPR/compliance data export.

### Category 10: Public Pages & Inquiries
- `GET /p/:token` - Public mobile-friendly property flyer HTML page.
- `POST /api/v1/public/inquiries` - Submit buyer lead from flyer: `{ propertyId, name, phone, message }`.
- `GET /api/v1/inquiries` - Protected: broker view of incoming leads.
- `POST /api/v1/public/contact` - Public platform landing page contact lead.

### Category 11: Trash & Recovery
- `GET /api/v1/trash` - List soft-deleted properties, buyers, and deals.
- `POST /api/v1/trash/:type/:id/restore` - Restore deleted item.
- `DELETE /api/v1/trash/:type/:id` - Permanently purge from database.

### Category 12: SuperAdmin Management
- `GET /api/v1/admin/users` - List all registered brokers.
- `PATCH /api/v1/admin/users/:id/plan` - Change plan tier (`trial`, `pro`).
- `GET /api/v1/admin/usage` - Platform API telemetry & resource consumption.
- `GET /api/v1/admin/inquiries` - Platform-wide inquiry logs.
- `GET /api/v1/admin/contacts` - Platform-wide contact requests.
