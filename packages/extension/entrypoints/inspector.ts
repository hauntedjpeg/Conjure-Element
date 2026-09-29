import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { INSPECTOR_GLOBAL, isBaselineFrame } from "../src/constants";
import { startInspector } from "../src/content/activate";

export default defineUnlistedScript(() => {
  // Injection with `allFrames` reaches the UA-baseline frame too.
  if (isBaselineFrame(window)) return;
  const scope = globalThis as Record<string, unknown>;
  if (scope[INSPECTOR_GLOBAL]) return;
  scope[INSPECTOR_GLOBAL] = true;
  startInspector();
});
