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
