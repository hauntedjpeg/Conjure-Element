/**
 * What a content script's isolated world can do with the page's stylesheets.
 * The cascade and state engines are built on these answers, so they are
 * pinned here as tests. Findings are written up in docs/decisions/0001.
 */
import { expect, inIsolatedWorld, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/spike/worlds.html");
});

test("reads rules from <style>, page-constructed and shadow-root sheets", async ({ page }) => {
  const found = await inIsolatedWorld(page, () => {
    const card = document.getElementById("card");
    const text = (sheets: Iterable<CSSStyleSheet>) =>
      Array.from(sheets, (sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText).join(" "));
    return {
      styleSheets: text(document.styleSheets),
      adopted: text(document.adoptedStyleSheets),
      shadowRoot: card?.shadowRoot ? "reachable" : "unreachable",
      shadowAdopted: card?.shadowRoot ? text(card.shadowRoot.adoptedStyleSheets) : [],
    };
  });
  expect(found.styleSheets.join()).toContain(".box:hover");
  expect(found.adopted.join()).toContain(".box:focus");
  expect(found.shadowRoot).toBe("reachable");
  expect(found.shadowAdopted.join()).toContain(".inner:hover");
});

test("a sheet constructed in the isolated world can be adopted and removed", async ({ page }) => {
  const result = await inIsolatedWorld(page, () => {
    const box = document.getElementById("box") as HTMLElement;
    const before = document.adoptedStyleSheets.length;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(".box { color: rgb(10, 20, 30); }");
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      const applied = getComputedStyle(box).color;
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      return { ok: true, applied, restored: document.adoptedStyleSheets.length === before };
    } catch (error) {
      return { ok: false, applied: String(error), restored: false };
    }
  });
  expect(result).toEqual({ ok: true, applied: "rgb(10, 20, 30)", restored: true });

  // The page's own view of its adopted sheets is unchanged afterwards.
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(1);
});

test("editing selectorText in place forces a state and preserves source order", async ({
  page,
}) => {
  const result = await inIsolatedWorld(page, () => {
    const box = document.getElementById("box") as HTMLElement;
    const [sheet] = document.styleSheets;
    const rule = sheet?.cssRules[0] as CSSStyleRule;
    const original = rule.selectorText;
    const resting = getComputedStyle(box).color;

    rule.selectorText = `${original}, .box.__insp-hover`;
    box.classList.add("__insp-hover");
    const forced = getComputedStyle(box).color;

    // `.box.later` has equal specificity and comes later, so it must win,
    // exactly as it would under a real :hover.
    box.classList.add("later");
    const tied = getComputedStyle(box).color;

    rule.selectorText = original;
    box.className = "box";
    return {
      original,
      resting,
      forced,
      tied,
      restoredText: rule.selectorText,
      restoredColor: getComputedStyle(box).color,
    };
  });
  expect(result.forced).toBe("rgb(1, 2, 3)");
  expect(result.tied).toBe("rgb(9, 9, 9)");
  expect(result.restoredText).toBe(result.original);
  expect(result.restoredColor).toBe(result.resting);
});

test("selectorText edits also work on page-constructed and shadow sheets", async ({ page }) => {
  const result = await inIsolatedWorld(page, () => {
    const box = document.getElementById("box") as HTMLElement;
    const inner = document
      .getElementById("card")
      ?.shadowRoot?.querySelector(".inner") as HTMLElement;
    const pageRule = document.adoptedStyleSheets[0]?.cssRules[0] as CSSStyleRule;
    const shadowRule = document.getElementById("card")?.shadowRoot?.adoptedStyleSheets[0]
      ?.cssRules[1] as CSSStyleRule;
    const originals = [pageRule.selectorText, shadowRule.selectorText];

    pageRule.selectorText = `${pageRule.selectorText}, .box.__insp-focus`;
    shadowRule.selectorText = `${shadowRule.selectorText}, .inner.__insp-hover`;
    box.classList.add("__insp-focus");
    inner.classList.add("__insp-hover");
    const forced = {
      outline: getComputedStyle(box).outlineColor,
      inner: getComputedStyle(inner).color,
    };

    pageRule.selectorText = originals[0] as string;
    shadowRule.selectorText = originals[1] as string;
    box.className = "box";
    inner.className = "inner";
    return forced;
  });
  expect(result).toEqual({ outline: "rgb(4, 5, 6)", inner: "rgb(7, 8, 9)" });
});

test("replaceSync yields readable rules for refetched stylesheet text", async ({ page }) => {
  const rules = await inIsolatedWorld(page, () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      "@layer base { .a:hover { color: red } } @media (min-width: 1px) { .b { top: 0 } }",
    );
    return Array.from(sheet.cssRules, (rule) => rule.constructor.name);
  });
  expect(rules).toEqual(["CSSLayerBlockRule", "CSSMediaRule"]);
});
