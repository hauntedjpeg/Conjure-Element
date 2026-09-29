import type { PickerEnv } from "./env";

function topmost(root: DocumentOrShadowRoot & Node, x: number, y: number, env: PickerEnv) {
  for (const el of root.elementsFromPoint(x, y)) {
    // A shadow root's hit list runs on into the documents that contain it.
    if (el.getRootNode() !== root) continue;
    if (env.ignore(el)) continue;
    return el;
  }
  return null;
}

/**
 * The innermost element at a point, looking through open shadow roots.
 * `elementFromPoint` on the document stops at the outermost host.
 */
export function deepElementFromPoint(
  doc: Document,
  x: number,
  y: number,
  env: PickerEnv,
): Element | null {
  let hit = topmost(doc, x, y, env);
  while (hit) {
    const root = env.shadowRootOf(hit);
    const inner = root ? topmost(root, x, y, env) : null;
    if (!inner) break;
    hit = inner;
  }
  return hit;
}
