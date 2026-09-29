import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { adoptLateFrame, broadcastInactive, relay, toggleTab } from "../src/background/toggle";
import { onMessage } from "../src/messaging/bus";

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    toggleTab(tab.id).catch((error) => {
      // Browser-internal pages and extension galleries refuse injection.
      console.warn("[conjure] cannot inspect this tab:", error);
    });
  });

  onMessage((message, sender) => {
    if (sender.tabId === undefined) return undefined;
    switch (message.t) {
      case "deactivated":
        void broadcastInactive(sender.tabId);
        return undefined;
      case "frame:hello":
        if (sender.frameId !== undefined) void adoptLateFrame(sender.tabId, sender.frameId);
        return undefined;
      case "relay":
        void relay(sender.tabId, sender.frameId ?? 0, message);
        return undefined;
      default:
        return undefined;
    }
  });

  if (__CONJURE_E2E__) {
    // Playwright cannot click the toolbar button, so the e2e build exposes it.
    (globalThis as { __conjureToggle?: typeof toggleTab }).__conjureToggle = toggleTab;
  }
});
