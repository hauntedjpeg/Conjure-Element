import { defaultPickerEnv, type PickerEnv, suspectClosedRoot } from "@conjure/core";

type DomApi = { openOrClosedShadowRoot?(el: Element): ShadowRoot | null };

/** Chromium's `chrome.dom`. Safari has no equivalent. */
function domApi(): DomApi | undefined {
  const scope = globalThis as { chrome?: { dom?: DomApi }; browser?: { dom?: DomApi } };
  const api = scope.chrome?.dom ?? scope.browser?.dom;
  return typeof api?.openOrClosedShadowRoot === "function" ? api : undefined;
}

/**
 * Closed roots are reported, never entered, in every browser. Where the
 * browser can say for certain that a root is closed it is asked; elsewhere
 * the answer is a guess and is labelled as one.
 */
export function pickerEnv(overlayHost: Element): PickerEnv {
  const api = domApi();
  return defaultPickerEnv({
    ignore: (el) => el === overlayHost,
    closedRoot(el) {
      if (el.shadowRoot) return "none";
      if (!api?.openOrClosedShadowRoot) return suspectClosedRoot(el);
      try {
        return api.openOrClosedShadowRoot(el) ? "closed" : "none";
      } catch {
        // Not an HTML element.
        return "none";
      }
    },
  });
}
