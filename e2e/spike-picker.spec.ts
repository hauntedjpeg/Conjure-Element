/**
 * What the picker can rely on from inside the extension's isolated world.
 * Findings are written up in docs/decisions/0003.
 */
import { expect, inIsolatedWorld, test } from "./fixtures";

const BASELINE_FRAME_NAME = "__conjure_baseline";

test.beforeEach(async ({ page }) => {
  await page.goto("/picker/shadow.html");
});

test("chrome.dom.openOrClosedShadowRoot sees closed roots", async ({ page }) => {
  const found = await inIsolatedWorld(page, () => {
    const dom = (
      globalThis as { chrome?: { dom?: { openOrClosedShadowRoot?(el: Element): unknown } } }
    ).chrome?.dom;
    const probe = (id: string) => {
      const el = document.getElementById(id) as HTMLElement;
      const root = dom?.openOrClosedShadowRoot?.(el) as ShadowRoot | null | undefined;
      return { plain: el.shadowRoot !== null, api: root ? root.mode : null };
    };
    return {
      available: typeof dom?.openOrClosedShadowRoot === "function",
      card: probe("card"),
      vault: probe("vault"),
      plain: probe("plain"),
    };
  });
  expect(found).toEqual({
    available: true,
    card: { plain: true, api: "open" },
    vault: { plain: false, api: "closed" },
    plain: { plain: false, api: null },
  });
});

test("custom elements are recognisable without the registry", async ({ page }) => {
  const found = await inIsolatedWorld(page, () => ({
    registry: globalThis.customElements === null ? "null" : typeof globalThis.customElements,
    defined: document.getElementById("vault")?.matches(":defined"),
  }));
  expect(found.defined).toBe(true);
  expect(found.registry).toBe("null");
});

test("injection reaches the baseline frame, and the inspector declines", async ({
  page,
  toggle,
}) => {
  await inIsolatedWorld(
    page,
    (name) => {
      const host = document.createElement("spike-host");
      const root = host.attachShadow({ mode: "closed" });
      const frame = document.createElement("iframe");
      frame.name = name;
      root.append(frame);
      document.documentElement.append(host);
      const doc = frame.contentDocument as Document;
      doc.open();
      doc.write("<!doctype html><html><head></head><body></body></html>");
      doc.close();
    },
    BASELINE_FRAME_NAME,
  );
  const frame = page.frames().find((candidate) => candidate.name() === BASELINE_FRAME_NAME);
  expect(frame).toBeDefined();
  if (!frame) return;

  await toggle(page);
  await expect(page.locator("conjure-element-overlay")).toHaveCount(1);
  const reached = await inIsolatedWorld(frame, () => ({
    // The bootstrap ran here, so the extension's world exists in this frame.
    world: true,
    inspector: "__conjureInspector" in globalThis,
    name: window.name,
    // `document.open()` gives the frame its opener's URL.
    url: location.href,
  }));
  expect(reached).toEqual({
    world: true,
    inspector: false,
    name: BASELINE_FRAME_NAME,
    url: page.url(),
  });
});
