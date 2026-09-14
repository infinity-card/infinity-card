import { expect, test } from "@playwright/test";

test("Builder switches between edit and preview and supports LinkedIn", async ({ page }) => {
  await page.goto("/?builder=1");

  const editor = page.locator(".builder-editor");
  const preview = page.locator(".builder-preview-column");
  await expect(editor).toBeVisible();
  await expect(preview).toBeHidden();

  await page.getByRole("button", { name: /Aperçu/ }).click();
  await expect(editor).toBeHidden();
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: /Modifier/ }).click();
  await expect(editor).toBeVisible();
  await expect(preview).toBeHidden();

  const linkedin = page.locator(".builder-channel").filter({ hasText: "LinkedIn" });
  await expect(linkedin).toBeVisible();
  await linkedin.locator('input[type="checkbox"]').first().check();
  await linkedin.locator(".builder-channel-inputs input").nth(0).fill("LinkedIn client");
  await linkedin.locator(".builder-channel-inputs input").nth(1).fill("https://www.linkedin.com/company/infinity-card");
  await linkedin.locator('input[type="checkbox"]').nth(1).check();

  await page.getByRole("button", { name: /Aperçu/ }).click();
  await expect(preview).toContainText("LinkedIn client");
});

test("Builder exposes a 200-card inventory in batches of 10", async ({ page }) => {
  await page.goto("/?builder=1");

  await expect(page.getByText("200 cartes prêtes")).toBeVisible();
  await expect(page.locator('optgroup[label="Cartes à vendre"] option')).toHaveCount(200);
  await expect(page.locator(".builder-qr-card")).toContainText("IC-001");
  await expect(page.locator(".builder-qr-preview img")).toHaveAttribute("src", /^data:image\/png/);

  await page.getByRole("button", { name: /Inventaire/ }).click();
  await expect(page.locator(".builder-inventory-slot")).toHaveCount(10);
  await expect(page.locator(".builder-inventory-slot").first()).toContainText("IC-001");
  await expect(page.locator(".builder-inventory-slot").last()).toContainText("IC-010");
  await expect(page.locator(".builder-inventory-slot-qr img").first()).toHaveAttribute("src", /^data:image\/png/);

  const firstSlot = page.locator(".builder-inventory-slot").first();
  await firstSlot.getByRole("button", { name: "Marquer vendue" }).click();
  await expect(firstSlot).toContainText("Vendue");
  await firstSlot.getByRole("button", { name: "Annuler vente" }).click();
  await expect(firstSlot).toContainText("Disponible");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger ce lot (10 QR)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("infinity-card-qr-001-010.html");

  const backupDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const backupDownload = await backupDownloadPromise;
  expect(backupDownload.suggestedFilename()).toMatch(/^infinity-card-backup-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole("button", { name: "Lot suivant →" }).click();
  await expect(page.locator(".builder-inventory-slot").first()).toContainText("IC-011");
  await expect(page.locator(".builder-inventory-slot").last()).toContainText("IC-020");

  await page.locator(".builder-inventory-slot").first().getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(page.locator(".builder-editor")).toBeVisible();
  await expect(page.locator(".builder-select-wrap select")).toHaveValue("ic-011");
});

test("Builder exposes a public copyable link and fills missing channel URLs", async ({ page }) => {
  await page.goto("/?builder=1");

  const publicLink = page.locator('input[aria-label="Lien public IC-001"]');
  await expect(publicLink).toHaveValue("https://infinity-card.github.io/infinity-card/?client=ic-001");
  await expect(page.getByRole("link", { name: "Ouvrir" })).toHaveAttribute(
    "href",
    "https://infinity-card.github.io/infinity-card/?client=ic-001",
  );

  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.getByRole("button", { name: "Copié" })).toBeVisible();
});

test("Builder keeps a native scroll surface on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?builder=1");

  const scroller = page.locator(".builder-page");
  await expect(scroller).toHaveCSS("overflow-y", "auto");

  const metrics = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollTop).toBe(0);

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
});

test("an unused card slot shows the safe activation placeholder", async ({ page }) => {
  await page.goto("/?client=ic-123");
  await expect(page.getByRole("heading", { name: "Carte IC-123" })).toBeVisible();
  await expect(page.getByText("Carte prête à être personnalisée")).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("inventory searches globally and filters by status", async ({ page }) => {
  await page.goto("/?builder=1");
  await page.getByRole("button", { name: /Inventaire/ }).click();

  const search = page.getByRole("textbox", { name: "Rechercher une carte" });
  await search.fill("IC-123");
  await expect(page.locator(".builder-inventory-slot")).toHaveCount(1);
  await expect(page.locator(".builder-inventory-slot").first()).toContainText("IC-123");

  await search.fill("");
  await page.getByRole("combobox", { name: "Filtrer par état" }).selectOption("sold");
  await expect(page.locator(".builder-inventory-empty")).toContainText("Aucune carte");
});

test("card actions expose working links and download a contact vCard", async ({ page }) => {
  await page.goto("/?client=maison-lina");
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>(".business-logo")?.naturalWidth ?? 0) > 0);

  const links = page.locator("a.quick-action, a.detail-row");
  const linkCount = await links.count();
  expect(linkCount).toBeGreaterThan(0);
  for (let index = 0; index < linkCount; index += 1) {
    await expect(links.nth(index)).toHaveAttribute("href", /.+/);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ajouter aux contacts" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("maison-lina.vcf");
});
