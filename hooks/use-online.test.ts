import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useOnline } from "@/hooks/use-online";

/**
 * Unit test status online/offline (DESIGN §63, TODO P2).
 * jsdom: navigator.onLine dimanipulasi via defineProperty + event nyata.
 */

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useOnline", () => {
  it("default online saat SSR lalu sinkron dengan navigator.onLine", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it("event offline → false", () => {
    const { result } = renderHook(() => useOnline());
    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("kembali online → true", () => {
    const { result } = renderHook(() => useOnline());
    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
