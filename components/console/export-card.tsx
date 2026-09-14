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
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";

/** Export DB/audit → CSV. Download memakai sesi browser (cookie) yang sama. */
export function ExportCard() {
  const { t } = useLocale();
  const download = (table: "proofs" | "audit_logs") => {
    const url = `/api/console/export?table=${table}&limit=5000`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.add({
      type: "info",
      title: t("console.export_toast_title"),
      description: t("console.export_toast_desc"),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.export_title")}</CardTitle>
        <CardDescription>{t("console.export_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="outline"
          size="default"
          onClick={() => download("proofs")}
          className="min-h-11"
        >
          <FileDown aria-hidden="true" />
          {t("console.export_proofs")}
        </Button>
        <Button
          variant="outline"
          size="default"
          onClick={() => download("audit_logs")}
          className="min-h-11"
        >
          <FileDown aria-hidden="true" />
          {t("console.export_audit")}
        </Button>
      </CardContent>
    </Card>
  );
}
