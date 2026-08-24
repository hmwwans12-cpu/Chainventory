/**
 * Domain error catalog (audit 0.1.5 P1-09 / A-04).
 *
 * Pipeline wajib: Postgres/PostgREST error → domain error → HTTP status →
 * pesan UI aman. Pesan database mentah (`duplicate key value violates
 * unique constraint`, `relation does not exist`, dst.) TIDAK BOLEH bocor
 * ke client — log penuh tetap ditulis server-side oleh pemanggil.
 */

export type DomainErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PRODUCT_EXISTS"
  | "DUPLICATE_RECORD"
  | "PRODUCT_ARCHIVED"
  | "WAREHOUSE_SUSPENDED"
  | "INSUFFICIENT_STOCK"
  | "STALE_STOCK"
  | "IDEMPOTENCY_CONFLICT"
  | "DB_UNEXPECTED";

export interface DomainError {
  code: DomainErrorCode;
  httpStatus: number;
  /** Pesan aman untuk client — tidak memuat detail skema/database. */
  userMessage: string;
}

const CATALOG: Record<DomainErrorCode, DomainError> = {
  INVALID_INPUT: {
    code: "INVALID_INPUT",
    httpStatus: 400,
    userMessage: "Invalid input.",
  },
  UNAUTHENTICATED: {
    code: "UNAUTHENTICATED",
    httpStatus: 401,
    userMessage: "Unauthorized.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    httpStatus: 403,
    userMessage: "Forbidden.",
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    httpStatus: 404,
    userMessage: "Not found.",
  },
  PRODUCT_EXISTS: {
    code: "PRODUCT_EXISTS",
    httpStatus: 409,
    userMessage: "A product with this SKU already exists in this warehouse.",
  },
  DUPLICATE_RECORD: {
    code: "DUPLICATE_RECORD",
    httpStatus: 409,
    userMessage: "This record already exists.",
  },
  PRODUCT_ARCHIVED: {
    code: "PRODUCT_ARCHIVED",
    httpStatus: 400,
    userMessage: "Archived products cannot be modified.",
  },
  WAREHOUSE_SUSPENDED: {
    code: "WAREHOUSE_SUSPENDED",
    httpStatus: 403,
    userMessage: "Warehouse is suspended or inactive.",
  },
  INSUFFICIENT_STOCK: {
    code: "INSUFFICIENT_STOCK",
    httpStatus: 409,
    userMessage: "Insufficient stock for this operation.",
  },
  STALE_STOCK: {
    code: "STALE_STOCK",
    httpStatus: 409,
    userMessage: "Stock changed while you were working. Refresh and retry.",
  },
  IDEMPOTENCY_CONFLICT: {
    code: "IDEMPOTENCY_CONFLICT",
    httpStatus: 409,
    userMessage:
      "This idempotency key was already used for a different operation.",
  },
  DB_UNEXPECTED: {
    code: "DB_UNEXPECTED",
    httpStatus: 500,
    userMessage: "Unexpected database error. Please try again.",
  },
};

/** Pola pesan PostgREST/plpgsql yang merupakan penolakan otorisasi (→ 403). */
const AUTHZ_ERROR_RE =
  /not authenticated|insufficient|row-level security|permission denied|not a member|not owner of|warehouse not found|warehouse is suspended|join request already|join request not|already a member|warehouse not accepting|cannot remove owner|owner cannot leave|unit is immutable|movement not|new row violates/i;

/**
 * Map pesan error Postgres/PostgREST mentah → domain error katalog.
 * Urutan pola penting: yang spesifik sebelum yang generik.
 */
export function mapDbError(rawMessage: string): DomainError {
  const message = rawMessage ?? "";

  if (/products_warehouse_sku|products_sku/i.test(message)) {
    return CATALOG.PRODUCT_EXISTS;
  }
  if (/duplicate key/i.test(message)) {
    return CATALOG.DUPLICATE_RECORD;
  }
  if (/archived products? (cannot|is|are)|product is archived/i.test(message)) {
    return CATALOG.PRODUCT_ARCHIVED;
  }
  if (/warehouse is suspended|suspended warehouse/i.test(message)) {
    return CATALOG.WAREHOUSE_SUSPENDED;
  }
  if (/insufficient stock/i.test(message)) {
    return CATALOG.INSUFFICIENT_STOCK;
  }
  if (/expected version .* but current|stale/i.test(message)) {
    return CATALOG.STALE_STOCK;
  }
  if (/IDEMPOTENCY_CONFLICT/i.test(message)) {
    return CATALOG.IDEMPOTENCY_CONFLICT;
  }
  // Kode raise eksplisit dari RPC milik sendiri (0037/0039 dst.).
  if (/INITIAL_STOCK_FAILED/i.test(message)) {
    return {
      ...CATALOG.STALE_STOCK,
      userMessage:
        "Product created was rolled back: initial stock could not be applied.",
    };
  }
  if (/\bFORBIDDEN\b|warehouse is suspended/i.test(message)) {
    return CATALOG.FORBIDDEN;
  }
  if (/\bUNAUTHENTICATED\b/i.test(message)) {
    return CATALOG.UNAUTHENTICATED;
  }
  if (/\bNOT_FOUND\b/i.test(message)) {
    return CATALOG.NOT_FOUND;
  }
  if (/no rows|does not exist.*not found|NOT_FOUND/i.test(message)) {
    return CATALOG.NOT_FOUND;
  }
  if (AUTHZ_ERROR_RE.test(message)) {
    // Penolakan berasal dari policy/RPC milik sendiri; pesannya aman,
    // tapi tetap dipetakan lewat katalog agar konsisten.
    return { ...CATALOG.FORBIDDEN, userMessage: "Forbidden." };
  }
  if (
    /violates (check|foreign key|not-null) constraint|invalid input/i.test(
      message
    )
  ) {
    return { ...CATALOG.INVALID_INPUT, userMessage: "Invalid input." };
  }
  return CATALOG.DB_UNEXPECTED;
}
