/**
 * Application constants.
 */

export const APP_NAME = "Chainventory";
export const APP_TAGLINE = "Inventory Management with Blockchain Verification";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_NAME = "Base Sepolia";

/** Faucet policy (PRD §17): 0.001 Base Sepolia ETH / user / 12 hours. */
export const FAUCET_AMOUNT_ETH = "0.001";
export const FAUCET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Warehouse lifecycle (PRD §20). */
export const INACTIVITY_WARNING_DAYS = 23;
export const INACTIVITY_CRITICAL_DAYS = 27;
export const SUSPEND_ARCHIVE_DAYS = 30;

/** Idempotency TTL (PRD §32). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Proof retry policy (WORKFLOW §6). */
export const PROOF_MAX_RETRIES = 5;
export const PROOF_MIN_CONFIRMATIONS = 2;
