import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { describe, expect, it } from "vitest";
import LiveRegion from "./LiveRegion";

describe("LiveRegion", () => {
  it("renders the message inside a role=status element with aria-live=polite by default", () => {
    render(
      <ChakraProvider>
        <LiveRegion message="Leaderboard updated" />
      </ChakraProvider>,
    );

    const region = screen.getByRole("status");
    expect(region.textContent).toBe("Leaderboard updated");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
  });

  it("supports an assertive politeness level for urgent announcements", () => {
    render(
      <ChakraProvider>
        <LiveRegion message="Error occurred" politeness="assertive" />
      </ChakraProvider>,
    );

    expect(screen.getByRole("status").getAttribute("aria-live")).toBe(
      "assertive",
    );
  });

  it("is visually hidden but still present in the accessibility tree", () => {
    render(
      <ChakraProvider>
        <LiveRegion message="hidden text" />
      </ChakraProvider>,
    );

    const region = screen.getByRole("status");
    const style = window.getComputedStyle(region);
    // Chakra's VisuallyHidden clips content off-screen rather than using
    // display:none/visibility:hidden, which would remove it from the a11y
    // tree entirely and defeat the point of an aria-live region.
    expect(style.position).toBe("absolute");
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
  });
});
