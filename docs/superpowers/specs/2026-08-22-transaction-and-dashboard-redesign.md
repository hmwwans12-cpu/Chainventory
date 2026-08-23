# Transaction and Dashboard Redesign

## Approved decisions

- The warehouse member's Privy wallet signs and pays gas for every Stock In and Stock Out.
- Treasury is restricted to warehouse deployment and faucet transfers.
- Inventory balance changes only after the user transaction is mined and verified; a rejected, dropped, or reverted transaction never changes inventory.
- The application records a durable pending intent before opening Privy and reconciles it safely after a browser interruption.

## Stock mutation lifecycle

1. The BFF authorizes, rate-limits, validates the request, creates an idempotent `pending` intent, and returns canonical calldata/payload.
2. The client asks Privy to submit the contract call from the member wallet.
3. The client reports the transaction hash to the BFF.
4. The BFF verifies the receipt and proof event, then atomically commits the stock movement, balance, audit record, and intent state.
5. Failed, rejected, expired, or reverted intents never write a movement or balance.

## UX structure

- App shell: stable 256px/72px desktop sidebar, mobile bottom navigation, topbar with breadcrumb, realtime state, notifications, and wallet profile.
- Dashboard: warehouse context and primary `Record stock` action, wallet/faucet strip, operational metrics, attention queue, movement trend, and activity.
- Stock dialog: choose product, review before/after stock and network, sign/pay through Privy, submit, confirm, completion/recovery state.
- Faucet: contextual wallet-card action only when Base Sepolia balance is low; show cooldown and explorer result.
- Every surface supplies loading, empty, error, permission-denied, offline/reconnecting, and keyboard-accessible states.

## Cross-cutting remediation

- Add common fail-closed rate limiting for sensitive mutations.
- Add idempotency records with request fingerprint, response, and 24-hour expiry.
- Make product creation plus initial stock atomic and make bulk import support up to 1,000 initial-stock rows.
- Add product/balance realtime invalidation.
- Replace Settings placeholder with warehouse/profile/wallet settings.
- Align TECHSTACK, TODO, CI, migrations, and tests with the implementation.

## Verification

- Unit/integration tests for lifecycle transition, rejection/revert, duplicate request, rate-limit outage, stock race, and import.
- Contract tests for member proof submission and access control.
- UI tests for wallet handoff, recovery, sidebar states, dashboard states, and faucet visibility.
