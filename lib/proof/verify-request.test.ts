import { beforeAll, describe, expect, it } from "vitest";

const CRON_SECRET = "test-cron-secret-0123456789";

let verifyCronSecret: (r: Request) => Promise<boolean>;
let verifyQStashSignature: (r: Request) => Promise<boolean>;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.QSTASH_CURRENT_SIGNING_KEY = "current-signing-key-placeholder";
  process.env.QSTASH_NEXT_SIGNING_KEY = "next-signing-key-placeholder";
  ({ verifyCronSecret, verifyQStashSignature } =
    await import("@/lib/proof/verify-request"));
});

describe("verifyCronSecret", () => {
  it("accepts matching Authorization: Bearer <CRON_SECRET>", async () => {
    const request = new Request(
      "http://localhost/api/internal/proofs/reconcile",
      {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }
    );
    expect(await verifyCronSecret(request)).toBe(true);
  });

  it("rejects wrong secret", async () => {
    const request = new Request("http://localhost/x", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(await verifyCronSecret(request)).toBe(false);
  });

  it("rejects missing Authorization header", async () => {
    expect(await verifyCronSecret(new Request("http://localhost/x"))).toBe(
      false
    );
  });

  it("rejects non-Bearer scheme", async () => {
    const request = new Request("http://localhost/x", {
      headers: { authorization: `Basic ${CRON_SECRET}` },
    });
    expect(await verifyCronSecret(request)).toBe(false);
  });
});

describe("verifyQStashSignature", () => {
  it("rejects when Upstash-Signature header is missing", async () => {
    expect(await verifyQStashSignature(new Request("http://localhost/x"))).toBe(
      false
    );
  });

  it("rejects malformed signature (fail-closed)", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ proofId: "p1" }),
      headers: { "upstash-signature": "v1=deadbeef" },
    });
    expect(await verifyQStashSignature(request)).toBe(false);
  });

  it("rejects garbage base64 signature (fail-closed)", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: "not-json",
      headers: { "upstash-signature": "v1=bm90LWEtcmVhbC1zaWduYXR1cmU" },
    });
    expect(await verifyQStashSignature(request)).toBe(false);
  });
});
