import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/0067_proof_deployment_reliability.sql"
  ),
  "utf8"
);

describe("0067 proof and deployment reliability", () => {
  it("returns and validates a lease token for processor transitions", () => {
    expect(sql).toMatch(/returns table \([\s\S]*lease_token text/);
    expect(sql).toMatch(
      /ob\.status = 'leased'[\s\S]*ob\.lease_expires_at <= now\(\)/
    );
    expect(sql).toMatch(
      /p_lease_token text[\s\S]*v_outbox\.lease_token is distinct from p_lease_token/
    );
    expect(sql).toContain("proof_requeue(uuid, text, timestamptz, text)");
    expect(sql).toContain("proof_mark_manual(uuid, text, text)");
  });

  it("makes stale pending and expired leases reconcilable", () => {
    expect(sql).toMatch(
      /ob\.status = 'pending'[\s\S]*updated_at < now\(\) - interval '10 minutes'/
    );
    expect(sql).toMatch(
      /ob\.status = 'leased'[\s\S]*lease_expires_at <= now\(\)/
    );
    expect(sql).toMatch(
      /p\.status in \('pending', 'retrying'\)[\s\S]*not exists/
    );
  });

  it("retains the two-confirmation and terminal activity behavior", () => {
    expect(sql).toContain("confirmed status requires confirmation_count >= 2");
    expect(sql).toContain("last_activity_at = now()");
    expect(sql).toContain("proof_manual_review");
    expect(sql).toContain("private.notify_proof_event");
  });

  it("resolves deployment audit ownership when legacy callers pass null", () => {
    expect(sql).toMatch(/p_entity = 'warehouses'/);
    expect(sql).toMatch(/p_entity = 'warehouse_deployments'/);
    expect(sql).toMatch(/select warehouse_id into v_warehouse_id/);
  });
});
