import { test, expect, type Page, type Route } from '@playwright/test';

// #96: Prices/Airdrops/Webhooks/Alerts pages must offer a visible Retry
// affordance on a failed backend query, and recovering from a transient
// failure must not require a full page reload. This spec exercises that
// against the Airdrops page (no wallet/Freighter dependency, simplest of
// the four) by intercepting its backend call directly — same page.route
// pattern e2e/farm.spec.ts uses for Horizon/Soroban RPC mocking, just
// against smartdrop-backend's plain JSON REST API instead of XDR-encoded
// Soroban RPC.

const AIRDROPS_SUCCESS_BODY = {
  airdrops: [
    {
      id: 'a1',
      name: 'Genesis Drop',
      asset: 'XLM',
      asset_issuer: '',
      total_amount: 1000,
      expiry_ledger: 123456,
      status: 'completed',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
};

async function mockAirdropsFailThenSucceed(page: Page): Promise<void> {
  let callCount = 0;

  await page.route('**/api/v1/airdrops**', async (route: Route) => {
    callCount += 1;
    if (callCount === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Bad request from mock' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIRDROPS_SUCCESS_BODY),
    });
  });
}

test.describe('Backend-query retry affordance (#96)', () => {
  test('Airdrops: Retry button recovers a failed query without a page reload', async ({
    page,
  }) => {
    await mockAirdropsFailThenSucceed(page);

    let navigationCount = 0;
    page.on('load', () => {
      navigationCount += 1;
    });

    await page.goto('/airdrops');

    // Error state with a Retry button.
    await expect(page.getByText('Bad request from mock')).toBeVisible();
    const retryButton = page.getByRole('button', { name: /retry/i });
    await expect(retryButton).toBeVisible();

    // Full-page navigations after the initial goto('/airdrops') load would
    // mean a reload happened — there must be none.
    const loadCountBeforeRetry = navigationCount;

    await retryButton.click();

    // Success data renders in place.
    await expect(page.getByText('Genesis Drop')).toBeVisible();

    expect(navigationCount).toBe(loadCountBeforeRetry);
  });

  test('Retry button is keyboard-operable: Enter recovers the page', async ({ page }) => {
    await mockAirdropsFailThenSucceed(page);
    await page.goto('/airdrops');

    const retryButton = page.getByRole('button', { name: /retry/i });
    await expect(retryButton).toBeVisible();

    await retryButton.focus();
    await expect(retryButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Genesis Drop')).toBeVisible();
  });
});
