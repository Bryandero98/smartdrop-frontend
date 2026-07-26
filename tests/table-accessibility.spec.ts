import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Extends the pattern in contrast-audit.spec.ts to cover #86: aria-sort
// semantics and aria-live announcements on the Leaderboard/History tables.

function leaderboardEntry(i: number) {
  return {
    address: `GLEADER${String(i).padStart(3, "0")}${"A".repeat(45)}`.slice(0, 56),
    totalCredits: 1000 - i,
    totalStake: 500 - i,
    boostUtilization: 10,
  };
}

async function mockLeaderboardApi(page: Page, total: number): Promise<void> {
  await page.route("**/__mock-leaderboard-api**", async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const sort = url.searchParams.get("sort") ?? "credits";

    const all = Array.from({ length: total }, (_, i) => leaderboardEntry(i));
    all.sort((a, b) =>
      sort === "credits"
        ? b.totalCredits - a.totalCredits
        : b.totalStake - a.totalStake,
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        entries: all.slice(offset, offset + limit),
        total,
      }),
    });
  });
}

test.describe("Leaderboard aria-sort semantics (#86)", () => {
  test("aria-sort on Credits/Stake headers matches the active sort column, for both sort options", async ({
    page,
  }) => {
    await mockLeaderboardApi(page, 25);
    await page.goto("/leaderboard");

    const creditsHeader = page.getByRole("columnheader", { name: /credits/i });
    const stakeHeader = page.getByRole("columnheader", { name: /stake/i });

    await expect(creditsHeader).toHaveAttribute("aria-sort", "descending");
    await expect(stakeHeader).toHaveAttribute("aria-sort", "none");

    await page.getByRole("button", { name: "Stake" }).click();

    await expect(creditsHeader).toHaveAttribute("aria-sort", "none");
    await expect(stakeHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("the sort Select is programmatically associated with the table via aria-controls", async ({
    page,
  }) => {
    await mockLeaderboardApi(page, 25);
    await page.goto("/leaderboard");

    const select = page.getByRole("combobox");
    const controlsId = await select.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    const table = page.locator(`#${controlsId}`);
    await expect(table).toHaveCount(1);
    await expect(table).toHaveJSProperty("tagName", "TABLE");
  });

  test("changing the Select keeps aria-sort in sync (both controls drive the same state)", async ({
    page,
  }) => {
    await mockLeaderboardApi(page, 25);
    await page.goto("/leaderboard");

    await page.getByRole("combobox").selectOption("stake");

    await expect(
      page.getByRole("columnheader", { name: /stake/i }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  test("has no axe-core violations with a populated, sorted table", async ({
    page,
  }) => {
    await mockLeaderboardApi(page, 25);
    await page.goto("/leaderboard");
    await page.getByRole("button", { name: "Stake" }).click();
    await expect(
      page.getByRole("columnheader", { name: /stake/i }),
    ).toHaveAttribute("aria-sort", "descending");

    // Scoped to WCAG conformance rules, matching contrast-audit.spec.ts's
    // own approach of targeting a specific concern rather than asserting
    // zero violations against axe's full best-practice ruleset (which
    // includes pre-existing, unrelated gaps like page-has-heading-one —
    // out of scope for this table-sort/live-region issue).
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Leaderboard/History live-region announcements (#86)", () => {
  test("leaderboard exposes a polite, atomic live region announcing the loaded range", async ({
    page,
  }) => {
    await mockLeaderboardApi(page, 25);
    await page.goto("/leaderboard");

    const status = page.getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    await expect(status).toHaveText(/showing rank 1-10 of 25/i);
  });

  test("history exposes a live region (present even with no sort UI, per issue scope)", async ({
    page,
  }) => {
    await page.goto("/history");

    // Not connected: nothing to announce yet, but the region must still
    // exist in the accessibility tree so a screen reader is primed for
    // it once the wallet connects and history loads.
    const status = page.getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
  });
});
