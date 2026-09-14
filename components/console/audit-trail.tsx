"use client";

import { ScrollText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import type { AuditEntry } from "@/lib/console/types";
import { formatDateTime } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

function shortId(value: string | null): string {
  if (!value) return "—";
  return value.length > 12
    ? `${value.slice(0, 6)}\u2026${value.slice(-4)}`
    : value;
}

/** Trail audit (append-only) — termasuk log setiap manual retry proof. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const { t } = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.audit_title")}</CardTitle>
        <CardDescription>{t("console.audit_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            bare
            title={t("console.audit_empty_title")}
            description={t("console.audit_empty_desc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("console.th_action")}</TableHead>
                  <TableHead>{t("console.th_actor")}</TableHead>
                  <TableHead>{t("console.th_entity")}</TableHead>
                  <TableHead>{t("console.th_status")}</TableHead>
                  <TableHead className="text-right">
                    {t("console.th_when")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="text-foreground font-mono text-sm">
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground max-w-44 truncate text-sm">
                        {entry.actorEmail ?? shortId(entry.actorUserId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-sm">
                        {entry.entity} {shortId(entry.entityId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {entry.status ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground text-sm">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
