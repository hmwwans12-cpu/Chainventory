import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #18: verifikasi signature QStash harus memakai RAW body (static unit).
 *
 * Tanda tangan Upstash dihitung dari byte mentah + URL. Bila verifier
 * membaca `request.json()` lalu `JSON.stringify` ulang (urutan kunci /
 * spasi berubah), signature valid akan DITOLAK di produksi sementara test
 * dengan body cantik tetap lolos. Test ini mengunci bahwa
 * `verifyQStashSignature` meneruskan byte mentah apa adanya ke
 * `Receiver.verify` (dan tidak menghabiskan body untuk handler).
 *
 * E2E penuh (tunnel + Upstash nyata) = NEED-RUNTIME, tidak dijalankan di sini.
 */
const seen: { signature: string; body: string; url: string }[] = [];

vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    verify(args: { signature: string; body: string; url: string }) {
      seen.push(args);
      return Promise.resolve(true);
    }
  },
}));

process.env.QSTASH_CURRENT_SIGNING_KEY ??= "test-current-key";
process.env.QSTASH_NEXT_SIGNING_KEY ??= "test-next-key";

const { verifyQStashSignature } = await import("@/lib/proof/verify-request");

beforeEach(() => {
  seen.length = 0;
});

describe("#18 raw-body fidelity QStash verify (unit)", () => {
  it("meneruskan byte mentah (urutan kunci + spasi utuh) ke Receiver", async () => {
    const raw = '{"b":2,"a":  1}\n';
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: raw,
      headers: { "upstash-signature": "v1=test" },
    });
    await expect(
      verifyQStashSignature(request, "http://localhost/x")
    ).resolves.toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body).toBe(raw);
    expect(seen[0]!.body).not.toBe(JSON.stringify(JSON.parse(raw)));
  });

  it("tidak menghabiskan body (handler masih bisa baca via clone)", async () => {
    const raw = '{"proofId":"p1"}';
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: raw,
      headers: { "upstash-signature": "v1=test" },
    });
    await verifyQStashSignature(request, "http://localhost/x");
    await expect(request.text()).resolves.toBe(raw);
  });
});
