"use client";

import { FileDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Export DB/audit → CSV. Download memakai sesi browser (cookie) yang sama. */
export function ExportCard() {
  const download = (table: "proofs" | "audit_logs") => {
    const url = `/api/console/export?table=${table}&limit=5000`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>
          Manual database export — proofs ledger or audit trail as CSV.
          Sensitive fields are never included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="outline"
          size="default"
          onClick={() => download("proofs")}
          className="min-h-11"
        >
          <FileDown aria-hidden="true" />
          Export proofs (CSV)
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => download("audit_logs")}
          className="min-h-11"
        >
          <FileDown aria-hidden="true" />
          Export audit logs (CSV)
        </Button>
      </CardContent>
    </Card>
  );
}
