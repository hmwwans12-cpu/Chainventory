import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveStatus } from "@/hooks/use-live-status";

describe("useLiveStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mulai dari live agar mount pertama tidak flash Reconnecting", () => {
    const { result } = renderHook(() => useLiveStatus(2500));
    expect(result.current[0]).toBe("live");
  });

  it("upgrade ke live instan saat SUBSCRIBED", () => {
    const { result } = renderHook(() => useLiveStatus(2500));
    act(() => {
      result.current[1](false);
    });
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe("live");
  });

  it("downgrade hanya setelah grace period terlewati", () => {
    const { result } = renderHook(() => useLiveStatus(2500));
    act(() => {
      result.current[1](false);
    });
    // sebelum grace: tetap live (tidak flicker)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current[0]).toBe("live");
    // setelah grace: jujur menjadi reconnecting
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current[0]).toBe("reconnecting");
  });

  it("SUBSCRIBED membatalkan downgrade yang tertunda", () => {
    const { result } = renderHook(() => useLiveStatus(2500));
    act(() => {
      result.current[1](false);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current[1](true);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current[0]).toBe("live");
  });

  it("unmount membersihkan timer tanpa error", () => {
    const { result, unmount } = renderHook(() => useLiveStatus(2500));
    act(() => {
      result.current[1](false);
    });
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
  });
});
