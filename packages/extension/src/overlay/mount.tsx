import { render } from "preact";
import { OVERLAY_TAG } from "../constants";
import { Panel, type PanelProps } from "./panel/Panel";
import css from "./styles.css?inline";

export type Overlay = {
  host: HTMLElement;
  root: ShadowRoot;
  /** Covers the viewport while picking, so the page never sees the pointer. */
  shield: HTMLElement;
  /** Where the highlight is drawn. */
  layer: HTMLElement;
  /** Does nothing in frames that have no panel. */
  renderPanel(props: PanelProps): void;
  unmount(): void;
};

export type MountOptions = {
  /** Only the top frame shows the panel; every frame has the rest. */
  panel: boolean;
};

/**
 * Page styles must never reach the inspector, and the page must not be able
 * to reach into it, so the root is closed. The e2e build opens it because a
 * closed root is unreachable to the tests as well.
 */
const SHADOW_MODE: ShadowRootMode = __CONJURE_E2E__ ? "open" : "closed";

/**
 * Events that bubble out of a shadow root reach the page with the host as
 * their target. None of what happens inside the inspector is the page's
 * business, so they stop at the root.
 */
const CONTAINED_EVENTS = [
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
  "pointercancel",
  "touchstart",
  "touchmove",
  "touchend",
  "wheel",
  "keydown",
  "keyup",
  "keypress",
  "input",
  "change",
  "focusin",
  "focusout",
  "copy",
  "cut",
  "paste",
  "select",
];

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

function child(doc: Document, parent: Node, className: string): HTMLDivElement {
  const el = doc.createElement("div");
  el.className = className;
  parent.appendChild(el);
  return el;
}

export function mountOverlay(doc: Document, options: MountOptions): Overlay {
  // An unregistered custom tag: no page stylesheet targets it by accident,
  // and `customElements` is unavailable to content scripts anyway.
  const host = doc.createElement(OVERLAY_TAG);
  const root = host.attachShadow({ mode: SHADOW_MODE });
  applyStyles(root, doc);

  const container = child(doc, root, "root");
  for (const type of CONTAINED_EVENTS) {
    container.addEventListener(type, (event) => event.stopPropagation());
  }

  // In stacking order: the shield under the highlight, the panel over both.
  const shield = child(doc, container, "shield");
  shield.hidden = true;
  const layer = child(doc, container, "layer");
  const panel = options.panel ? child(doc, container, "panel-mount") : null;

  // On <html>, not <body>: frameworks that own <body> re-render it freely.
  doc.documentElement.append(host);

  return {
    host,
    root,
    shield,
    layer,
    renderPanel(props) {
      if (panel) render(<Panel {...props} />, panel);
    },
    unmount() {
      if (panel) render(null, panel);
      host.remove();
    },
  };
}
