import type { Metadata } from "next";

import { JoinWarehouseForm } from "@/components/warehouses/join-warehouse-form";

export const metadata: Metadata = {
  title: "Join Warehouse",
  description: "Join an existing Chainventory warehouse with a warehouse code.",
  robots: { index: false, follow: false },
};

/**
 * Join Warehouse (PRD §5.3, DESIGN §30): enter a warehouse code to request
 * access. The request is stored as `join_requests` (pending) and must be
 * approved by an owner/manager (RBAC server flow, `/api/warehouses/membership`).
 */
export default function JoinWarehousePage() {
  return <JoinWarehouseForm />;
}
