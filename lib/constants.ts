/**
 * Application constants.
 */

export const APP_NAME = "Chainventory";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Faucet policy (PRD §17): 0.001 Base Sepolia ETH / user / 12 hours. */
export const FAUCET_AMOUNT_ETH = "0.001";
export const FAUCET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Warehouse lifecycle (PRD §20). */
export const INACTIVITY_WARNING_DAYS = 23;
export const INACTIVITY_CRITICAL_DAYS = 27;
export const SUSPEND_ARCHIVE_DAYS = 30;
