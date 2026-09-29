import { render } from "preact";
import { OVERLAY_TAG } from "../constants";
import { Panel } from "./panel/Panel";
import css from "./styles.css?inline";

export type Overlay = { host: HTMLElement; unmount(): void };

export type MountOptions = { onClose(): void };

/**
 * Page styles must never reach the inspector, and the page must not be able
 * to reach into it, so the root is closed. The e2e build opens it because a
 * closed root is unreachable to the tests as well.
 */
const SHADOW_MODE: ShadowRootMode = __CONJURE_E2E__ ? "open" : "closed";

/**
 * A constructed sheet is not subject to the page's `style-src` policy, which
 * an injected `<style>` element can be. Fall back to the element where the
 * content script's world cannot adopt sheets.
 */
function applyStyles(root: ShadowRoot, doc: Document): void {
  try {
    const Sheet = doc.defaultView?.CSSStyleSheet ?? CSSStyleSheet;
    const sheet = new Sheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
    if (root.adoptedStyleSheets.length === 1) return;
  } catch {
    // Fall through to the element.
  }
  const style = doc.createElement("style");
  style.textContent = css;
  root.append(style);
}

export function mountOverlay(doc: Document, options: MountOptions): Overlay {
  // An unregistered custom tag: no page stylesheet targets it by accident,
  // and `customElements` is unavailable to content scripts anyway.
  const host = doc.createElement(OVERLAY_TAG);
  const root = host.attachShadow({ mode: SHADOW_MODE });
  applyStyles(root, doc);

  const container = doc.createElement("div");
  container.className = "root";
  root.append(container);
  render(<Panel onClose={options.onClose} />, container);

  // On <html>, not <body>: frameworks that own <body> re-render it freely.
  doc.documentElement.append(host);

  return {
    host,
    unmount() {
      render(null, container);
      host.remove();
    },
  };
}
