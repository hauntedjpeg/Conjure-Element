import type { Frame, FrameLocator, Locator, Page } from "@playwright/test";
import { expect, OVERLAY, snapshotPage, test } from "./fixtures";

type Scope = Page | FrameLocator;
type Box = { x: number; y: number; width: number; height: number };

const panel = (page: Page) => page.locator(`${OVERLAY} .panel`);
const shield = (scope: Scope) => scope.locator(`${OVERLAY} .shield`);
const label = (scope: Scope) => scope.locator(`${OVERLAY} .label`);
const band = (scope: Scope, name: string) => scope.locator(`${OVERLAY} .band.${name}`);
const selection = (scope: Scope) => scope.locator(`${OVERLAY} .selection`);
const selector = (page: Page) => panel(page).locator(".summary .selector");
const rows = (page: Page) => panel(page).locator(".row");
const row = (page: Page, property: string) =>
  rows(page).filter({ has: page.getByText(property, { exact: true }) });

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) throw new Error("The element has no box");
  return box;
}

/**
 * The shield covers the page while picking, so Playwright's own hover and
 * click would wait forever for the element to become reachable.
 */
async function moveTo(page: Page, target: Locator): Promise<void> {
  const box = await boxOf(target);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
}

async function pick(page: Page, target: Locator): Promise<void> {
  await moveTo(page, target);
  const box = await boxOf(target);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function crumbs(page: Page): Promise<string[]> {
  const items = await panel(page).locator(".crumb").allTextContents();
  return items.map((text) => text.trim().replace(/\s+/g, " "));
}

function close(a: Box, b: Box): void {
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.y).toBeCloseTo(b.y, 1);
  expect(a.width).toBeCloseTo(b.width, 1);
  expect(a.height).toBeCloseTo(b.height, 1);
}

test.describe("picker", () => {
  test.beforeEach(async ({ page, toggle }) => {
    await page.goto("/picker/styles.html");
    await toggle(page);
    await expect(panel(page)).toBeVisible();
  });

  test("hover draws the box model and a label", async ({ page }) => {
    const box = page.locator("#box");
    await moveTo(page, box);
    await expect(label(page)).toBeVisible();

    // 200×60 content, 10/20 padding, 5 border, 30/0/15/25 margin.
    const border = await boxOf(box);
    expect(border.width).toBe(250);
    expect(border.height).toBe(90);
    close(await boxOf(band(page, "border")), border);
    close(await boxOf(band(page, "margin")), {
      x: border.x - 25,
      y: border.y - 30,
      width: 275,
      height: 135,
    });
    close(await boxOf(band(page, "padding")), {
      x: border.x + 5,
      y: border.y + 5,
      width: 240,
      height: 80,
    });
    close(await boxOf(band(page, "content")), {
      x: border.x + 25,
      y: border.y + 15,
      width: 200,
      height: 60,
    });

    await expect(label(page).locator(".tag")).toHaveText("div");
    await expect(label(page).locator(".id")).toHaveText("#box");
    await expect(label(page).locator(".classes")).toHaveText(".card.primary");
    await expect(label(page).locator(".size")).toHaveText("250 × 90");
  });

  test("the highlight follows the element when the page scrolls", async ({ page }) => {
    await moveTo(page, page.locator("#box"));
    await expect(band(page, "border")).toBeVisible();
    await page.mouse.wheel(0, 50);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(50);
    await expect
      .poll(async () => (await boxOf(band(page, "border"))).y)
      .toBeCloseTo((await boxOf(page.locator("#box"))).y, 1);
  });

  test("click freezes the selection and fills the panel", async ({ page }) => {
    await expect(panel(page)).toContainText("Click an element to inspect it.");
    await expect(shield(page)).toBeVisible();

    await pick(page, page.locator("#box"));
    await expect(selector(page)).toHaveText("div#box.card.primary");
    await expect(panel(page).locator(".summary .size")).toHaveText("250 × 90");

    // Picking is over: the shield is gone and the page is usable again.
    await expect(shield(page)).toBeHidden();
    await expect(label(page)).toBeHidden();
    close(await boxOf(selection(page)), await boxOf(page.locator("#box")));

    await page.locator("#counter").click();
    expect(await page.evaluate(() => (window as { clicks?: number }).clicks)).toBe(1);
  });

  test("the pick button resumes picking", async ({ page }) => {
    await pick(page, page.locator("#box"));
    const button = page.getByRole("button", { name: "Pick an element" });
    await expect(button).toHaveAttribute("aria-pressed", "false");

    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(shield(page)).toBeVisible();

    await pick(page, page.locator("#hoverable"));
    await expect(selector(page)).toHaveText("button#hoverable.btn");
  });

  test("the page hears nothing while picking", async ({ page }) => {
    await pick(page, page.locator("#counter"));
    await expect(selector(page)).toHaveText("button#counter");
    const state = await page.evaluate(() => {
      const scope = window as { clicks?: number; heard?: string[] };
      return { clicks: scope.clicks, heard: scope.heard, focus: document.activeElement?.id };
    });
    expect(state).toEqual({ clicks: 0, heard: [], focus: "" });
  });

  test("links do not navigate while picking", async ({ page }) => {
    const url = page.url();
    await pick(page, page.locator("#link"));
    await expect(selector(page)).toHaveText("a#link");
    expect(page.url()).toBe(url);
  });

  test("disabled controls can be picked", async ({ page }) => {
    await pick(page, page.locator("#disabled"));
    await expect(selector(page)).toHaveText("button#disabled");
  });

  test("styles are read while the element is not hovered", async ({ page }) => {
    await pick(page, page.locator("#hoverable"));
    await expect(row(page, "background-color").locator(".value")).toHaveText("rgb(0, 128, 0)");

    // The pointer is still over the button, and now the page can see it.
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.getElementById("hoverable") as Element).backgroundColor,
        ),
      )
      .toBe("rgb(200, 0, 0)");
  });

  test("the wheel reaches a scroller under the shield", async ({ page }) => {
    await moveTo(page, page.locator("#scroller"));
    await page.mouse.wheel(0, 120);
    await expect
      .poll(() => page.evaluate(() => document.getElementById("scroller")?.scrollTop))
      .toBe(120);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("lists only non-default properties until asked for all", async ({ page }) => {
    await pick(page, page.locator("#hoverable"));
    await expect(selector(page)).toHaveText("button#hoverable.btn");
    const properties = await rows(page).locator(".property").allTextContents();
    expect(properties).toEqual(
      expect.arrayContaining([
        "display",
        "column-gap",
        "padding-left",
        "color",
        "background-color",
        "opacity",
      ]),
    );
    expect(properties).not.toContain("visibility");
    expect(properties).not.toContain("margin-block-start");
    expect(properties.length).toBeLessThan(40);

    await panel(page).getByLabel("Show all computed").check();
    await expect(row(page, "visibility")).toHaveClass(/default/);
    expect(await rows(page).count()).toBeGreaterThan(200);
    await expect(row(page, "opacity")).not.toHaveClass(/default/);
  });

  test("groups properties by category", async ({ page }) => {
    await pick(page, page.locator("#hoverable"));
    const groups = panel(page).locator(".group");
    await expect(groups.locator("h3")).toContainText(["Layout", "Box", "Color", "Effects"]);
    await expect(panel(page).locator('.group[data-category="effects"] .row .property')).toHaveText([
      "opacity",
    ]);
  });

  test("search filters by property and by value", async ({ page }) => {
    await pick(page, page.locator("#hoverable"));
    const search = panel(page).getByLabel("Filter styles");

    await search.fill("padding");
    await expect(rows(page).locator(".property")).toHaveText([
      "padding-bottom",
      "padding-left",
      "padding-right",
      "padding-top",
    ]);

    await search.fill("128");
    await expect(rows(page).locator(".property")).toHaveText(["background-color"]);

    await search.fill("no such thing");
    await expect(panel(page)).toContainText("No matching properties.");

    // The filter carries over to the next element.
    await search.fill("opacity");
    await page.getByRole("button", { name: "Pick an element" }).click();
    await pick(page, page.locator("#box"));
    await expect(selector(page)).toHaveText("div#box.card.primary");
    await expect(search).toHaveValue("opacity");
    await expect(rows(page)).toHaveCount(0);
  });

  test("typing in the panel is not heard by the page", async ({ page }) => {
    await pick(page, page.locator("#box"));
    await page.evaluate(() => {
      const scope = window as { keys?: string[] };
      scope.keys = [];
      for (const type of ["keydown", "keyup", "input"]) {
        document.addEventListener(type, () => scope.keys?.push(type));
      }
    });
    const search = panel(page).getByLabel("Filter styles");
    await search.click();
    await page.keyboard.type("ab");
    await page.keyboard.press("ArrowLeft");
    await expect(search).toHaveValue("ab");
    expect(await page.evaluate(() => (window as { keys?: string[] }).keys)).toEqual([]);
    // The arrow moved the caret; it did not move the selection.
    await expect(selector(page)).toHaveText("div#box.card.primary");
  });

  test("arrow keys walk the tree", async ({ page }) => {
    await pick(page, page.locator("#two"));
    await expect(selector(page)).toHaveText("li#two");

    await page.keyboard.press("ArrowRight");
    await expect(selector(page)).toHaveText("li#three");
    await page.keyboard.press("ArrowRight");
    await expect(selector(page)).toHaveText("li#three");

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(selector(page)).toHaveText("li#one");

    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("ul#list");
    await page.keyboard.press("ArrowDown");
    await expect(selector(page)).toHaveText("li#one");

    close(await boxOf(selection(page)), await boxOf(page.locator("#one")));
  });

  test("arrow keys skip the head and the inspector itself", async ({ page }) => {
    await pick(page, page.locator("#box"));
    await expect(selector(page)).toHaveText("div#box.card.primary");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("html");
    await page.keyboard.press("ArrowDown");
    await expect(selector(page)).toHaveText("body");
    await page.keyboard.press("ArrowRight");
    await expect(selector(page)).toHaveText("body");
  });

  test("arrow keys are left alone while typing in the page", async ({ page }) => {
    await pick(page, page.locator("#box"));
    const field = page.locator("#field");
    await field.focus();
    await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("!");
    await expect(field).toHaveValue("tex!t");
    await expect(selector(page)).toHaveText("div#box.card.primary");
  });

  test("arrow keys scroll only as far as it takes to see the selection", async ({ page }) => {
    await pick(page, page.locator("#scroller"));
    await expect(selector(page)).toHaveText("div#scrolled");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    await expect(selector(page)).toHaveText("div#spacer");
    await page.keyboard.press("ArrowRight");
    await expect(selector(page)).toHaveText("p#far");
    await expect(page.locator("#far")).toBeInViewport();
  });

  test("breadcrumb clicks select an ancestor", async ({ page }) => {
    await pick(page, page.locator("#two-child"));
    await expect(selector(page)).toHaveText("span#two-child");
    expect(await crumbs(page)).toEqual(["html", "body", "ul#list", "li#two", "span#two-child"]);

    await panel(page).getByRole("button", { name: "ul#list" }).click();
    await expect(selector(page)).toHaveText("ul#list");
    expect(await crumbs(page)).toEqual(["html", "body", "ul#list"]);
    close(await boxOf(selection(page)), await boxOf(page.locator("#list")));
  });

  test("leaves every frame as it found it", async ({ page, toggle }) => {
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    const before = await snapshotPage(page);

    await toggle(page);
    await pick(page, page.locator("#box"));
    await expect(selector(page)).toHaveText("div#box.card.primary");
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("body");
    // The baseline frame exists by now, and the page cannot count it.
    expect(page.frames().some((frame) => frame.name() === "__conjure_baseline")).toBe(true);
    expect(await page.evaluate(() => window.length)).toBe(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    expect(await snapshotPage(page)).toBe(before);
    expect(page.frames().some((frame) => frame.name() === "__conjure_baseline")).toBe(false);
  });
});

test.describe("picker: shadow DOM", () => {
  test.beforeEach(async ({ page, toggle }) => {
    await page.goto("/picker/shadow.html");
    await toggle(page);
    await expect(panel(page)).toBeVisible();
  });

  test("selects inside nested open roots, not the host", async ({ page }) => {
    const dot = page.locator("#card #badge .dot");
    await moveTo(page, dot);
    await expect(label(page).locator(".tag")).toHaveText("span");
    await expect(label(page).locator(".classes")).toHaveText(".dot");
    close(await boxOf(band(page, "border")), await boxOf(dot));

    await pick(page, dot);
    await expect(selector(page)).toHaveText("span#dot.dot");
    await expect(row(page, "background-color").locator(".value")).toHaveText("rgb(200, 0, 80)");
    expect(await crumbs(page)).toEqual([
      "html",
      "body",
      "picker-card#card",
      "#shadow-root",
      "picker-badge#badge",
      "#shadow-root",
      "span#dot.dot",
    ]);
  });

  test("routes slotted content through its slot", async ({ page }) => {
    await pick(page, page.locator("#slotted-body"));
    await expect(selector(page)).toHaveText("p#slotted-body");
    expect(await crumbs(page)).toEqual([
      "html",
      "body",
      "picker-card#card",
      "#shadow-root",
      "div.body",
      "slot",
      "p#slotted-body",
    ]);

    // Up follows the flattened tree, so the parent is the slot, not the host.
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("slot");
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("div.body");
    await page.keyboard.press("ArrowLeft");
    await expect(selector(page)).toHaveText("header.header");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(selector(page)).toHaveText("h2#slotted-title");
  });

  test("a crumb above a shadow boundary selects the host", async ({ page }) => {
    await pick(page, page.locator("#card #badge .dot"));
    await panel(page).getByRole("button", { name: "picker-card#card" }).click();
    await expect(selector(page)).toHaveText("picker-card#card");
    await page.keyboard.press("ArrowDown");
    await expect(selector(page)).toHaveText("header.header");
  });

  test("a closed shadow root is reported and not entered", async ({ page }) => {
    const vault = page.locator("#vault");
    await moveTo(page, vault);
    await expect(label(page).locator(".tag")).toHaveText("picker-vault");
    await expect(label(page).locator(".note")).toHaveText("closed shadow root");

    await pick(page, vault);
    await expect(selector(page)).toHaveText("picker-vault#vault");
    await expect(panel(page).locator('[data-notice="closed-root"]')).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(selector(page)).toHaveText("picker-vault#vault");
  });

  test("an element with no shadow root carries no notice", async ({ page }) => {
    await pick(page, page.locator("#plain-child"));
    await expect(selector(page)).toHaveText("span#plain-child");
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("plain-element#plain");
    await expect(panel(page).locator(".notice")).toHaveCount(0);
  });
});

test.describe("picker: frames", () => {
  const frameOf = (page: Page, name: string): Frame => {
    const frame = page.frame({ name });
    if (!frame) throw new Error(`No frame named ${name}`);
    return frame;
  };

  test.beforeEach(async ({ page, toggle }) => {
    await page.goto("/picker/frames.html");
    await expect(page.frameLocator("#same").locator("#inner")).toBeVisible();
    await expect(page.frameLocator("#cross").locator("#inner")).toBeVisible();
    await toggle(page);
    await expect(panel(page)).toBeVisible();
    await expect(page.frameLocator("#cross").locator(OVERLAY)).toHaveCount(1);
  });

  for (const id of ["same", "cross"]) {
    test(`selects inside the ${id}-origin frame`, async ({ page }) => {
      const frame = page.frameLocator(`#${id}`);
      const inner = frame.locator("#inner");

      await moveTo(page, page.locator("#heading"));
      await expect(label(page)).toBeVisible();

      await moveTo(page, inner);
      await expect(label(frame).locator(".id")).toHaveText("#inner");
      // The frame drew that; the page's own highlight stepped aside.
      await expect(label(page)).toBeHidden();
      const inFrame = await inner.evaluate((el) => el.getBoundingClientRect().toJSON());
      const drawn = await band(frame, "border").evaluate((el) =>
        el.getBoundingClientRect().toJSON(),
      );
      expect(drawn).toEqual(inFrame);

      await pick(page, inner);
      await expect(selector(page)).toHaveText("button#inner.inner-btn");
      await expect(row(page, "background-color").locator(".value")).toHaveText("rgb(250, 204, 21)");
      const port = id === "same" ? 5180 : 5181;
      expect(await crumbs(page)).toEqual([
        `frame localhost:${port}/picker/frame-inner.html`,
        "html",
        "body",
        "button#inner.inner-btn",
      ]);
      await expect(selection(frame)).toBeVisible();
      await expect(selection(page)).toBeHidden();
      await expect(panel(page)).toHaveCount(1);
      await expect(frame.locator(`${OVERLAY} .panel`)).toHaveCount(0);
    });

    test(`walks out of and into the ${id}-origin frame`, async ({ page }) => {
      const frame = page.frameLocator(`#${id}`);
      await pick(page, frame.locator("#inner"));
      await expect(selector(page)).toHaveText("button#inner.inner-btn");

      // The keys go to the top document; the selection lives in the frame.
      await page.keyboard.press("ArrowRight");
      await expect(selector(page)).toHaveText("p#text");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(selector(page)).toHaveText("html");

      await page.keyboard.press("ArrowUp");
      await expect(selector(page)).toHaveText(`iframe#${id}`);
      await expect(panel(page).locator('[data-notice="frame"]')).toBeVisible();
      await expect(selection(page)).toBeVisible();
      await expect(selection(frame)).toBeHidden();
      expect(await crumbs(page)).toEqual(["html", "body", `iframe#${id}`]);

      await page.keyboard.press("ArrowDown");
      await expect(selector(page)).toHaveText("html");
      expect((await crumbs(page))[0]).toContain("frame localhost");
    });
  }

  test("the frame crumb selects the frame element", async ({ page }) => {
    await pick(page, page.frameLocator("#cross").locator("#text"));
    await expect(selector(page)).toHaveText("p#text");
    await panel(page)
      .getByRole("button", { name: /^frame localhost:5181/ })
      .click();
    await expect(selector(page)).toHaveText("iframe#cross");
  });

  test("a selection in one frame replaces the one in another", async ({ page }) => {
    await pick(page, page.frameLocator("#same").locator("#inner"));
    await expect(selection(page.frameLocator("#same"))).toBeVisible();

    await page.getByRole("button", { name: "Pick an element" }).click();
    await pick(page, page.locator("#heading"));
    await expect(selector(page)).toHaveText("h1#heading");
    await expect(selection(page)).toBeVisible();
    await expect(selection(page.frameLocator("#same"))).toBeHidden();
  });

  test("a frame with an opaque origin is inspectable", async ({ page }) => {
    const frame = page.frameLocator("#data");
    await expect(frame.locator(OVERLAY)).toHaveCount(1);
    await pick(page, frame.locator("#inner"));
    await expect(selector(page)).toHaveText("p#inner");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(selector(page)).toHaveText("iframe#data");
  });

  test("a frame that refuses injection is badged and selectable", async ({ page }) => {
    const refused = page.locator("#refused");
    expect(frameOf(page, "refused").url()).toContain("chrome-error://");

    await moveTo(page, refused);
    await expect(label(page).locator(".tag")).toHaveText("iframe");
    await expect(label(page).locator(".note")).toHaveText("cannot inspect");
    close(await boxOf(band(page, "border")), await boxOf(refused));

    await pick(page, refused);
    await expect(selector(page)).toHaveText("iframe#refused");
    await expect(panel(page).locator('[data-notice="frame-refused"]')).toBeVisible();

    // Frames of the same size that do answer are not mistaken for it.
    await page.getByRole("button", { name: "Pick an element" }).click();
    await pick(page, page.frameLocator("#cross").locator("#inner"));
    await expect(selector(page)).toHaveText("button#inner.inner-btn");
  });

  test("leaves every frame as it found it", async ({ page, toggle }) => {
    await toggle(page);
    await expect(page.frameLocator("#cross").locator(OVERLAY)).toHaveCount(0);
    const before = await snapshotPage(page);
    const count = page.frames().length;

    await toggle(page);
    await pick(page, page.frameLocator("#same").locator("#inner"));
    await expect(selector(page)).toHaveText("button#inner.inner-btn");
    await page.getByRole("button", { name: "Pick an element" }).click();
    await pick(page, page.frameLocator("#cross").locator("#text"));
    await expect(selector(page)).toHaveText("p#text");
    await page.keyboard.press("ArrowLeft");
    await expect(selector(page)).toHaveText("button#inner.inner-btn");

    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await expect(page.frameLocator("#same").locator(OVERLAY)).toHaveCount(0);
    await expect(page.frameLocator("#cross").locator(OVERLAY)).toHaveCount(0);
    expect(await snapshotPage(page)).toBe(before);
    await expect.poll(() => page.frames().length).toBe(count);
  });
});

test.describe("picker: production build", () => {
  test.use({ build: "production" });

  test("picks through a closed overlay root", async ({ page, toggle }) => {
    await page.goto("/picker/styles.html");
    const url = page.url();
    const before = await snapshotPage(page);
    await toggle(page);
    await expect(page.locator(OVERLAY)).toHaveCount(1);

    // Nothing inside the overlay is reachable, so go by what the page sees.
    await pick(page, page.locator("#link"));
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => (window as { heard?: string[] }).heard)).toEqual([]);

    // The first click made the selection and ended picking; the next is the page's.
    await expect
      .poll(async () => {
        await page
          .locator("#counter")
          .click({ timeout: 1000 })
          .catch(() => {});
        return page.evaluate(() => (window as { clicks?: number }).clicks);
      })
      .toBeGreaterThan(0);

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    const after = JSON.parse(await snapshotPage(page));
    const expected = JSON.parse(before);
    expect(after[0].state.html).toBe(expected[0].state.html);
    expect(after[0].state.frames).toBe(0);
  });
});
