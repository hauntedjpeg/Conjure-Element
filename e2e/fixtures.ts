import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from "@playwright/test";

export const OVERLAY = "conjure-element-overlay";

const OUTPUT = fileURLToPath(new URL("../packages/extension/.output/", import.meta.url));

const BUILDS = {
  /** Test hooks on, shadow root open. */
  e2e: `${OUTPUT}chrome-mv3-e2e`,
  /** Exactly what gets loaded for real use. */
  production: `${OUTPUT}chrome-mv3`,
} as const;

export type Build = keyof typeof BUILDS;

type Fixtures = {
  build: Build;
  context: BrowserContext;
  worker: Worker;
  /** Click the toolbar button for `page`'s tab. Resolves to the new state. */
  toggle: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  build: ["e2e", { option: true }],

  context: async ({ build }, use) => {
    const path = BUILDS[build];
    if (!existsSync(`${path}/manifest.json`)) {
      throw new Error(`No ${build} build at ${path}. Run \`pnpm build && pnpm build:e2e\` first.`);
    }
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    });
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    await use(existing ?? (await context.waitForEvent("serviceworker")));
  },

  toggle: async ({ worker }, use) => {
    await use(async (page) => {
      await worker.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        if (tab?.id === undefined) throw new Error(`No tab for ${url}`);
        const hook = (globalThis as { __conjureToggle?: (tabId: number) => Promise<boolean> })
          .__conjureToggle;
        if (hook) {
          await hook(tab.id);
          return;
        }
        // Production build: fire the real toolbar event.
        (chrome.action.onClicked as unknown as { dispatch(tab: unknown): void }).dispatch(tab);
      }, page.url());
    });
  },
});

export const expect = test.expect;

/** Everything about the page that the inspector must leave as it found it. */
export function snapshotPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    for (const el of document.querySelectorAll("*")) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    return JSON.stringify({
      html: document.documentElement.outerHTML,
      adopted: roots.map((root) => root.adoptedStyleSheets.length),
      sheets: Array.from(document.styleSheets, (sheet) => {
        try {
          return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
        } catch {
          return `unreadable:${sheet.href}`;
        }
      }),
      frames: window.length,
    });
  });
}
