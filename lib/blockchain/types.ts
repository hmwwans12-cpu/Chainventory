/**
 * Tipe bersama untuk halaman Blockchain (server page + client component).
 */

export type DeploymentSummary = {
  id: string;
  warehouse_id: string;
  factory_address: string | null;
  chain_id: number | null;
  status: string;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ProofRow = {
  id: string;
  movement_id: string | null;
  payload_hash: string;
  status: string;
  tx_hash: string | null;
  error: string | null;
  attempt_count: number;
  confirmation_count: number;
  created_at: string;
};

export { DEPLOYMENT_STATUS_META } from "@/lib/blockchain/proof-meta";
