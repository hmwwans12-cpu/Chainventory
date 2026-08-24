import { describe, expect, it, vi } from "vitest";

import { debounce } from "./debounce";

describe("debounce (P2-05)", () => {
  it("hanya memanggil sekali setelah hening walau event beruntun", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const wrapped = debounce(fn, 400);

    wrapped();
    vi.advanceTimersByTime(100);
    wrapped();
    vi.advanceTimersByTime(100);
    wrapped(); // burst 3 event realtime
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("cancel mencegah pemanggilan (cleanup effect)", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const wrapped = debounce(fn, 400);

    wrapped();
    wrapped.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("meneruskan argumen terakhir", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const wrapped = debounce(fn, 100);

    wrapped("a");
    wrapped("b");
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledWith("b");

    vi.useRealTimers();
  });
});
