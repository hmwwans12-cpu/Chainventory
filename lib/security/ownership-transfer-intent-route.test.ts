import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("durable ownership transfer route wiring (static)", () => {
  it("uses prepare/resume/record/confirm boundaries", () => {
    const route = file("app/api/warehouses/membership/route.ts");
    expect(route).toContain('action === "transfer_resume"');
    expect(route).toContain("prepare_ownership_transfer_intent");
    expect(route).toContain("get_active_ownership_transfer_intent");
    expect(route).toContain("record_ownership_transfer_tx");
    expect(route).toContain("confirm_ownership_transfer_intent");
    expect(route).toContain("verifyOwnershipTransferCall");
    expect(route).toContain("OWNERSHIP_INTENT_EXPIRED");
  });

  it("persists and resumes the client intent draft", () => {
    const client = file("lib/warehouses/members-client.ts");
    const dialog = file(
      "components/members/dialogs/transfer-ownership-dialog.tsx"
    );
    const storage = file("lib/warehouses/ownership-transfer.ts");
    expect(client).toContain("resumeOwnershipTransfer");
    expect(dialog).toContain("readOwnershipTransferDraft");
    expect(dialog).toContain("writeOwnershipTransferDraft");
    expect(storage).toContain("24 * 60 * 60 * 1000");
  });

  it("schedules bounded intent cleanup", () => {
    const route = file(
      "app/api/internal/warehouses/ownership-intents/reconcile/route.ts"
    );
    const vercel = file("vercel.json");
    expect(route).toContain("verifyCronSecret");
    expect(route).toContain("reconcileOwnershipTransferIntents");
    expect(vercel).toContain(
      "/api/internal/warehouses/ownership-intents/reconcile"
    );
  });
});
