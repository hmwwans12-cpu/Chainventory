import { describe, expect, it, vi } from "vitest";

import { unreadStore } from "./unread-store";

describe("unreadStore (P2-06)", () => {
  it("set memicu listener hanya bila nilai berubah", () => {
    const listener = vi.fn();
    const unsub = unreadStore.subscribe(listener);
    try {
      unreadStore.set(5);
      expect(unreadStore.getSnapshot()).toBe(5);
      expect(listener).toHaveBeenCalledTimes(1);

      unreadStore.set(5); // sama → tidak notify
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsub();
    }
  });

  it("adjust menambah/mengurangi dengan clamp >= 0", () => {
    const listener = vi.fn();
    const unsub = unreadStore.subscribe(listener);
    try {
      unreadStore.set(2);
      unreadStore.adjust(-1);
      expect(unreadStore.getSnapshot()).toBe(1);
      unreadStore.adjust(-10);
      expect(unreadStore.getSnapshot()).toBe(0);
    } finally {
      unsub();
    }
  });

  it("unsubscribe menghentikan notifikasi", () => {
    const listener = vi.fn();
    const unsub = unreadStore.subscribe(listener);
    unsub();
    unreadStore.set(9);
    expect(listener).not.toHaveBeenCalled();
    unreadStore.set(0);
  });
});
