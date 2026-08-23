import type { Role } from "@/lib/auth/permissions";

export type MemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type MemberListItem = {
  membershipId: string;
  userId: string;
  role: Role;
  status: MemberStatus;
  joinedAt: string | null;
  displayName: string | null;
  email: string;
};

/**
 * Baris `join_requests` berstatus `pending` untuk halaman Members.
 * Requester TIDAK memilih role saat submit (PRD §9.1); role diisi
 * approver saat approve lewat matrix `canAssignRole`.
 */
export type PendingJoinRequest = {
  requestId: string;
  userId: string;
  displayName: string | null;
  email: string;
  requestedAt: string | null;
};
