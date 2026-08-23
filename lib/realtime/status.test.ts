import { describe, expect, it } from "vitest";

import { STALE_THRESHOLD_MS, nextRealtimeStatus } from "@/lib/realtime/status";

describe("nextRealtimeStatus (DESIGN §63)", () => {
  it("subscribed / data selalu kembali ke live", () => {
    expect(nextRealtimeStatus("reconnecting", { type: "subscribed" })).toBe(
      "live"
    );
    expect(nextRealtimeStatus("outdated", { type: "subscribed" })).toBe("live");
    expect(nextRealtimeStatus("live", { type: "data" })).toBe("live");
  });

  it("lost mengubah live menjadi reconnecting", () => {
    expect(nextRealtimeStatus("live", { type: "lost" })).toBe("reconnecting");
  });

  it("lost saat reconnecting tetap reconnecting (tidak flicker)", () => {
    expect(nextRealtimeStatus("reconnecting", { type: "lost" })).toBe(
      "reconnecting"
    );
  });

  it("tick di bawah threshold mempertahankan reconnecting", () => {
    const event = {
      type: "tick" as const,
      reconnectMs: STALE_THRESHOLD_MS - 1,
    };
    expect(nextRealtimeStatus("reconnecting", event)).toBe("reconnecting");
  });

  it("tick mencapai threshold naik ke outdated", () => {
    const event = { type: "tick" as const, reconnectMs: STALE_THRESHOLD_MS };
    expect(nextRealtimeStatus("reconnecting", event)).toBe("outdated");
  });

  it("outdated tidak mundur tanpa konfirmasi koneksi", () => {
    expect(nextRealtimeStatus("outdated", { type: "lost" })).toBe("outdated");
    const tick = { type: "tick" as const, reconnectMs: 0 };
    expect(nextRealtimeStatus("outdated", tick)).toBe("outdated");
  });
});
