import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { describe, expect, it, vi } from "vitest";
import { QueryErrorAlert } from "./QueryErrorAlert";

function renderAlert(props: Partial<React.ComponentProps<typeof QueryErrorAlert>> = {}) {
  const onRetry = vi.fn();
  render(
    <ChakraProvider>
      <QueryErrorAlert error={new Error("Boom")} onRetry={onRetry} {...props} />
    </ChakraProvider>,
  );
  return { onRetry };
}

describe("<QueryErrorAlert />", () => {
  it("renders the error message and a Retry button", () => {
    renderAlert({ error: new Error("Backend is down") });

    expect(screen.getByText("Backend is down")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("falls back to fallbackMessage when the error isn't an Error instance", () => {
    renderAlert({ error: "not an Error object", fallbackMessage: "Failed to load airdrops" });

    expect(screen.getByText("Failed to load airdrops")).toBeTruthy();
  });

  it("calls onRetry when the Retry button is clicked", () => {
    const { onRetry } = renderAlert();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders retry as a native <button>, so it's keyboard-operable (focusable, Enter/Space activate it) with no extra wiring", () => {
    renderAlert();

    // getByRole("button", ...) only matches a real <button> (or an
    // explicit role="button") — this fails on e.g. a styled <div
    // onClick>, which is the actual accessibility bug this test guards
    // against. Native buttons get Enter/Space activation for free from
    // the browser, which is why that behavior itself isn't re-simulated
    // here (jsdom doesn't implement it without additional tooling this
    // repo doesn't otherwise depend on).
    const button = screen.getByRole("button", { name: /retry/i });
    expect(button.tagName).toBe("BUTTON");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("shows a loading state on the Retry button while isRetrying is true", () => {
    renderAlert({ isRetrying: true });

    const button = screen.getByRole("button", { name: /retrying/i });
    expect(button.getAttribute("data-loading")).not.toBeNull();
  });
});
