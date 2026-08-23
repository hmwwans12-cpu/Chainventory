# PRD — Blockchain Inventory Management System

**Status:** Draft for Review / Pre-Freeze
**Version:** 2.0
**Last Updated:** 2026-08-12
**Primary Network:** Base Sepolia Testnet
**Database:** Supabase PostgreSQL
**Authentication & Wallet:** Privy
**Frontend:** Next.js + TypeScript
**UI:** Tailwind CSS + shadcn/ui

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Goals](#2-goals)
3. [Non-Goals / Out of Scope](#3-non-goals--out-of-scope)
4. [Users & Roles](#4-users--roles)
5. [Authentication & Onboarding](#5-authentication--onboarding)
6. [Warehouse Creation](#6-warehouse-creation)
7. [Deployment Authorization](#7-deployment-authorization)
8. [Smart Contract / Factory Rules](#8-smart-contract--factory-rules)
9. [Warehouse Joining](#9-warehouse-joining)
10. [RBAC](#10-rbac)
11. [Inventory](#11-inventory)
12. [Stock Operations](#12-stock-operations)
13. [Realtime](#13-realtime)
14. [Transactions](#14-transactions)
15. [Blockchain Processing](#15-blockchain-processing)
16. [Hashing & Canonicalization](#16-hashing--canonicalization)
17. [Faucet / Gas Sponsorship](#17-faucet--gas-sponsorship)
18. [Treasury](#18-treasury)
19. [Ownership](#19-ownership)
20. [Warehouse Lifecycle](#20-warehouse-lifecycle)
21. [Notifications](#21-notifications)
22. [Audit Log](#22-audit-log)
23. [Export](#23-export)
24. [Dashboard](#24-dashboard)
25. [Developer Console](#25-developer-console)
26. [Search / Command Palette](#26-search--command-palette)
27. [UI/UX](#27-uiux)
28. [Responsive & Accessibility](#28-responsive--accessibility)
29. [Database](#29-database)
30. [Data Security](#30-data-security)
31. [Rate Limiting & Abuse Prevention](#31-rate-limiting--abuse-prevention)
32. [Idempotency](#32-idempotency)
33. [Race Conditions](#33-race-conditions)
34. [SEO](#34-seo)
35. [Failure Handling](#35-failure-handling)
36. [Blockchain / Database Consistency](#36-blockchain--database-consistency)
37. [Security / Architecture Invariants](#37-security--architecture-invariants)
38. [Deployment Security](#38-deployment-security)
39. [Performance](#39-performance)
40. [Observability](#40-observability)
41. [Public Landing Page](#41-public-landing-page)
42. [Onboarding](#42-onboarding)
43. [UX Principles](#43-ux-principles)
44. [High-Risk Actions](#44-high-risk-actions)
45. [Data Integrity Rules](#45-data-integrity-rules)
46. [Change Management](#46-change-management)
47. [Documentation Roadmap](#47-documentation-roadmap)
48. [Final Product Invariants](#48-final-product-invariants)
49. [Acceptance Baseline](#49-acceptance-baseline)
50. [PRD Status](#50-prd-status)

---

## 1. Product Overview

A responsive web-based Inventory Management System with multi-user warehouse management, RBAC, blockchain validation/proof, smart-contract authorization, Privy authentication/embedded wallets, Supabase PostgreSQL, Supabase Realtime, and Base Sepolia.

The product should feel like a normal modern SaaS application first and a blockchain application second. Blockchain should add trust, proof, and authorization without making normal inventory workflows unnecessarily complicated.

Exact libraries, worker mechanism, RPC fallback providers, deployment details, and implementation choices belong in `TECHSTACK.md` and `ARSITEKTUR.md`.

---

## 2. Goals

### 2.1 Primary

1. Reliable warehouse inventory management.
2. Multiple users can operate on one warehouse concurrently.
3. Inventory remains consistent under concurrent Stock In/Out.
4. Role-Based Access Control.
5. Critical authorization is enforced both off-chain and on-chain where applicable.
6. Automatic warehouse smart-contract deployment.
7. User wallet remains warehouse owner.
8. Treasury sponsors deployment gas.
9. Blockchain proof for relevant operations.
10. Real-time updates.
11. Immutable audit history.
12. Understandable blockchain UX for non-crypto users.
13. Responsive desktop/tablet/mobile experience.
14. Initial compatibility with free/testnet infrastructure.

### 2.2 Secondary

- Developer operational console.
- Treasury/faucet monitoring.
- Export.
- Inventory analytics/charts.
- Onboarding.
- SEO-ready public pages.
- Future scalability without premature infrastructure over-engineering.

---

## 3. Non-Goals / Out of Scope

Initial version does not require:

- Product purchase price tracking.
- Supplier management.
- Maximum stock limits.
- Paid mainnet deployment.
- Fiat/payment processing.
- Multiple active warehouses owned by one user.
- Full ERP/accounting.
- Advanced procurement.
- AI forecasting.
- PDF reporting as a core export format.

---

## 4. Users & Roles

### 4.1 OWNER

Warehouse creator/owner.

Can manage warehouse, members, inventory, settings, approvals, exports, audit/proof, ownership transfer, and permitted lifecycle actions.

### 4.2 MANAGER

Operational management role.

**Can:**

- Manage operational inventory.
- Perform Stock In/Out.
- Approve join requests.
- Assign `STAFF`, `AUDITOR`, or `VIEWER`.
- Access operational reports/transactions.

**Cannot:**

- Assign `OWNER` or `MANAGER`.
- Transfer ownership.
- Perform ownership recovery.
- Manage treasury/developer configuration.
- Override smart-contract authorization.

### 4.3 STAFF

Operational inventory role.

Can perform permitted product and inventory operations, Stock In/Out, view movements/transactions, and limited operational exports.

### 4.4 AUDITOR

Read/audit role.

Can view inventory, movements, transactions, audit logs, blockchain proof metadata, and permitted exports.

### 4.5 VIEWER

Read-only warehouse role.

---

## 5. Authentication & Onboarding

### 5.1 Public Entry

Landing page navigation:

- About
- Features
- FAQ
- Sign Up
- Login

### 5.2 Authentication Flow

```text
Landing
  ↓
Warehouse Code / Invite Link
  ↓
Privy Authentication
  ↓
Existing user?
  ├─ Yes → Continue
  └─ No  → Signup
```

Privy may provide:

- Embedded wallet.
- External wallet.
- Google.
- Supported social login providers.

### 5.3 Signup

First-time user provides:

- Name.
- Gender.
- Optional email.

Then:

```text
Signup
  ↓
Onboarding
  ↓
Create Warehouse OR Join Warehouse
```

### 5.4 Session Security

Prefer secure server-side sessions/cookies for browser authentication rather than exposing long-lived credentials to client-side JavaScript.

If access/refresh tokens are used, they must follow secure storage, expiry, rotation, and revocation practices.

---

## 6. Warehouse Creation

### 6.1 Ownership Rule

One user = one active warehouse.

The creator automatically receives `OWNER`.

### 6.2 Create Warehouse

Fields may include:

- Warehouse name.
- Company/PT name.
- Warehouse type.
- Other relevant metadata.

Warehouse code is automatically generated and must be unique and non-predictable.

### 6.3 Contract Deployment

Creating a warehouse automatically initiates smart-contract deployment.

Treasury pays deployment gas.

Treasury is never the warehouse owner. The user's wallet remains owner.

### 6.4 Deployment Flow

```text
User
 ↓
Create Warehouse
 ↓
Backend validation
 ↓
Read deploymentNonce from Factory
 ↓
Build EIP-712 authorization
 ↓
User signs with Privy wallet
 ↓
Backend verifies signature
 ↓
Treasury submits deployment
 ↓
Factory validates
 ↓
Warehouse contract deployed
 ↓
Contract address recorded
 ↓
Warehouse becomes active
```

Blockchain confirmation is asynchronous and must not block the initial API request.

---

## 7. Deployment Authorization

### 7.1 EIP-712

Warehouse deployment authorization MUST use EIP-712 typed-data signatures.

Plain `personal_sign` is not used for deployment authorization.

### 7.2 Domain

EIP-712 domain binds the authorization to:

- Name.
- Version.
- Chain ID.
- Factory contract (`verifyingContract`).

### 7.3 Payload

At minimum:

- `owner`
- `warehouseCodeHash`
- `deploymentNonce`
- `expiry`

### 7.4 Deployment Nonce

`deploymentNonce` is the on-chain replay-protection nonce owned by the Factory.

Backend MUST:

1. Read the current nonce from Factory.
2. Build typed data.
3. Ask the user to sign.
4. Verify the signature.
5. Submit deployment.

Backend must never guess this nonce from database state.

### 7.5 Idempotency Key vs Deployment Nonce

These are different mechanisms.

|             | `idempotencyKey`              | `deploymentNonce`           |
| ----------- | ----------------------------- | --------------------------- |
| Purpose     | General request deduplication | EIP-712 replay protection   |
| Storage     | Database                      | On-chain (Factory contract) |
| Default TTL | 24 hours                      | Consumed/advanced on-chain  |

They must never be implemented as one field/mechanism.

---

## 8. Smart Contract / Factory Rules

Factory is responsible for:

- Warehouse contract deployment.
- Deployment authorization validation.
- Deployment nonce management.
- One-active-warehouse-per-owner enforcement.

**On-chain one-warehouse rule**

Factory MUST enforce one active warehouse per owner on-chain.

If owner already has an active warehouse, deployment must revert.

**Replay protection**

Factory validates EIP-712 authorization, nonce, expiry, chain ID, and verifying contract.

---

## 9. Warehouse Joining

Users can join via:

- Warehouse code.
- Invite/referral link.

### 9.1 Join Request

Requester does not select their final role.

Initial state:

```text
status = PENDING
role = NULL
```

### 9.2 Approval Matrix

| Approver | Can assign                      |
| -------- | ------------------------------- |
| OWNER    | MANAGER, STAFF, AUDITOR, VIEWER |
| MANAGER  | STAFF, AUDITOR, VIEWER          |

`OWNER` cannot be assigned through normal join requests.

Rejected requests are recorded in audit history where applicable.

---

## 10. RBAC

Authorization is enforced in multiple layers:

```text
Application authorization
        +
Supabase/PostgreSQL RLS
        +
Smart-contract authorization where applicable
```

Database role checks must not be the only security boundary for blockchain-sensitive operations.

---

## 11. Inventory

### 11.1 Product Data

May include:

- Product name.
- SKU.
- Category.
- Unit.
- Current stock.
- Metadata.
- Created/updated timestamps.

Purchase price, supplier, and maximum stock are out of scope.

### 11.2 Product Operations

Authorized users may:

- Add.
- Edit.
- View.
- Archive/delete where permitted.
- Bulk import.

### 11.3 Bulk Import

```text
Upload CSV/XLSX
  ↓
Parse
  ↓
Validate
  ↓
Preview
  ↓
Show valid/invalid rows
  ↓
Confirm
  ↓
Import
```

Invalid rows must not silently enter the database.

---

## 12. Stock Operations

**Stock In**

Authorized operational users, including STAFF, can perform Stock In without normal Manager approval.

**Stock Out**

Authorized operational users can perform Stock Out.

**Stock Movement**

Every stock-changing operation creates a movement record.

**Atomicity**

Stock updates MUST be atomic.

The system must prevent:

- Lost updates.
- Invalid negative stock.
- Duplicate processing.
- Partial stock updates.

**Concurrency**

Multiple users may modify inventory simultaneously.

Example:

```text
Stock = 100

A → Stock Out 80
B → Stock Out 50
```

The database must guarantee a valid final state. At least one operation must fail if stock is insufficient.

Supabase/PostgreSQL is the operational source of truth.

---

## 13. Realtime

Supabase Realtime is required.

Successful changes should propagate to connected clients without manual refresh.

```text
User A
  ↓
Database
  ↓
Supabase Realtime
  ├─ User B
  ├─ Manager
  └─ Dashboard
```

Realtime does not replace database atomicity/concurrency control.

---

## 14. Transactions

Supported states may include:

```text
PENDING
SUBMITTED
CONFIRMED
FAILED
RETRYING
```

**Transaction Approval**

Where explicitly configured, approval is represented as a separate workflow.

Normal Stock In/Out does not require Manager approval.

**Transaction Detail**

Show a readable timeline:

- Submitted.
- Database recorded.
- Blockchain submitted.
- Confirmed.
- Failed/retrying.
- Transaction hash.
- Blockchain proof.

**Blockchain Proof**

Users can open the relevant Base Sepolia/BaseScan transaction.

---

## 15. Blockchain Processing

Blockchain processing MUST be asynchronous.

```text
User Action
 ↓
Validation
 ↓
DB transaction
 ↓
Create blockchain job/state
 ↓
Return
 ↓
Worker/listener/poller
 ↓
Submit/monitor TX
 ↓
Update status
 ↓
Realtime notification
```

The exact worker/listener mechanism belongs in `ARSITEKTUR.md`.

**Failure**

System must distinguish:

- Inventory operation succeeded.
- Blockchain verification pending.
- Blockchain verification failed.

Retry must be controlled and idempotent.

**RPC**

Infura is the preferred initial RPC provider candidate for Base Sepolia.

Architecture MUST support fallback providers and must abstract RPC access from business logic.

---

## 16. Hashing & Canonicalization

Initial specification:

```text
RFC 8785 JCS
+
Keccak-256
```

Hashing is deterministic and versioned.

**Numeric values**

ALL numeric values inside hash payloads MUST be canonical decimal strings, not native JSON numbers.

Example:

```json
{
  "quantity": "100",
  "timestamp": "1754989200"
}
```

Not:

```json
{
  "quantity": 100,
  "timestamp": 1754989200
}
```

Rules:

- No scientific notation.
- No unnecessary leading zeros.
- Exact integer representation.
- Compatible with intended Solidity integer types.
- Use exact integer arithmetic such as `BigInt` where appropriate.

Initial version:

```text
hash_version = 1
canonicalization = RFC 8785 JCS
hash_algorithm = Keccak-256
```

Old hashes must never be silently reinterpreted after future version changes.

---

## 17. Faucet / Gas Sponsorship

**Faucet**

Developer treasury provides Base Sepolia ETH.

Limit: **0.001 ETH per user every 12 hours.**

**Anti-Abuse**

Use multiple controls:

- Authentication.
- Identity checks.
- Database constraints.
- Atomic transaction.
- Rate limiting.
- Idempotency where appropriate.
- Blockchain verification where applicable.

Sensitive treasury operations MUST NOT rely on an idempotency key alone.

**Treasury Security**

Treasury private keys must never be exposed to:

- Frontend.
- Browser storage.
- Client-side JS.
- Public repository.
- Normal database records.

---

## 18. Treasury

Treasury responsibilities:

- Warehouse contract deployment gas.
- Faucet distribution.
- Relevant Base Sepolia operational funding.

Treasury does not own user warehouses.

Developer Console must expose appropriate treasury monitoring without exposing private keys/secrets.

---

## 19. Ownership

**Transfer**

Ownership transfer is supported and requires explicit confirmation and appropriate wallet/blockchain authorization.

**Recovery**

Recovery may be provided for supported scenarios, but must not silently bypass smart-contract ownership rules.

Exact recovery mechanism belongs in architecture/security documentation.

---

## 20. Warehouse Lifecycle

Single source of truth:

```text
23 days → inactivity warning
27 days → critical warning
30 days → suspend/archive process
```

Users should receive appropriate warnings before suspension/archive.

Exact automation mechanism belongs in technical architecture.

---

## 21. Notifications

Notification bell with unread count is required.

Examples:

- Join request.
- Approval/rejection.
- Stock operation result.
- Transaction confirmation.
- Blockchain failure/retry.
- Ownership event.
- Warehouse inactivity.
- Faucet status.
- Security/system warning.

Notifications must not spam users. Equivalent repeated events should be grouped/deduplicated where appropriate.

---

## 22. Audit Log

Audit logs are append-only/immutable from normal user interfaces.

Records may contain:

- Actor.
- Action.
- Entity.
- Entity ID.
- Timestamp.
- Before state.
- After state.
- Warehouse.
- Wallet/address.
- Related transaction hash.
- Result/status.

Audit history must not be editable by normal users.

---

## 23. Export

Initial formats:

- CSV.
- XLSX.
- JSON where appropriate.

### 23.1 STAFF

Operational exports may include:

- Product name.
- SKU.
- Category.
- Unit.
- Current stock.
- Created/updated timestamps.
- Transaction ID.
- Type.
- Product.
- Quantity.
- Unit.
- Status.
- Created timestamp.

STAFF cannot export treasury data, developer internals, sensitive authorization metadata, credentials, secrets, or private keys.

### 23.2 AUDITOR

Can export:

- Inventory.
- Transactions.
- Stock movements.
- Audit logs.
- Blockchain proof metadata.

May include:

- Audit ID.
- Actor.
- Action.
- Entity.
- Timestamp.
- Before/after.
- Transaction hash.
- Blockchain status.

AUDITOR cannot export treasury secrets, developer secrets, private keys, or infrastructure credentials.

---

## 24. Dashboard

Dashboard should be informative without being overloaded.

**Core areas:**

- Inventory summary.
- Stock In chart.
- Stock Out chart.
- Recent transactions.
- Stock movement.
- Pending approvals.
- Notifications.
- Blockchain status/proof.
- Warehouse information.
- Quick actions.

**Profile/Wallet Card**

Clickable card showing:

- User name.
- Wallet address.
- Base Sepolia balance.
- Relevant account information.

**Charts**

At minimum:

- Stock In.
- Stock Out.

Potential additions:

- Inventory movement trends.
- Transaction activity.
- Product distribution.

---

## 25. Developer Console

Privileged developer interface with detailed operational information.

**System**

- API health.
- API latency.
- Error rate.
- Active sessions.
- Supabase status.
- Privy status.
- Realtime status.
- RPC status.

**Blockchain**

- Latest block.
- Pending TX.
- Failed TX.
- Confirmation time.
- Contract deployments.
- RPC health.
- Contract addresses.
- Transaction hashes.

**Treasury**

- Treasury balance.
- Faucet distribution.
- Deployment spending.
- Gas usage.
- Spending trends.
- Alerts.

Sensitive secrets/private keys must never be displayed.

---

## 26. Search / Command Palette

Global command/search interface.

Primary shortcut: **Ctrl/Cmd + K**

Commands may include:

- Inventory.
- Add Product.
- Stock In.
- Stock Out.
- Transactions.
- Members.
- Warehouse Settings.
- Blockchain.
- Audit Log.

Developer Console can expose additional operational search commands.

---

## 27. UI/UX

Initial direction:

- shadcn/ui-inspired design.
- Lucide/Phosphor/Tabler-style icons.
- Consistent spacing.
- Clear hierarchy.
- Minimal clutter.
- Responsive layouts.
- Smooth restrained animation.

**Toast**

Gooey Toast is the preferred toast reference.

Support success/warning/error/info states.

**Motion**

Use smooth, subtle motion. Support `prefers-reduced-motion`.

**Sidebar**

Must support collapse/expand.

Collapsed sidebar retains recognizable icons from a consistent icon system.

**Loading**

Use:

- Skeleton loading.
- Lazy loading.
- Progressive loading.

Avoid unnecessary full-page spinners.

**Empty/Error states**

Explain what happened and what the user can do next.

Example:

```text
Blockchain verification failed.

Your inventory operation was recorded,
but blockchain proof is currently unavailable.

[ Retry ]
[ View Details ]
```

---

## 28. Responsive & Accessibility

Must support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Accessibility requirements:

- Keyboard navigation.
- Visible focus.
- Screen-reader labels.
- Adequate contrast.
- Accessible form errors.
- ESC to close applicable overlays.
- Reduced motion.
- Icon + text for critical statuses.

Icons must not be the only carrier of critical information.

---

## 29. Database

**Primary Database**

Supabase PostgreSQL is the primary operational database and source of truth.

Initial version does NOT require a separate read replica.

Application architecture should separate read/write responsibilities sufficiently so future read replicas can be introduced without rewriting core business logic.

**Data Integrity**

Use:

- Foreign keys.
- Unique constraints.
- Check constraints.
- Transactions.
- Atomic updates.
- Concurrency controls.
- RLS.

**Query Security**

All dynamic queries MUST use parameterized/prepared/safe query mechanisms or Supabase query builder.

User input must never be concatenated into SQL.

**Indexing**

Indexes must be based on real query patterns, not blindly added.

Potential fields:

- `warehouse_id`
- `product_id`
- `user_id`
- `sku`
- `status`
- `created_at`
- Appropriate composite keys.

**Optimization**

Review:

- N+1 queries.
- Unnecessary joins.
- `SELECT *`.
- Unbounded queries.
- Duplicate queries.
- Large payloads.
- Missing indexes.
- Pagination.

**Pagination**

Use pagination for:

- Transactions.
- Audit logs.
- Products.
- Members.
- Developer logs.
- Blockchain transactions.

Cursor/keyset pagination should be preferred for large/high-growth datasets where appropriate.

**Caching**

Caching may be used for safe non-critical data.

Do not blindly cache:

- Current stock.
- Membership authorization.
- Pending blockchain state.
- Wallet balance.

---

## 30. Data Security

**Encryption**

Use platform/database encryption at rest where provided and TLS/HTTPS in transit.

**Passwords**

Passwords are not stored when authentication is delegated to Privy/social providers.

If password authentication is introduced later, use Argon2id/bcrypt hashing, not reversible encryption.

AES-256 may be used for applicable sensitive-data encryption but is not a password hashing method.

**Secrets**

Never expose:

- Supabase service-role keys.
- Treasury private keys.
- RPC secrets.
- API secrets.
- Signing credentials.

---

## 31. Rate Limiting & Abuse Prevention

Rate limiting is required for abuse-sensitive endpoints.

Higher-risk examples:

- Authentication.
- Faucet.
- Warehouse creation.
- Contract deployment.
- Sensitive transaction operations.

Rate limiting is defense-in-depth and not the only security control.

---

## 32. Idempotency

General retryable writes should use idempotency where appropriate.

**`idempotencyKey`:**

- Stored in database.
- Default TTL: 24 hours.
- Unique per relevant user/request scope.
- Allows safe duplicate-request handling.

Sensitive operations such as faucet, treasury, and deployment require:

```text
Idempotency
+
Atomic transaction
+
Database constraints
+
Rate limiting
+
On-chain validation where applicable
```

Idempotency key does not replace blockchain replay protection.

---

## 33. Race Conditions

Explicit protection is required for:

- Concurrent Stock In.
- Concurrent Stock Out.
- Faucet claims.
- Warehouse creation.
- Join approval.
- Ownership transfer.
- Contract deployment.
- Retry operations.

Database and smart contracts are concurrency boundaries where applicable.

Frontend state is never an authorization or consistency mechanism.

---

## 34. SEO

Public-facing pages must be SEO-ready from the beginning.

Support:

- Title.
- Meta description.
- Canonical URL.
- Open Graph.
- Social preview metadata.
- `robots.txt`.
- `sitemap.xml`.
- Structured data/schema.
- Semantic HTML.

Potential schema:

- Organization.
- SoftwareApplication.
- WebSite.
- FAQPage.

Authenticated pages such as Dashboard, Developer Console, Settings, and private warehouse pages should not be publicly indexed.

---

## 35. Failure Handling

Handle:

- Database failures.
- Realtime disconnects.
- Authentication failures.
- Privy failures.
- RPC failures.
- Blockchain failures.
- Contract deployment failures.
- Signature rejection.
- Expired EIP-712 authorization.
- Stale deployment nonce.
- Rate limits.
- Validation errors.
- Concurrent update conflicts.

Errors must be detected, logged, presented clearly, safely retried where applicable, and never silently ignored.

---

## 36. Blockchain / Database Consistency

Supabase is the operational source of truth.

Blockchain is the verification/proof and smart-contract authorization layer.

The system must support reconciliation between application and blockchain state.

Database success must not automatically be represented as blockchain confirmation.

---

## 37. Security / Architecture Invariants

**Invariant A — Ownership**

Treasury sponsors gas but does not own user warehouses.

**Invariant B — Authorization**

Database RBAC and smart-contract authorization must be consistent for blockchain-sensitive operations. Database is not the only security boundary.

**Invariant C — Numeric Hashing**

Numeric values in hashed payloads are canonical decimal strings before RFC 8785 JCS + Keccak-256.

**Invariant D — Deployment Authorization**

Warehouse deployment uses EIP-712.

Authorization includes:

- `deploymentNonce`
- `expiry`
- Chain ID
- Verifying Factory contract

`deploymentNonce` source of truth is the on-chain Factory.

`deploymentNonce` is different from `idempotencyKey`.

---

## 38. Deployment Security

Deployment must enforce:

- User identity verification.
- EIP-712 signature verification.
- On-chain deployment nonce.
- Expiry validation.
- Chain ID validation.
- Factory binding.
- One active warehouse per owner.
- Application-level idempotency.
- Rate limiting.
- Treasury spending protection.
- Asynchronous processing.
- Explicit deployment state tracking.

Factory MUST enforce one-active-warehouse-per-owner on-chain.

---

## 39. Performance

System should remain responsive under expected free/testnet conditions.

Requirements:

- No unnecessary blocking operations.
- No synchronous blockchain confirmation waits.
- Lazy loading for heavy components.
- Skeleton loading for delayed content.
- Pagination for large datasets.
- Query optimization.
- No N+1 queries.
- Realtime where appropriate.
- Safe caching.
- Reasonable client bundles.

Exact performance budgets belong in technical design.

---

## 40. Observability

Monitor/log:

- API errors.
- Authentication failures.
- Database errors.
- Realtime failures.
- Blockchain submission failures.
- Confirmation failures.
- RPC errors.
- Contract deployment failures.
- Treasury operations.
- Faucet claims.
- Rate-limit events.
- Security-sensitive actions.

Logs must never expose secrets or private keys.

---

## 41. Public Landing Page

Public site should introduce:

- What the system does.
- Features.
- Why blockchain is used.
- Inventory workflow.
- Security.
- Realtime capabilities.
- Blockchain proof.
- Non-crypto-friendly UX.

Navigation:

- About
- Features
- FAQ
- Sign Up
- Login

---

## 42. Onboarding

```text
Authentication
 ↓
Profile
 ↓
Create or Join Warehouse
 ↓
Warehouse setup / Join request
 ↓
Dashboard
```

Use empty states and contextual guidance rather than overwhelming documentation.

---

## 43. UX Principles

- Simple before complex.
- Explain blockchain in normal language.
- Never hide important security state.
- Do not make users wait unnecessarily for blockchain confirmation.
- Show meaningful operation status.
- Prevent destructive actions.
- Confirm irreversible/high-risk actions.
- Use realtime updates.
- Keep notifications informative.
- Provide recovery/retry paths.
- Make responsive behavior intentional.
- Maintain accessibility.

---

## 44. High-Risk Actions

Require explicit confirmation for:

- Warehouse archive.
- Warehouse deletion where supported.
- Ownership transfer.
- Member removal.
- Sensitive role changes.
- Blockchain-sensitive actions.

Ownership transfer requires explicit confirmation and wallet authorization.

---

## 45. Data Integrity Rules

Enforce:

- Unique warehouse code.
- Unique product SKU within appropriate warehouse scope.
- Valid membership.
- Valid role/status combinations.
- Valid stock quantities.
- No unintended negative stock.
- Valid transaction references.
- Valid blockchain state transitions.
- Unique idempotency keys where applicable.
- Valid deployment authorization.
- Valid deployment nonce.
- One active warehouse per owner.

---

## 46. Change Management

After approval/freeze:

- Product requirements should not change casually.
- Major new features require explicit change requests.
- Technical choices belong in `TECHSTACK.md` / `ARSITEKTUR.md`.
- UI/UX belongs in `DESIGN.md`.
- AI coding rules belong in `AGENT.md`.
- Development process belongs in `WORKFLOW.md`.
- Implementation tasks belong in `TODO.md`.

---

## 47. Documentation Roadmap

```text
PRD.md
  ↓
DESIGN.md
  ↓
TECHSTACK.md
  ↓
ARSITEKTUR.md
  ↓
AGENT.md
  ↓
WORKFLOW.md
  ↓
TODO.md
```

- **PRD.md** — What the product is and must do.
- **DESIGN.md** — How the product looks and behaves.
- **TECHSTACK.md** — Which technologies are used and why.
- **ARSITEKTUR.md** — How components interact and how data/security flows.
- **AGENT.md** — Rules for AI coding agents.
- **WORKFLOW.md** — Development/testing/review/deployment process.
- **TODO.md** — Current implementation tasks and progress.

---

## 48. Final Product Invariants

- One user may own one active warehouse.
- Creator becomes OWNER.
- Join requester does not choose final role.
- OWNER can assign MANAGER/STAFF/AUDITOR/VIEWER.
- MANAGER can assign STAFF/AUDITOR/VIEWER.
- OWNER cannot be granted through normal join.
- Treasury pays deployment gas but is not warehouse owner.
- User wallet remains warehouse owner.
- Deployment authorization uses EIP-712.
- Deployment replay protection uses on-chain `deploymentNonce`.
- `deploymentNonce` and `idempotencyKey` are independent.
- Hash numeric values are canonical decimal strings.
- Hashing uses versioned JCS + Keccak-256.
- Factory enforces one active warehouse per owner on-chain.
- Blockchain confirmation is asynchronous.
- Inventory updates are atomic.
- Concurrent inventory operations remain consistent.
- Supabase is operational database source of truth.
- Supabase Realtime is required.
- RLS is defense-in-depth.
- Treasury credentials are server-side only.
- Faucet limit is 0.001 Base Sepolia ETH / user / 12 hours.
- Sensitive operations use multiple anti-abuse controls.
- Audit logs are append-only/immutable from normal UI.
- Public pages are SEO-ready.
- Private pages are not intended for indexing.
- Application is responsive.
- Accessibility and reduced motion are required.
- Developer Console is privileged.
- Technical implementation details are finalized in later documents.

---

## 49. Acceptance Baseline

**Authentication**

- Privy authentication works.
- New user onboarding works.
- Existing user can continue to warehouse.

**Warehouse**

- One warehouse per user.
- Unique warehouse code.
- EIP-712 deployment authorization.
- Factory one-warehouse enforcement.
- Treasury-sponsored deployment.
- User remains owner.
- Contract address recorded.

**Membership**

- Join request starts PENDING.
- Owner can approve all permitted roles.
- Manager can approve STAFF/AUDITOR/VIEWER only.
- Unauthorized role assignment is rejected.

**Inventory**

- Role permissions work.
- Bulk import validates before commit.
- Stock In works for authorized users.
- Stock Out works for authorized users.
- Concurrent operations remain consistent.
- Negative stock is prevented.
- Stock movements are recorded.

**Realtime**

- Connected users receive inventory changes without manual refresh.

**Blockchain**

- Explicit blockchain states.
- Asynchronous confirmation.
- Visible failure/retry.
- BaseScan proof link.

**Security**

- RLS where appropriate.
- Safe/parameterized database access.
- Server-side secrets.
- Rate limiting.
- Idempotency.
- Atomic sensitive operations.
- Nonce + expiry replay protection.

**UX**

- Skeleton/loading states.
- Empty states.
- Error states.
- Notification center.
- Collapsible sidebar.
- Responsive UI.
- High-risk confirmations.
- Accessibility basics.

**Developer**

- Privileged Developer Console.
- RPC/blockchain health.
- Treasury monitoring.
- Failed operation investigation.

---

## 50. PRD Status

**Ready for final review.**

Before freezing, review specifically:

- Business rules.
- Role hierarchy.
- Warehouse lifecycle.
- Inventory concurrency.
- Blockchain ownership.
- Deployment authorization.
- Hash specification.
- Faucet policy.
- Export permissions.
- Security requirements.
- Developer Console scope.
- Non-goals.

Once approved:

```text
PRD → FREEZE
```

Any later change should be recorded as an explicit change request rather than silently changing product requirements.
