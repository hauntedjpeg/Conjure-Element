import { expect, OVERLAY, snapshotPage, test } from "./fixtures";

test.describe("overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/basic/");
  });

  test("toolbar action toggles the overlay", async ({ page, toggle }) => {
    await expect(page.locator(OVERLAY)).toHaveCount(0);

    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
    await expect(
      page.getByRole("complementary", { name: "Conjure Element inspector" }),
    ).toBeVisible();

    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test("Esc exits", async ({ page, toggle }) => {
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test("Esc exits while focus is inside a child frame", async ({ page, toggle }) => {
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
    await page.frameLocator("#child").locator("#inner").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test("Esc is not leaked to the page while inspecting", async ({ page, toggle }) => {
    await page.evaluate(() => {
      (window as { escapes?: number }).escapes = 0;
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") (window as { escapes?: number }).escapes = 1;
      });
    });
    await toggle(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    expect(await page.evaluate(() => (window as { escapes?: number }).escapes)).toBe(0);

    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (window as { escapes?: number }).escapes)).toBe(1);
  });

  test("close button exits and the overlay can be reopened", async ({ page, toggle }) => {
    await toggle(page);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(page.locator(OVERLAY)).toHaveCount(0);

    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
  });

  test("the panel mounts only in the top frame", async ({ page, toggle }) => {
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
    await expect(page.locator(`${OVERLAY} .panel`)).toHaveCount(1);

    // Every frame has an overlay, for its own highlight; only one has a panel.
    const child = page.frameLocator("#child");
    await expect(child.locator(OVERLAY)).toHaveCount(1);
    await expect(child.locator(`${OVERLAY} .panel`)).toHaveCount(0);

    await toggle(page);
    await expect(child.locator(OVERLAY)).toHaveCount(0);
  });

  test("page styles do not reach the overlay", async ({ page, toggle }) => {
    await toggle(page);
    const host = await page.locator(OVERLAY).evaluate((el) => {
      const style = getComputedStyle(el);
      return { display: style.display, position: style.position, opacity: style.opacity };
    });
    expect(host).toEqual({ display: "block", position: "fixed", opacity: "1" });

    const title = await page.locator(`${OVERLAY} .title`).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        color: style.color,
        fontSize: style.fontSize,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        fontFamily: style.fontFamily,
      };
    });
    expect(title.color).not.toBe("rgb(255, 0, 0)");
    expect(title.fontSize).toBe("13px");
    expect(title.letterSpacing).toBe("normal");
    expect(title.textTransform).toBe("none");
    expect(title.fontFamily).not.toContain("Comic Sans");

    const panel = await page.locator(`${OVERLAY} .panel`).evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderTopWidth };
    });
    expect(panel.background).not.toBe("rgb(0, 255, 0)");
    expect(panel.border).toBe("1px");
  });

  test("the page is left exactly as it was found", async ({ page, toggle }) => {
    const before = await snapshotPage(page);

    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);
    expect(await snapshotPage(page)).not.toBe(before);

    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    expect(await snapshotPage(page)).toBe(before);

    await toggle(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    expect(await snapshotPage(page)).toBe(before);
  });
});

test.describe("production build", () => {
  test.use({ build: "production" });

  test("mounts the overlay in a closed shadow root", async ({ page, toggle }) => {
    await page.goto("/basic/");
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);

    const state = await page.locator(OVERLAY).evaluate((el) => ({
      shadowRoot: el.shadowRoot === null ? "closed" : "open",
      children: el.childNodes.length,
      attributes: el.attributes.length,
    }));
    expect(state).toEqual({ shadowRoot: "closed", children: 0, attributes: 0 });

    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test("exposes no test hooks", async ({ worker }) => {
    const hook = await worker.evaluate(() => "__conjureToggle" in globalThis);
    expect(hook).toBe(false);
  });
});
