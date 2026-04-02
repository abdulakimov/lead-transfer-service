import { expect, test } from "@playwright/test";

test("integration settings page renders schema-driven editor and submits update", async ({ page }) => {
  let updatePayload: Record<string, unknown> | null = null;

  await page.addInitScript(() => {
    window.localStorage.setItem("leadflow_access_token", "test-access-token");
    window.localStorage.setItem("leadflow_refresh_token", "test-refresh-token");
    window.localStorage.setItem(
      "leadflow_user",
      JSON.stringify({
        id: "user-1",
        email: "test@leadflow.uz",
        name: "Test User",
      }),
    );
  });

  await page.route("**/api/integrations/test-integration-id", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-integration-id",
          name: "Meta -> Bitrix Sales",
          active: true,
          source_type: "facebook",
          source_connection_id: "conn-fb-1",
          source_page_id: "page-1",
          source_form_id: "form-1",
          dest_type: "bitrix24",
          dest_connection_id: null,
          dest_resource_id: null,
          dest_sheet_name: null,
          dest_credentials_preview: "https://example.bitrix24.ru/rest/1/token/",
          dest_credentials_set: true,
          field_mapping: { EMAIL: "EMAIL_WORK" },
          dedup_enabled: true,
          dedup_field: "phone",
          notify_telegram_chat_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    if (method === "PUT") {
      updatePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-integration-id",
          name: updatePayload.name,
          active: true,
          source_type: "facebook",
          source_connection_id: "conn-fb-1",
          source_page_id: "page-1",
          source_form_id: "form-1",
          dest_type: "bitrix24",
          dest_connection_id: null,
          dest_resource_id: null,
          dest_sheet_name: null,
          dest_credentials_preview: "https://example.bitrix24.ru/rest/1/token/",
          dest_credentials_set: true,
          field_mapping: updatePayload.field_mapping,
          dedup_enabled: true,
          dedup_field: "phone",
          notify_telegram_chat_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/integrations/bitrix/fields/by-integration?integration_id=test-integration-id", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fields: [
          { code: "EMAIL_WORK", title: "Email", type: "string", required: false, multiple: false },
          { code: "PHONE_WORK", title: "Phone", type: "string", required: false, multiple: false },
        ],
        total: 2,
      }),
    });
  });

  await page.route("**/api/integrations/test-integration-id/bitrix/fields", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fields: [
          { code: "EMAIL_WORK", title: "Email", type: "string", required: false, multiple: false },
          { code: "PHONE_WORK", title: "Phone", type: "string", required: false, multiple: false },
        ],
        total: 2,
      }),
    });
  });

  await page.route("**/api/integrations/facebook/form-fields", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fields: [
          { key: "EMAIL", label: "Email", type: "text" },
          { key: "PHONE", label: "Phone", type: "text" },
        ],
        total: 2,
      }),
    });
  });

  await page.route("**/api/connections", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "conn-fb-1",
          provider: "facebook",
          external_id: "fb-user-1",
          name: "Xurshidbek Abdulakimov",
          meta: {
            pages: [{ id: "page-1", name: "Xurshidbek's", forms: [{ id: "form-1", name: "Lead form 1" }] }],
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        user: {
          id: "user-1",
          email: "test@leadflow.uz",
          name: "Test User",
        },
      }),
    });
  });

  await page.route("**/api/meta-pixel/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configs: [] }),
    });
  });

  await page.route("**/api/meta-pixel/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ event: null }),
    });
  });

  await page.route("**/api/meta-capi/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ queued: false }),
    });
  });

  await page.goto("/login");
  await page.locator("#email").fill("test@leadflow.uz");
  await page.locator("#password").fill("password123");
  await page.locator("form").getByRole("button", { name: "Kirish" }).click();
  await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle");

  await page.goto("/integrations/test-integration-id", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.goto("/integrations/test-integration-id", { waitUntil: "domcontentloaded" });
  }

  const titleInput = page.locator('input[value="Meta -> Bitrix Sales"]').first();
  await expect(titleInput).toBeVisible();
  await expect(page.getByText("Field mapping")).toBeVisible();
  await expect(page.getByText("Xurshidbek Abdulakimov")).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Saqlash" });
  await expect(saveButton).toBeDisabled();

  await titleInput.fill("Meta -> Bitrix Sales Updated");
  await expect(page.getByText("Saqlanmagan o'zgarishlar")).toBeVisible();
  await expect(saveButton).toBeEnabled();

  await saveButton.click();

  await expect(page.getByText("Sozlamalar saqlandi.")).toBeVisible();
  await expect.poll(() => updatePayload).not.toBeNull();
  const payload = updatePayload as unknown as { name?: string; field_mapping?: Record<string, string> };
  expect(payload.name).toBe("Meta -> Bitrix Sales Updated");
  expect(payload.field_mapping).toEqual({ EMAIL: "EMAIL_WORK" });
});
