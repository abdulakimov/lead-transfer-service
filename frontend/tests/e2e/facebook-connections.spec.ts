import { test, expect } from '@playwright/test';

test('facebook connect recovers when oauth returns empty pages then refresh resolves pages', async ({ page }) => {
  let stateValue = 'state-e2e-1';
  let connectionsFetchCount = 0;

  await page.addInitScript(() => {
    window.localStorage.setItem('leadflow_access_token', 'test-access-token');
  });

  await page.route('**/api/connections', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      connectionsFetchCount += 1;
      const body = connectionsFetchCount < 2
        ? []
        : [{
          id: 'conn-fb-1',
          provider: 'facebook',
          external_id: 'fb-user-1',
          name: 'Xurshidbek Abdulakimov',
          meta: {
            pages: [{ id: '1056259887566576', name: "Xurshidbek's", forms: [] }],
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'conn-fb-1',
          provider: 'facebook',
          external_id: 'fb-user-1',
          name: 'Xurshidbek Abdulakimov',
          meta: { pages: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/integrations/facebook/oauth/init', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        auth_url: 'about:blank',
        state: stateValue,
      }),
    });
  });

  await page.route('**/api/integrations/facebook/oauth/result?state=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'done',
        success: true,
        payload: {
          profile: { id: 'fb-user-1', name: 'Xurshidbek Abdulakimov', user_id: 'app-user-1' },
          pages: [],
          pixels: [],
          user_access_token: 'user-token-1',
        },
      }),
    });
  });

  await page.route('**/api/integrations/facebook/forms/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pages: [{ id: '1056259887566576', name: "Xurshidbek's", forms: [] }],
        total_pages: 1,
        total_forms: 0,
        errors: [],
      }),
    });
  });

  await page.goto('/connections');

  const facebookCard = page.locator('article').filter({ hasText: 'Facebook' });
  await expect(facebookCard).toBeVisible();

  const openSpy = await page.evaluateHandle(() => {
    const originalOpen = window.open.bind(window);
    const calls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__openCalls = calls;
    window.open = ((...args: Parameters<typeof window.open>) => {
      calls.push(String(args[0] ?? ''));
      return originalOpen(...args);
    }) as typeof window.open;
    return true;
  });
  await openSpy.dispose();

  await facebookCard.getByRole('button', { name: 'Ulash' }).click();

  await expect(page.locator('text=1 ta profil ulangan')).toBeVisible();
  await expect(page.locator('text=Facebook sahifalari topilmadi')).toHaveCount(0);
});
