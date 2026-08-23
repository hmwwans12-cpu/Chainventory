/**
 * Shared client types untuk UI inventory.
 * Server page memetakan row PostgREST → bentuk ini; komponen client
 * (table/dialog/sheet) hanya bekerja dengan bentuk ini.
 */

/**
 * PostgREST mengembalikan embed to-one (FK di tabel sumber) sebagai OBJECT,
 * embed to-many sebagai ARRAY. TypeScript generated types-nya longgar (array).
 * Helper ini menormalkan keduanya menjadi satu nilai.
 */
export function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length ? value[0] : null;
  return value;
}

export type ProductStatus = "active" | "archived";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  status: ProductStatus;
  lowStockThreshold: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  quantity: string | null;
  balanceVersion: number | null;
  movementCount: number;
};

export type MovementStatus = "pending_approval" | "committed" | "rejected";

export type StockMovementRow = {
  id: string;
  movementType: "stock_in" | "stock_out" | "adjustment" | "reversal";
  quantity: string;
  reason: string | null;
  reference: string | null;
  status: MovementStatus;
  actorWallet: string | null;
  created_at: string;
  expectedBalanceVersion: number | null;
  proofStatus?: string | null;
};

export type MovementListItem = {
  id: string;
  movementType: "stock_in" | "stock_out" | "adjustment" | "reversal";
  quantity: string;
  status: MovementStatus;
  reason: string | null;
  reference: string | null;
  actorWallet: string | null;
  expectedBalanceVersion: number | null;
  created_at: string;
  productName: string;
  productSku: string;
  unit: string;
  proofStatus: string | null;
  proofTxHash: string | null;
  proofError: string | null;
};
