import { defineContentScript } from "wxt/utils/define-content-script";
import { BASELINE_FRAME_NAME } from "../src/constants";
import { sendToWorker } from "../src/messaging/bus";

/**
 * Runs in every frame of every page, so it does as little as possible: it
 * announces the frame, which lets frames that load after activation join in.
 * The inspector itself is injected on demand.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: true,
  runAt: "document_idle",
  main() {
    if (window.name === BASELINE_FRAME_NAME) return;
    sendToWorker({ t: "frame:hello", isTop: window.top === window }).catch(() => {
      // The worker may be restarting; a late frame is picked up on next toggle.
    });
  },
});
