"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Crown,
  Loader2,
  LogOut,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/shared/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { toast } from "@/components/ui/toast";
import {
  canAssignRole,
  canManageRole,
  hasPermission,
  PERMISSIONS,
  ROLES,
  type Role,
} from "@/lib/auth/permissions";
import {
  approveJoin,
  changeMemberRole,
  leaveWarehouse,
  rejectJoin,
  removeMember,
  transferOwnership,
} from "@/lib/warehouses/members-client";
import type { MemberListItem, PendingJoinRequest } from "@/lib/members/types";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { PanelCard } from "@/components/shared/panel-card";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { formatDate } from "@/lib/utils";

const ROLE_META: Record<Role, { label: string; tone: StatusTone }> = {
  OWNER: { label: "Owner", tone: "success" },
  MANAGER: { label: "Manager", tone: "pending" },
  STAFF: { label: "Staff", tone: "inactive" },
  AUDITOR: { label: "Auditor", tone: "warning" },
  VIEWER: { label: "Viewer", tone: "inactive" },
};

export function MembersPage({
  warehouseId,
  warehouses,
  role,
  myUserId,
  inviteCode,
  members,
  pendingRequests,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  role: Role;
  myUserId: string;
  inviteCode: string;
  members: MemberListItem[];
  pendingRequests: PendingJoinRequest[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [changing, setChanging] = React.useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = React.useState<MemberListItem | null>(
    null
  );
  const [leaveTarget, setLeaveTarget] = React.useState<MemberListItem | null>(
    null
  );
  const [transferOpen, setTransferOpen] = React.useState(false);

  // Join request approval state (PRD §9.2): role DIPILIH approver saat
  // approve, opsi dibatasi matrix canManageRole(actor) — OWNER tidak pernah
  // ditawarkan (AGENT.md §3).
  const [roleChoice, setRoleChoice] = React.useState<Record<string, Role | "">>(
    {}
  );
  const [processing, setProcessing] = React.useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] =
    React.useState<PendingJoinRequest | null>(null);

  const canInvite = hasPermission(role, PERMISSIONS.JOIN_REQUEST_APPROVE);
  const isOwner = role === "OWNER";
  const assignableRoles = canManageRole(role);

  // Email invite (audit: email invites)
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>(
    assignableRoles[0] ?? "STAFF"
  );
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [inviteSent, setInviteSent] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);

  const handleInvite = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/warehouses/members/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.data?.acceptUrl) {
        setInviteError(json?.error ?? "Could not create invitation.");
      } else {
        setInviteSent(Boolean(json.data.emailSent));
        setInviteUrl(json.data.acceptUrl);
        setInviteEmail("");
        toast.add({
          type: "success",
          title: "Invitation created",
          description: json.data.emailSent
            ? "Invitation sent by email."
            : "Share the link with the invitee.",
        });
      }
    } catch {
      setInviteError("Network error. Try again.");
    } finally {
      setInviteBusy(false);
    }
  };

  const showRequests =
    canInvite && assignableRoles.length > 0 && pendingRequests.length > 0;

  const refresh = () => router.refresh();

  const handleApprove = async (request: PendingJoinRequest) => {
    const chosenRole = roleChoice[request.requestId];
    if (!chosenRole) return;
    setProcessing((prev) => new Set(prev).add(request.requestId));
    const result = await approveJoin({
      requestId: request.requestId,
      role: chosenRole,
    });
    setProcessing((prev) => {
      const next = new Set(prev);
      next.delete(request.requestId);
      return next;
    });
    if (result.ok) {
      toast.add({
        type: "success",
        title: "Join request approved",
        description: `${request.displayName ?? request.email} joined as ${
          ROLE_META[chosenRole].label
        }.`,
      });
      refresh();
    } else {
      toast.add({
        type: "error",
        title: "Could not approve request",
        description: result.error,
      });
    }
  };

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-01: helper terpusat.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.add({
        type: "success",
        title: "Invite code copied",
        description: `Share "${inviteCode}" to invite a member.`,
      });
    } catch {
      toast.add({
        type: "error",
        title: "Could not copy",
        description: "Copy the code manually.",
      });
    }
  };

  const handleRoleChange = async (member: MemberListItem, newRole: Role) => {
    setChanging((prev) => new Set(prev).add(member.membershipId));
    const result = await changeMemberRole({
      warehouseId,
      userId: member.userId,
      role: newRole,
    });
    setChanging((prev) => {
      const next = new Set(prev);
      next.delete(member.membershipId);
      return next;
    });
    if (result.ok) {
      toast.add({
        type: "success",
        title: "Role updated",
        description: `${member.displayName ?? member.email} is now ${ROLE_META[newRole].label}.`,
      });
      refresh();
    } else {
      toast.add({
        type: "error",
        title: "Could not update role",
        description: result.error,
      });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger size="sm" aria-label="Warehouse">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {isOwner ? (
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <Crown aria-hidden="true" />
              Transfer Ownership
            </Button>
          ) : null}
        </div>
        {canInvite ? (
          <div className="border-border flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <span className="text-muted-foreground text-xs">Invite code</span>
            <span className="font-mono text-sm tracking-wide">
              {inviteCode}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyInvite}
              aria-label="Copy invite code"
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInviteUrl(null);
                setInviteError(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus aria-hidden="true" />
              Invite by email
            </Button>
          </div>
        ) : null}

        {canInvite ? (
          <Dialog
            open={inviteOpen}
            onOpenChange={(open) => {
              setInviteOpen(open);
              if (!open) {
                setInviteUrl(null);
                setInviteError(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite by email</DialogTitle>
                <DialogDescription>
                  Creates a single-use invite link bound to the email address.
                  The recipient opens it while signed in with that email to
                  join.
                </DialogDescription>
              </DialogHeader>
              {inviteUrl ? (
                <div className="flex flex-col gap-3">
                  <Label htmlFor="invite-link">Invite link</Label>
                  <div className="flex items-center gap-2">
                    <code
                      id="invite-link"
                      className="bg-muted text-foreground flex-1 truncate rounded-md px-2 py-1.5 font-mono text-xs"
                    >
                      {`${typeof window !== "undefined" ? window.location.origin : ""}${inviteUrl}`}
                    </code>
                    <CopyButton
                      text={`${typeof window !== "undefined" ? window.location.origin : ""}${inviteUrl}`}
                      label="Copy invite link"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {inviteSent
                      ? "Invitation sent — they'll also get this link by email."
                      : "Email delivery is not configured in this environment — share the link directly."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={inviteBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => {
                        if (value !== null) setInviteRole(value as Role);
                      }}
                    >
                      <SelectTrigger id="invite-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_META[r].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteError ? (
                    <p className="text-destructive text-xs">{inviteError}</p>
                  ) : null}
                </div>
              )}
              <DialogFooter>
                {inviteUrl ? (
                  <Button onClick={() => setInviteOpen(false)}>Done</Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setInviteOpen(false)}
                      disabled={inviteBusy}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={inviteBusy}>
                      {inviteBusy ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <UserPlus aria-hidden="true" />
                      )}
                      Create invite
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {showRequests ? (
        <section aria-labelledby="join-requests-heading">
          <PanelCard padding="none" className="bg-card">
            <div className="border-border flex items-center gap-2 border-b px-4 py-3">
              <span className="bg-warning/15 text-warning flex size-7 items-center justify-center rounded-full">
                <UserPlus aria-hidden="true" className="size-4" />
              </span>
              <h2
                id="join-requests-heading"
                className="font-display text-foreground text-sm font-semibold"
              >
                Join requests
              </h2>
              <StatusBadge
                tone="pending"
                label={`${pendingRequests.length} pending`}
              />
            </div>
            <ul className="divide-border divide-y">
              {pendingRequests.map((request) => {
                const chosen = roleChoice[request.requestId] ?? "";
                const busy = processing.has(request.requestId);
                return (
                  <li
                    key={request.requestId}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">
                        {request.displayName ?? "Unnamed user"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {request.email}
                        {request.requestedAt
                          ? ` · requested ${formatDate(request.requestedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Select
                        value={chosen || undefined}
                        onValueChange={(value) => {
                          if (value !== null) {
                            setRoleChoice((prev) => ({
                              ...prev,
                              [request.requestId]: value as Role,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-36"
                          aria-label={`Role for ${request.displayName ?? request.email}`}
                          disabled={busy}
                        >
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_META[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request)}
                        disabled={!chosen || busy}
                      >
                        <Check aria-hidden="true" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectTarget(request)}
                        disabled={busy}
                      >
                        <X aria-hidden="true" />
                        Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </PanelCard>
        </section>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Invite teammates with the warehouse code, or share the invite link above."
        />
      ) : (
        <PanelCard padding="none">
        <div className="hidden md:block overflow-x-auto">
        <Table className="md:min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === myUserId;
              const manageable =
                !isSelf &&
                member.role !== "OWNER" &&
                canAssignRole(role, member.role);
              const assignable = ROLES.filter(
                (r) =>
                  r !== "OWNER" && canAssignRole(role, r) && r !== member.role
              );
              const roleMeta = ROLE_META[member.role];
              return (
                <TableRow
                  key={member.membershipId}
                  data-state={
                    member.status !== "ACTIVE" ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-foreground font-medium">
                        {member.displayName ?? "Unnamed member"}
                        {isSelf ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {manageable && assignable.length > 0 ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) => {
                          if (value !== null && value !== member.role) {
                            handleRoleChange(member, value);
                          }
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-32"
                          disabled={changing.has(member.membershipId)}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_META[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge
                        tone={roleMeta.tone}
                        label={roleMeta.label}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={
                        member.status === "ACTIVE"
                          ? "success"
                          : member.status === "PENDING"
                            ? "pending"
                            : "failed"
                      }
                      label={
                        member.status === "ACTIVE"
                          ? "Active"
                          : member.status === "PENDING"
                            ? "Pending"
                            : "Suspended"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs tabular-nums lg:table-cell">
                    {member.joinedAt ? formatDate(member.joinedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${member.displayName ?? member.email}`}
                          />
                        }
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isSelf ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setLeaveTarget(member)}
                          >
                            <LogOut aria-hidden="true" />
                            Leave warehouse
                          </DropdownMenuItem>
                        ) : null}
                        {manageable ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemoveTarget(member)}
                          >
                            <UserMinus aria-hidden="true" />
                            Remove member
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            </TableBody>
        </Table>
        </div>
        {/* Mobile: card list (audit N) */}
        <ul className="divide-y md:hidden">
          {members.map((member) => {
            const isSelf = member.userId === myUserId;
            const manageable =
              !isSelf &&
              member.role !== "OWNER" &&
              canAssignRole(role, member.role);
            const assignable = ROLES.filter(
              (r) =>
                r !== "OWNER" && canAssignRole(role, r) && r !== member.role
            );
            const roleMeta = ROLE_META[member.role];
            const statusTone =
              member.status === "ACTIVE"
                ? "success"
                : member.status === "PENDING"
                  ? "pending"
                  : "failed";
            const statusLabel =
              member.status === "ACTIVE"
                ? "Active"
                : member.status === "PENDING"
                  ? "Pending"
                  : "Suspended";
            return (
              <li
                key={member.membershipId}
                className="flex items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-foreground truncate font-medium">
                    {member.displayName ?? "Unnamed member"}
                    {isSelf ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (you)
                      </span>
                    ) : null}
                  </span>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {member.email}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {manageable && assignable.length > 0 ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) => {
                          if (value !== null && value !== member.role) {
                            handleRoleChange(member, value);
                          }
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-32"
                          disabled={changing.has(member.membershipId)}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_META[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge
                        tone={roleMeta.tone}
                        label={roleMeta.label}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge tone={statusTone} label={statusLabel} />
                    {member.joinedAt ? (
                      <span className="text-muted-foreground text-xs">
                        {formatDate(member.joinedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${member.displayName ?? member.email}`}
                      />
                    }
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isSelf ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setLeaveTarget(member)}
                      >
                        <LogOut aria-hidden="true" />
                        Leave warehouse
                      </DropdownMenuItem>
                    ) : null}
                    {manageable ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRemoveTarget(member)}
                      >
                        <UserMinus aria-hidden="true" />
                        Remove member
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
        </PanelCard>
      )}

      {rejectTarget ? (
        <RejectJoinDialog
          request={rejectTarget}
          open={Boolean(rejectTarget)}
          onOpenChange={(open) => setRejectTarget(open ? rejectTarget : null)}
          onDone={refresh}
        />
      ) : null}
      {removeTarget ? (
        <RemoveMemberDialog
          warehouseId={warehouseId}
          member={removeTarget}
          open={Boolean(removeTarget)}
          onOpenChange={(open) => setRemoveTarget(open ? removeTarget : null)}
          onDone={refresh}
        />
      ) : null}
      {leaveTarget ? (
        <LeaveWarehouseDialog
          warehouseId={warehouseId}
          isOwner={isOwner}
          open={Boolean(leaveTarget)}
          onOpenChange={(open) => setLeaveTarget(open ? leaveTarget : null)}
          onTransfer={() => {
            setLeaveTarget(null);
            setTransferOpen(true);
          }}
          onDone={refresh}
        />
      ) : null}
      {transferOpen ? (
        <TransferOwnershipDialog
          warehouseId={warehouseId}
          members={members.filter(
            (m) => m.userId !== myUserId && m.status === "ACTIVE"
          )}
          open
          onOpenChange={setTransferOpen}
          onDone={() => {
            setTransferOpen(false);
            router.replace("/members");
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function RejectJoinDialog({
  request,
  open,
  onOpenChange,
  onDone,
}: {
  request: PendingJoinRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const reject = async () => {
    setBusy(true);
    setError(null);
    const result = await rejectJoin({
      requestId: request.requestId,
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Join request rejected",
        description: `${request.displayName ?? request.email} was not granted access.`,
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reject {request.displayName ?? "this join request"}?
          </DialogTitle>
          <DialogDescription>
            They can submit a new request later. You can optionally include a
            reason.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Input
            id="reject-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Warehouse is at capacity"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={reject} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <X />
            )}
            Reject request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  warehouseId,
  member,
  open,
  onOpenChange,
  onDone,
}: {
  warehouseId: string;
  member: MemberListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await removeMember({ warehouseId, userId: member.userId });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Member removed",
        description: `${member.displayName ?? member.email} no longer has access.`,
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.displayName ?? "member"}?</DialogTitle>
          <DialogDescription>
            {member.displayName ?? member.email} will immediately lose access to
            this warehouse. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <UserMinus aria-hidden="true" />
            )}
            Remove member
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeaveWarehouseDialog({
  warehouseId,
  isOwner,
  open,
  onOpenChange,
  onTransfer,
  onDone,
}: {
  warehouseId: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const leave = async () => {
    setBusy(true);
    setError(null);
    const result = await leaveWarehouse(warehouseId);
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Left warehouse",
        description: "You are no longer a member.",
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave warehouse?</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "You are the owner of this warehouse. Transfer ownership first, then you can leave."
              : "You will lose access to this warehouse. Members with higher roles can re-invite you."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {isOwner ? "Close" : "Cancel"}
          </Button>
          {isOwner ? (
            <Button onClick={onTransfer}>
              <Crown aria-hidden="true" />
              Transfer Ownership
            </Button>
          ) : (
            <Button variant="destructive" onClick={leave} disabled={busy}>
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              Leave warehouse
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferOwnershipDialog({
  warehouseId,
  members,
  open,
  onOpenChange,
  onDone,
}: {
  warehouseId: string;
  members: MemberListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [targetId, setTargetId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const transfer = async () => {
    if (!targetId) {
      setError("Select a member to transfer ownership to.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await transferOwnership({
      warehouseId,
      newOwnerId: targetId,
    });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Ownership transferred",
        description: "The selected member is now the owner.",
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            You will become a Manager. Only the new owner can manage ownership
            from now on.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-target">New owner</Label>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active members to transfer to.
            </p>
          ) : (
            <Select
              value={targetId}
              onValueChange={(value) => {
                if (value !== null) setTargetId(value);
              }}
            >
              <SelectTrigger size="default" className="w-full">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.displayName ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={transfer} disabled={busy || members.length === 0}>
            {busy ? "Transferring…" : "Transfer ownership"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
