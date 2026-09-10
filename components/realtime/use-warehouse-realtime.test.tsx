import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWarehouseRealtime } from "@/components/realtime/use-warehouse-realtime";
import { openChannel } from "@/lib/realtime/channel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * Fake yang meniru semantik @supabase/realtime-js (bukan mock longgar):
 * - `channel(topik)` mengembalikan instance LAMA bila topik masih terdaftar.
 * - `removeChannel()` TIDAK menghapus topik dari registry (sesuai source
 *   realtime-js 2.112.3 — hanya unsubscribe async).
 * - `.on()` setelah `.subscribe()` melempar persis seperti error produksi:
 *   "cannot add `postgres_changes` callbacks ... after `subscribe()`".
 */
class FakeChannel {
  subscribed = false;
  private cbs: Array<(status: string) => void> = [];
  constructor(public topic: string) {}
  on(...args: unknown[]) {
    void args;
    if (this.subscribed) {
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`
      );
    }
    return this;
  }
  subscribe(cb: (status: string) => void) {
    this.subscribed = true;
    this.cbs.push(cb);
    cb("SUBSCRIBED");
    return this;
  }
  emit(status: string) {
    for (const cb of this.cbs) cb(status);
  }
  async unsubscribe() {
    // Sengaja TIDAK unregister — meniru lib asli.
  }
}

function makeLibLikeClient() {
  const registry = new Map<string, FakeChannel>();
  return {
    registry,
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1" } } },
      }),
    },
    channel(topic: string) {
      const existing = registry.get(topic);
      if (existing) return existing;
      const ch = new FakeChannel(topic);
      registry.set(topic, ch);
      return ch;
    },
    async removeChannel(ch: FakeChannel) {
      await ch.unsubscribe();
      return "ok";
    },
  };
}

const libClient = makeLibLikeClient();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => libClient,
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function trackUnhandled() {
  const errors: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    errors.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  return {
    errors,
    done: () => process.off("unhandledRejection", onUnhandled),
  };
}

function activeChannel(prefix: string): FakeChannel {
  const found = [...libClient.registry.values()]
    .filter((c) => c.topic.startsWith(prefix))
    .at(-1);
  if (!found) throw new Error(`no channel for ${prefix}`);
  return found;
}

describe("useWarehouseRealtime — channel collision", () => {
  beforeEach(() => {
    libClient.registry.clear();
  });

  it("openChannel tidak pernah mengembalikan instance yang sudah subscribe", () => {
    // Pin mekanisme: meniru kontrak realtime-js (channel() reuse +
    // removeChannel tanpa unregister). Tanpa helper ini, setup ulang
    // channel pasti menabrak instance lama.
    const first = libClient.channel("wh:probe");
    first.on("postgres_changes", {}, () => {});
    first.subscribe(() => {});
    const second = openChannel(
      libClient as never,
      "wh:probe"
    ) as unknown as FakeChannel;
    expect(second).not.toBe(first);
    expect(() => second.on("postgres_changes", {}, () => {})).not.toThrow();
  });

  it("remount cepat setelah subscribe tidak melempar (StrictMode)", async () => {
    const t = trackUnhandled();
    try {
      const first = renderHook(() => useWarehouseRealtime("wh-1"));
      await flush();
      expect(first.result.current).toBe("live");

      // Unmount → cleanup removeChannel (registry lib TETAP pegang topik,
      // seperti realtime-js asli) → mount lagi dalam tick yang sama.
      first.unmount();
      const second = renderHook(() => useWarehouseRealtime("wh-1"));
      await flush();

      expect(t.errors).toEqual([]);
      expect(second.result.current).toBe("live");
      second.unmount();
    } finally {
      t.done();
    }
  });

  it("retry setelah CHANNEL_ERROR memakai channel baru", async () => {
    const t = trackUnhandled();
    try {
      vi.useFakeTimers();
      const { result, unmount } = renderHook(() =>
        useWarehouseRealtime("wh-2")
      );
      await flush();
      expect(result.current).toBe("live");

      // Socket putus → status reconnecting + retry terjadwal.
      act(() => {
        activeChannel("wh:wh-2").emit("CHANNEL_ERROR");
      });
      expect(result.current).toBe("reconnecting");

      // Retry jalan: remove + recreate. Kode lama memakai ulang instance
      // yang sudah subscribe → throw (unhandledRejection).
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      await flush();

      expect(t.errors).toEqual([]);
      expect(result.current).toBe("live");
      unmount();
    } finally {
      t.done();
      vi.useRealTimers();
    }
  });
});
