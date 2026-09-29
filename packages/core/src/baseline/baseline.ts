import type { StyleRecord } from "../computed/diff";
import { snapshotStyle } from "../computed/snapshot";

export type Baseline = {
  /**
   * The computed style of a bare element like `el` in an empty document, or
   * null where the page does not allow the frame that would hold it.
   */
  styleFor(el: Element): StyleRecord | null;
  dispose(): void;
};

/** Laid out so that styles compute, but never seen and never in the way. */
const FRAME_STYLE =
  "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none";

/** Tags whose UA style depends on `type`. */
const TYPED = new Set(["input", "button"]);

function keyOf(el: Element): string {
  const type = TYPED.has(el.localName) ? (el.getAttribute("type") ?? "") : "";
  return `${el.namespaceURI}|${el.localName}|${type.toLowerCase()}`;
}

/**
 * The UA baseline (PRD §6.6). `container` should be inside the inspector's
 * own shadow root: a frame there is invisible to the page's `window.length`
 * and to lookup by name.
 */
export function createBaseline(container: Node, frameName: string): Baseline {
  const cache = new Map<string, StyleRecord>();
  let frame: HTMLIFrameElement | null = null;
  let failed = false;

  function open(): Document | null {
    if (frame?.contentDocument) return frame.contentDocument;
    if (failed) return null;
    const owner = container.ownerDocument;
    if (!owner) return null;
    frame?.remove();
    frame = owner.createElement("iframe");
    frame.name = frameName;
    frame.setAttribute("style", FRAME_STYLE);
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    container.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      failed = true;
      frame.remove();
      frame = null;
      return null;
    }
    // A blank frame is in quirks mode until it is given a doctype.
    doc.open();
    doc.write("<!doctype html><html><head></head><body></body></html>");
    doc.close();
    return frame.contentDocument;
  }

  return {
    styleFor(el) {
      const key = keyOf(el);
      const cached = cache.get(key);
      if (cached) return cached;
      const doc = open();
      const view = doc?.defaultView;
      if (!doc || !view) return null;

      const bare = doc.createElementNS(el.namespaceURI, el.localName);
      const type = TYPED.has(el.localName) ? el.getAttribute("type") : null;
      if (type !== null) bare.setAttribute("type", type);
      doc.body.append(bare);
      const record = snapshotStyle(view.getComputedStyle(bare));
      bare.remove();
      cache.set(key, record);
      return record;
    },
    dispose() {
      frame?.remove();
      frame = null;
      cache.clear();
    },
  };
}
