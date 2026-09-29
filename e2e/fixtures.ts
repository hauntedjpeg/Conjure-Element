import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Frame,
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

/**
 * Everything about the page that the inspector must leave as it found it,
 * in every frame.
 */
export async function snapshotPage(page: Page): Promise<string> {
  const frames = await Promise.all(
    page.frames().map(async (frame) => ({
      url: frame.url(),
      state: await frame
        .evaluate(() => {
          const roots: (Document | ShadowRoot)[] = [document];
          for (const el of document.querySelectorAll("*")) {
            if (el.shadowRoot) roots.push(el.shadowRoot);
          }
          return {
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
            scroll: [window.scrollX, window.scrollY],
            focus: document.activeElement?.tagName ?? null,
          };
        })
        // A frame that scripts cannot enter has nothing the inspector could change.
        .catch(() => "unreachable"),
    })),
  );
  return JSON.stringify(frames, null, 1);
}

type CdpFrameTree = {
  frame: { id: string; url: string; name?: string };
  childFrames?: CdpFrameTree[];
};

function findFrameId(tree: CdpFrameTree, frame: Frame): string | undefined {
  // `document.open()` changes a frame's URL under the protocol but not in
  // Playwright, so a name, where there is one, is the more reliable key.
  const name = frame.name();
  const matches = name ? tree.frame.name === name : tree.frame.url === frame.url();
  if (matches) return tree.frame.id;
  for (const child of tree.childFrames ?? []) {
    const id = findFrameId(child, frame);
    if (id) return id;
  }
  return undefined;
}

/**
 * Run `func` in the extension's isolated world, in a page's top frame or in
 * one of its child frames.
 *
 * This goes through the DevTools protocol, which can evaluate test code in
 * that world directly; nothing test-specific has to ship in the extension.
 * Child frames are matched by name, or by URL when they have none.
 */
export async function inIsolatedWorld<T, A = undefined>(
  target: Page | Frame,
  func: (arg: A) => T | Promise<T>,
  arg?: A,
): Promise<T> {
  const page = "page" in target ? target.page() : target;
  const frame = "page" in target ? target : target.mainFrame();
  const session = await page.context().newCDPSession(page);
  try {
    const contexts: {
      id: number;
      name: string;
      auxData?: { type?: string; frameId?: string };
    }[] = [];
    session.on("Runtime.executionContextCreated", (event) => contexts.push(event.context));
    await session.send("Runtime.enable");
    const { frameTree } = await session.send("Page.getFrameTree");
    const frameId = findFrameId(frameTree, frame);
    if (!frameId) throw new Error(`No frame ${frame.url()} in the page`);
    const world = contexts.find(
      (context) =>
        context.auxData?.type === "isolated" &&
        context.name === "Conjure Element" &&
        context.auxData.frameId === frameId,
    );
    if (!world) throw new Error(`The extension has no isolated world in ${frame.url()}`);
    const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
      expression: `(${func.toString()})(${JSON.stringify(arg)})`,
      contextId: world.id,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value as T;
  } finally {
    await session.detach();
  }
}
