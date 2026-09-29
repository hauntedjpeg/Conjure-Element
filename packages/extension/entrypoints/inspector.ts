import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { INSPECTOR_GLOBAL } from "../src/constants";
import { startInspector } from "../src/content/activate";

export default defineUnlistedScript(() => {
  const scope = globalThis as Record<string, unknown>;
  if (scope[INSPECTOR_GLOBAL]) return;
  scope[INSPECTOR_GLOBAL] = true;
  startInspector();
});
