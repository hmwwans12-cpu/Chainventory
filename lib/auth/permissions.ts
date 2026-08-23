/**
 * Canonical RBAC model (PRD §4, §10; ARSITEKTUR §4).
 * Single source of truth for warehouse roles and permissions.
 */

export const ROLES = [
  "OWNER",
  "MANAGER",
  "STAFF",
  "AUDITOR",
  "VIEWER",
] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUS = ["PENDING", "ACTIVE", "SUSPENDED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const canManageRole = (actor: Role): Role[] => {
  switch (actor) {
    case "OWNER":
      return ["MANAGER", "STAFF", "AUDITOR", "VIEWER"];
    case "MANAGER":
      return ["STAFF", "AUDITOR", "VIEWER"];
    default:
      return [];
  }
};

/**
 * Wajib dipakai untuk SEMUA operasi assign/approve/remove role
 * (join request approve, role assignment, member removal), bukan
 * `hasPermission(MEMBER_MANAGE)` sendirian.
 *
 * Aturan ini mengunci larangan eksplisit PRD §9.2 dan AGENT.md §3:
 * Manager HANYA boleh mengelola Staff, Auditor, dan Viewer — tidak pernah
 * MANAGER apalagi OWNER. `canAssignRole` menggabungkan dua mekanisme yang
 * terpisah menjadi satu pintu otorisasi:
 *
 *   1. hasPermission(actor, MEMBER_MANAGE)  → "boleh kelola member"
 *   2. canManageRole(actor).includes(target) → "boleh menetapkan role target"
 *
 * Endpoint P1 yang melewati helper ini dan memanggil `hasPermission` saja
 * untuk assign-role dianggap BUG dan harus ditolak di code review.
 */
export function canAssignRole(actor: Role, targetRole: Role): boolean {
  return (
    hasPermission(actor, PERMISSIONS.MEMBER_MANAGE) &&
    canManageRole(actor).includes(targetRole)
  );
}

/**
 * Canonical permission matrix.
 * `capability` granularity covers inventory, members, blockchain, treasury.
 */
export const PERMISSIONS = {
  // Inventory
  INVENTORY_READ: "inventory:read",
  PRODUCT_CREATE: "product:create",
  PRODUCT_EDIT: "product:edit",
  PRODUCT_ARCHIVE: "product:archive",
  PRODUCT_BULK_IMPORT: "product:bulk_import",
  PRODUCT_EXPORT: "product:export",
  STOCK_IN: "stock:in",
  STOCK_OUT: "stock:out",
  STOCK_ADJUSTMENT: "stock:adjustment",
  STOCK_REVERSAL: "stock:reversal",
  STOCK_APPROVE_ADJUSTMENT: "stock:approve_adjustment",
  MOVEMENT_READ: "movement:read",

  // Members
  MEMBER_READ: "member:read",
  JOIN_REQUEST_READ: "join_request:read",
  JOIN_REQUEST_APPROVE: "join_request:approve",
  /**
   * HANYA jawab "boleh mengelola member atau tidak".
   * TIDAK cukup untuk approve/assign/remove role — kombinasi dengan
   * `canManageRole()` wajib, dan setiap call-site assign-role WAJIB
   * memakai `canAssignRole()`. Meloloskan role MANAGER/OWNER via
   * hasPermission() saja = BUG (PRD §9.2, AGENT.md §3).
   */
  MEMBER_MANAGE: "member:manage",
  /**
   * Sama seperti MEMBER_MANAGE: hanya flag kapabilitas, bukan otorisasi
   * penuh untuk operasi remove. Call-site remove member WAJIB melalui
   * `canAssignRole(actor, targetRole)` untuk memastikan actor berhak
   * mengelola role target sebelum penghapusan.
   */
  MEMBER_REMOVE: "member:remove",
  ROLE_ASSIGN_MANAGER: "role:assign_manager",

  // Warehouse
  WAREHOUSE_MANAGE: "warehouse:manage",
  WAREHOUSE_SUSPEND: "warehouse:suspend",
  OWNERSHIP_TRANSFER: "ownership:transfer",

  // Blockchain / Treasury
  BLOCKCHAIN_READ: "blockchain:read",
  PROOF_READ: "proof:read",
  FAUCET_CLAIM: "faucet:claim",
  DEVELOPER_CONSOLE: "developer:console",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const OWNER_PERMS: Permission[] = [...Object.values(PERMISSIONS)];

const MANAGER_PERMS: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRODUCT_CREATE,
  PERMISSIONS.PRODUCT_EDIT,
  PERMISSIONS.PRODUCT_ARCHIVE,
  PERMISSIONS.PRODUCT_BULK_IMPORT,
  PERMISSIONS.PRODUCT_EXPORT,
  PERMISSIONS.STOCK_IN,
  PERMISSIONS.STOCK_OUT,
  PERMISSIONS.STOCK_ADJUSTMENT,
  PERMISSIONS.STOCK_REVERSAL,
  PERMISSIONS.STOCK_APPROVE_ADJUSTMENT,
  PERMISSIONS.MOVEMENT_READ,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.JOIN_REQUEST_READ,
  PERMISSIONS.JOIN_REQUEST_APPROVE,
  PERMISSIONS.MEMBER_MANAGE,
  PERMISSIONS.MEMBER_REMOVE,
  PERMISSIONS.BLOCKCHAIN_READ,
  PERMISSIONS.PROOF_READ,
  PERMISSIONS.FAUCET_CLAIM,
];

const STAFF_PERMS: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.PRODUCT_CREATE,
  PERMISSIONS.PRODUCT_EDIT,
  PERMISSIONS.PRODUCT_BULK_IMPORT,
  PERMISSIONS.PRODUCT_EXPORT,
  PERMISSIONS.STOCK_IN,
  PERMISSIONS.STOCK_OUT,
  PERMISSIONS.MOVEMENT_READ,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.BLOCKCHAIN_READ,
  PERMISSIONS.PROOF_READ,
];

const AUDITOR_PERMS: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.MOVEMENT_READ,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.BLOCKCHAIN_READ,
  PERMISSIONS.PROOF_READ,
  PERMISSIONS.PRODUCT_EXPORT,
];

const VIEWER_PERMS: Permission[] = [
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.MOVEMENT_READ,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.BLOCKCHAIN_READ,
  PERMISSIONS.PROOF_READ,
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: OWNER_PERMS,
  MANAGER: MANAGER_PERMS,
  STAFF: STAFF_PERMS,
  AUDITOR: AUDITOR_PERMS,
  VIEWER: VIEWER_PERMS,
};

export { ROLE_PERMISSIONS };

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
