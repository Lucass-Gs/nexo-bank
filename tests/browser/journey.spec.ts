import { test, expect } from "@playwright/test";
test("complete user journey and responsive layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "Demo1234!");
  await page.getByRole("button", { name: "Entrar", exact: false }).click();
  await expect(page.locator("header")).toBeVisible();
  await expect(
    page.getByText("Disponível · BRL", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Conta de destino", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Valor em reais", { exact: true }).fill("1.00");
  await page.getByRole("button", { name: "Transferir valor fictício" }).click();
  await expect(page.locator(".order").first()).toContainText("Concluída", {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Verificar invariantes" }).click();
  await expect(
    page.getByText(/journals · 0 desequilíbrios · 0 divergências/),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 1440)
      await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
  }
  expect(errors).toEqual([]);
});
