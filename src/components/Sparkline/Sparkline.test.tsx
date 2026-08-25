import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("exposes an accessible name via role=img and aria-label", () => {
    render(<Sparkline data={[1, 2, 3, 4]} />);
    expect(screen.getByRole("img", { name: /trend chart: increasing/i })).toBeTruthy();
  });

  it("describes a decreasing trend", () => {
    render(<Sparkline data={[4, 3, 2, 1]} />);
    expect(screen.getByRole("img", { name: /trend chart: decreasing/i })).toBeTruthy();
  });

  it("describes a flat trend", () => {
    render(<Sparkline data={[2, 2, 2, 2]} />);
    expect(screen.getByRole("img", { name: /trend chart: flat/i })).toBeTruthy();
  });

  it("uses a custom label when provided", () => {
    render(<Sparkline data={[1, 2, 3]} label="TVL trend: increasing over 24 hours" />);
    expect(
      screen.getByRole("img", { name: "TVL trend: increasing over 24 hours" }),
    ).toBeTruthy();
  });

  it("includes a <title> element for tooltip/SR support", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    expect(container.querySelector("title")?.textContent).toBe("Trend chart: increasing");
  });
});
