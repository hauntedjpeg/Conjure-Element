import type { ClosedRootState } from "./env";

function hasRenderedLightDom(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === 1 && (child as Element).getClientRects().length > 0) return true;
    if (child.nodeType === 3 && child.textContent?.trim()) {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(child);
      if (range.getClientRects().length > 0) return true;
    }
  }
  return false;
}

function hasLightDom(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === 1) return true;
    if (child.nodeType === 3 && child.textContent?.trim()) return true;
  }
  return false;
}

/**
 * Guess whether a custom element hosts a closed shadow root, for browsers
 * that offer no way to ask. Two signs, both of rendering that the light DOM
 * cannot account for:
 *
 * - it has light DOM, and none of it is rendered, which is what happens to
 *   content a shadow tree does not slot;
 * - it has no light DOM at all, yet it takes up space.
 *
 * A closed root that slots all of its light DOM is indistinguishable from
 * no root, and an empty element sized by its own styles looks like the
 * second sign. Hence "suspected", never "closed".
 */
export function suspectClosedRoot(el: Element): ClosedRootState {
  if (el.shadowRoot) return "none";
  if (!el.localName.includes("-") || !el.matches(":defined")) return "none";
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return "none";
  if (!hasLightDom(el)) return "suspected";
  return hasRenderedLightDom(el) ? "none" : "suspected";
}
