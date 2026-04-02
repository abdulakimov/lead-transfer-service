# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration-settings-audit.spec.ts >> integration settings page renders schema-driven editor and submits update
- Location: tests\e2e\integration-settings-audit.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('input[value="Meta -> Bitrix Sales"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('input[value="Meta -> Bitrix Sales"]').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - button "Mavzu" [ref=e5] [cursor=pointer]:
        - img [ref=e6]
      - button "Til" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
    - generic [ref=e19]:
      - generic [ref=e20]:
        - button "Kirish" [ref=e21] [cursor=pointer]:
          - img [ref=e22]
          - text: Kirish
        - button "Ro'yxatdan o'tish" [ref=e25] [cursor=pointer]:
          - img [ref=e26]
          - text: Ro'yxatdan o'tish
      - button "Google orqali kirish" [ref=e29] [cursor=pointer]:
        - img [ref=e30]
        - text: Google orqali kirish
      - generic [ref=e35]: or
      - generic [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]: Email manzil
          - textbox "Email manzil" [ref=e41]
        - generic [ref=e42]:
          - generic [ref=e43]: Parol
          - generic [ref=e44]:
            - textbox "Parol" [ref=e45]
            - button "Parolni ko'rsatish" [ref=e46] [cursor=pointer]:
              - img [ref=e47]
        - button "Kirish" [ref=e50] [cursor=pointer]:
          - generic [ref=e51]:
            - img [ref=e52]
            - text: Kirish
      - paragraph [ref=e55]:
        - text: Hisobingiz yo'qmi?
        - button "Ro'yxatdan o'tish" [ref=e56] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e62] [cursor=pointer]:
    - img [ref=e63]
  - alert [ref=e66]
```

# Test source

```ts
  99  |     await route.fulfill({
  100 |       status: 200,
  101 |       contentType: "application/json",
  102 |       body: JSON.stringify({
  103 |         fields: [
  104 |           { code: "EMAIL_WORK", title: "Email", type: "string", required: false, multiple: false },
  105 |           { code: "PHONE_WORK", title: "Phone", type: "string", required: false, multiple: false },
  106 |         ],
  107 |         total: 2,
  108 |       }),
  109 |     });
  110 |   });
  111 | 
  112 |   await page.route("**/api/integrations/facebook/form-fields", async (route) => {
  113 |     await route.fulfill({
  114 |       status: 200,
  115 |       contentType: "application/json",
  116 |       body: JSON.stringify({
  117 |         fields: [
  118 |           { key: "EMAIL", label: "Email", type: "text" },
  119 |           { key: "PHONE", label: "Phone", type: "text" },
  120 |         ],
  121 |         total: 2,
  122 |       }),
  123 |     });
  124 |   });
  125 | 
  126 |   await page.route("**/api/connections", async (route) => {
  127 |     await route.fulfill({
  128 |       status: 200,
  129 |       contentType: "application/json",
  130 |       body: JSON.stringify([
  131 |         {
  132 |           id: "conn-fb-1",
  133 |           provider: "facebook",
  134 |           external_id: "fb-user-1",
  135 |           name: "Xurshidbek Abdulakimov",
  136 |           meta: {
  137 |             pages: [{ id: "page-1", name: "Xurshidbek's", forms: [{ id: "form-1", name: "Lead form 1" }] }],
  138 |           },
  139 |           created_at: new Date().toISOString(),
  140 |           updated_at: new Date().toISOString(),
  141 |         },
  142 |       ]),
  143 |     });
  144 |   });
  145 | 
  146 |   await page.route("**/api/auth/login", async (route) => {
  147 |     await route.fulfill({
  148 |       status: 200,
  149 |       contentType: "application/json",
  150 |       body: JSON.stringify({
  151 |         access_token: "test-access-token",
  152 |         refresh_token: "test-refresh-token",
  153 |         user: {
  154 |           id: "user-1",
  155 |           email: "test@leadflow.uz",
  156 |           name: "Test User",
  157 |         },
  158 |       }),
  159 |     });
  160 |   });
  161 | 
  162 |   await page.route("**/api/meta-pixel/config", async (route) => {
  163 |     await route.fulfill({
  164 |       status: 200,
  165 |       contentType: "application/json",
  166 |       body: JSON.stringify({ configs: [] }),
  167 |     });
  168 |   });
  169 | 
  170 |   await page.route("**/api/meta-pixel/events", async (route) => {
  171 |     await route.fulfill({
  172 |       status: 200,
  173 |       contentType: "application/json",
  174 |       body: JSON.stringify({ event: null }),
  175 |     });
  176 |   });
  177 | 
  178 |   await page.route("**/api/meta-capi/events", async (route) => {
  179 |     await route.fulfill({
  180 |       status: 200,
  181 |       contentType: "application/json",
  182 |       body: JSON.stringify({ queued: false }),
  183 |     });
  184 |   });
  185 | 
  186 |   await page.goto("/login");
  187 |   await page.locator("#email").fill("test@leadflow.uz");
  188 |   await page.locator("#password").fill("password123");
  189 |   await page.locator("form").getByRole("button", { name: "Kirish" }).click();
  190 |   await page.waitForURL("**/dashboard");
  191 |   await page.waitForLoadState("networkidle");
  192 | 
  193 |   await page.goto("/integrations/test-integration-id", { waitUntil: "domcontentloaded" });
  194 |   if (page.url().includes("/login")) {
  195 |     await page.goto("/integrations/test-integration-id", { waitUntil: "domcontentloaded" });
  196 |   }
  197 | 
  198 |   const titleInput = page.locator('input[value="Meta -> Bitrix Sales"]').first();
> 199 |   await expect(titleInput).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  200 |   await expect(page.getByText("Field mapping")).toBeVisible();
  201 |   await expect(page.getByText("Xurshidbek Abdulakimov")).toBeVisible();
  202 | 
  203 |   const saveButton = page.getByRole("button", { name: "Saqlash" });
  204 |   await expect(saveButton).toBeDisabled();
  205 | 
  206 |   await titleInput.fill("Meta -> Bitrix Sales Updated");
  207 |   await expect(page.getByText("Saqlanmagan o'zgarishlar")).toBeVisible();
  208 |   await expect(saveButton).toBeEnabled();
  209 | 
  210 |   await saveButton.click();
  211 | 
  212 |   await expect(page.getByText("Sozlamalar saqlandi.")).toBeVisible();
  213 |   await expect.poll(() => updatePayload).not.toBeNull();
  214 |   const payload = updatePayload as unknown as { name?: string; field_mapping?: Record<string, string> };
  215 |   expect(payload.name).toBe("Meta -> Bitrix Sales Updated");
  216 |   expect(payload.field_mapping).toEqual({ EMAIL: "EMAIL_WORK" });
  217 | });
  218 | 
```