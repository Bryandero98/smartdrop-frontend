import { renderHook } from "@/test/renderHook";
import { describe, expect, it } from "vitest";
import { useLiveAnnouncer } from "./useLiveAnnouncer";

describe("useLiveAnnouncer", () => {
  it("Test 1 — returns the initial message on first render", () => {
    const { result } = renderHook(() => useLiveAnnouncer("hello"));
    expect(result.current).toBe("hello");
  });

  it("Test 2 — updates once the message value actually changes", () => {
    let message = "first";
    const { result, rerender } = renderHook(() => useLiveAnnouncer(message));
    expect(result.current).toBe("first");

    message = "second";
    rerender();

    expect(result.current).toBe("second");
  });

  it("Test 3 — re-rendering with the same message value is a no-op (still returns that value)", () => {
    const message = "stable";
    const { result, rerender } = renderHook(() => useLiveAnnouncer(message));
    expect(result.current).toBe("stable");

    rerender();
    rerender();

    expect(result.current).toBe("stable");
  });

  it("Test 4 — an empty string is a valid message (used to represent 'nothing to announce yet')", () => {
    const { result } = renderHook(() => useLiveAnnouncer(""));
    expect(result.current).toBe("");
  });
});
