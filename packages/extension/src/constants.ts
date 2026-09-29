/**
 * Every artifact the extension adds to an inspected page carries one of
 * these names, so teardown and the page-cleanliness test can find them all.
 */
export const OVERLAY_TAG = "conjure-element-overlay";

/** Reserved prefix for marker classes and injected sheets (PRD §7.8). */
export const ARTIFACT_PREFIX = "__insp-";

/** `window.name` of the UA-baseline iframe; the bootstrap skips it. */
export const BASELINE_FRAME_NAME = "__conjure_baseline";

/** Key of the idempotency guard in the content script's isolated world. */
export const INSPECTOR_GLOBAL = "__conjureInspector";

/**
 * True in the UA-baseline frame and in anything nested inside it. Content
 * scripts and `executeScript` both reach that frame, and the inspector has
 * no business there.
 */
export function isBaselineFrame(win: Window): boolean {
  let at: Window = win;
  for (let depth = 0; depth < 32; depth++) {
    try {
      if (at.name === BASELINE_FRAME_NAME) return true;
    } catch {
      // A cross-origin ancestor: the baseline frame is never above one.
      return false;
    }
    if (at.parent === at) return false;
    at = at.parent;
  }
  return false;
}
