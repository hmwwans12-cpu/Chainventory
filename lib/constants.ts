/**
 * Application constants.
 */

export const APP_NAME = "Chainventory";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Faucet policy (PRD §17): 0.001 Base Sepolia ETH / user / 12 hours. */
export const FAUCET_AMOUNT_ETH = "0.001";
export const FAUCET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * Ambang banner faucet (FE-24): 3x nominal klaim — tampilkan CTA faucet saat
 * saldo di bawah ini. Didefinisikan relatif terhadap FAUCET_AMOUNT_ETH agar
 * tidak basi bila nominal berubah.
 */
export const FAUCET_LOW_BALANCE_ETH = 0.003;

/** Warehouse lifecycle (PRD §20). */
export const INACTIVITY_WARNING_DAYS = 23;
export const INACTIVITY_CRITICAL_DAYS = 27;
export const SUSPEND_ARCHIVE_DAYS = 30;

/** BaseScan explorer (Base Sepolia) — satu sumber (FE-06). */
export const BASESCAN_URL = "https://sepolia.basescan.org";
export const basescanTxUrl = (txHash: string) => `${BASESCAN_URL}/tx/${txHash}`;
export const basescanAddressUrl = (address: string) =>
  `${BASESCAN_URL}/address/${address}`;

/** Pagination server+client (FE-07) — samakan di kedua sisi. */
export const MOVEMENTS_PAGE_SIZE = 25;
export const PRODUCTS_PER_PAGE = 12;
export const TRANSACTIONS_PER_PAGE = 20;
export const NOTIFICATIONS_PAGE_SIZE = 25;
export const PROOF_LIMIT = 50;
export const NOTIFICATION_PANEL_LIMIT = 12;

/** Realtime (FE-07). */
export const REALTIME_DEBOUNCE_MS = 400;
export const REALTIME_RETRY_MS = 5_000;
export const UNREAD_POLL_MS = 60_000;

/** Feedback durasi UI (FE-07). */
export const COPY_FEEDBACK_MS = 1_500;
export const FLASH_MESSAGE_MS = 1_800;
export const DEPLOY_COMPLETE_DELAY_MS = 700;
