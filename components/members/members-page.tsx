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
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "@/components/ui/toast";
import { ROLE_META } from "@/lib/inventory/status-meta";
import {
  canAssignRole,
  canManageRole,
  hasPermission,
  PERMISSIONS,
  ROLES,
  type Role,
} from "@/lib/auth/permissions";
import { approveJoin, changeMemberRole } from "@/lib/warehouses/members-client";
import type { MemberListItem, PendingJoinRequest } from "@/lib/members/types";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { PanelCard } from "@/components/shared/panel-card";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { formatDate, isValidEmail } from "@/lib/utils";
import { LeaveWarehouseDialog } from "@/components/members/dialogs/leave-warehouse-dialog";
import { RejectJoinDialog } from "@/components/members/dialogs/reject-join-dialog";
import { RemoveMemberDialog } from "@/components/members/dialogs/remove-member-dialog";
import { TransferOwnershipDialog } from "@/components/members/dialogs/transfer-ownership-dialog";

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
  // Audit v0.4.5: useOptimistic for member role changes. We sync the
  // server-provided members list into local state on every render so
  // router.refresh() (called after a successful role change) re-derives
  // the optimistic state to the server-confirmed value. The role pill
  // flips immediately on change; on success the server response
  // matches the optimistic value, on failure React rolls back the
  // optimistic update automatically when the transition unwinds.
  const [localMembers, setLocalMembers] =
    React.useState<MemberListItem[]>(members);
  React.useEffect(() => {
    setLocalMembers(members);
  }, [members]);
  const [optimisticMembers, setOptimisticMember] = React.useOptimistic<
    MemberListItem[],
    { membershipId: string; role: Role }
  >(localMembers, (current, { membershipId, role }) =>
    current.map((m) => (m.membershipId === membershipId ? { ...m, role } : m))
  );
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
    if (!isValidEmail(inviteEmail)) {
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

  // Audit v0.3.9 H-16: full reset of all invite state when the dialog
  // closes, so re-opening it doesn't leak previous email/role/sent values.
  const resetInviteState = () => {
    setInviteUrl(null);
    setInviteError(null);
    setInviteEmail("");
    setInviteSent(false);
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

  const [, startTransition] = React.useTransition();

  const handleRoleChange = async (member: MemberListItem, newRole: Role) => {
    setChanging((prev) => new Set(prev).add(member.membershipId));
    // Audit v0.4.5: optimistic UI for role changes. The row's role
    // pill flips to the new role before the RPC returns. Failure
    // rolls back automatically.
    startTransition(() => {
      setOptimisticMember({
        membershipId: member.membershipId,
        role: newRole,
      });
    });
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
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger aria-label="Warehouse">
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
          <div className="border-border flex min-w-0 flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5">
            <span className="text-muted-foreground text-sm">Invite code</span>
            <span className="truncate font-mono text-sm tracking-wide">
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
              if (!open) resetInviteState();
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
                      className="bg-muted text-foreground flex-1 truncate rounded-md px-2 py-1.5 font-mono text-sm"
                    >
                      {`${typeof window !== "undefined" ? window.location.origin : ""}${inviteUrl}`}
                    </code>
                    <CopyButton
                      text={`${typeof window !== "undefined" ? window.location.origin : ""}${inviteUrl}`}
                      label="Copy invite link"
                    />
                  </div>
                  <p className="text-muted-foreground text-sm">
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
                    <p className="text-destructive text-sm">{inviteError}</p>
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
                      <p className="text-muted-foreground truncate text-sm">
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

      {localMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teammates yet"
          description="Invite teammates with the warehouse code, or share the invite link above to get started."
          primaryAction={
            canInvite
              ? {
                  label: "Invite member",
                  onClick: () => setInviteOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <PanelCard padding="none">
          <div className="hidden overflow-x-auto md:block">
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
                {optimisticMembers.map((member) => {
                  const isSelf = member.userId === myUserId;
                  const manageable =
                    !isSelf &&
                    member.role !== "OWNER" &&
                    canAssignRole(role, member.role);
                  const assignable = ROLES.filter(
                    (r) =>
                      r !== "OWNER" &&
                      canAssignRole(role, r) &&
                      r !== member.role
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
                          <span className="text-muted-foreground text-sm">
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
                                : "suspended"
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
                      <TableCell className="text-muted-foreground hidden text-sm tabular-nums lg:table-cell">
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
            {optimisticMembers.map((member) => {
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
                    : "suspended";
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
                    <p className="text-muted-foreground mt-0.5 text-sm">
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
                        <span className="text-muted-foreground text-sm">
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
          open
          onOpenChange={(open) => {
            if (!open) setRejectTarget(null);
          }}
          onDone={refresh}
        />
      ) : null}
      {removeTarget ? (
        <RemoveMemberDialog
          warehouseId={warehouseId}
          member={removeTarget}
          open
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          onDone={refresh}
        />
      ) : null}
      {leaveTarget ? (
        <LeaveWarehouseDialog
          warehouseId={warehouseId}
          isOwner={isOwner}
          open
          onOpenChange={(open) => {
            if (!open) setLeaveTarget(null);
          }}
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
          members={localMembers.filter(
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
