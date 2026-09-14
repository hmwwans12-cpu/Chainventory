"use client";

import { FileWarning } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { ErrorEntry } from "@/lib/console/types";
import { useLocale } from "@/components/providers/locale-provider";

function shortHash(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}\u2026${value.slice(-tail)}`;
}

/** Error summary terstruktur + korelasi request (movement) / proof / tx. */
export function ErrorSummary({ errors }: { errors: ErrorEntry[] }) {
  const { t } = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.errors_title")}</CardTitle>
        <CardDescription>{t("console.errors_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {errors.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            bare
            title={t("console.errors_empty_title")}
            description={t("console.errors_empty_desc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("console.th_status")}</TableHead>
                  <TableHead>{t("console.th_proof")}</TableHead>
                  <TableHead>{t("console.th_movement")}</TableHead>
                  <TableHead>{t("settings.warehouse")}</TableHead>
                  <TableHead>{t("console.th_tx")}</TableHead>
                  <TableHead>{t("console.th_error")}</TableHead>
                  <TableHead className="text-right">
                    {t("console.th_attempts")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <StatusBadge
                        tone={
                          entry.status === "manual_review"
                            ? "warning"
                            : "failed"
                        }
                        label={
                          entry.status === "manual_review"
                            ? t("console.status_manual")
                            : t("console.status_failed")
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground font-mono text-sm">
                        {entry.id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-sm">
                        {entry.movementId ? entry.movementId.slice(0, 8) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground max-w-36 truncate text-sm">
                        {entry.warehouseName ?? shortHash(entry.warehouseId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-sm">
                        {entry.txHash ? shortHash(entry.txHash, 6, 4) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              tabIndex={0}
                              className="text-muted-foreground block max-w-56 truncate text-sm"
                            />
                          }
                        >
                          {entry.error ?? "—"}
                        </TooltipTrigger>
                        <TooltipContent>{entry.error}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground font-mono text-sm tabular-nums">
                        {entry.attemptCount}
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
