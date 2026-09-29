import { isContextValid, onMessage, sendToWorker } from "../messaging/bus";
import { mountOverlay, type Overlay } from "../overlay/mount";

/**
 * Per-frame inspector lifecycle. Frame 0 owns the panel and the active
 * state; child frames follow `set-active` and will own their own highlight
 * layer once the picker lands.
 */
export function startInspector(): void {
  const isTop = window.top === window;
  let active = false;
  let overlay: Overlay | null = null;

  function activate(): void {
    if (active) return;
    active = true;
    if (isTop) overlay = mountOverlay(document, { onClose: exit });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pagehide", deactivate);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    overlay?.unmount();
    overlay = null;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pagehide", deactivate);
  }

  /** Leave inspect mode from inside the page and tell the other frames. */
  function exit(): void {
    deactivate();
    if (!isContextValid()) return;
    sendToWorker({ t: "deactivated" }).catch(() => {});
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!isContextValid()) {
      // The extension was reloaded under us; nothing can reach this script now.
      deactivate();
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exit();
  }

  onMessage((message) => {
    switch (message.t) {
      case "toggle":
        if (!isTop) return undefined;
        if (active) deactivate();
        else activate();
        return { active };
      case "query-active":
        return isTop ? { active } : undefined;
      case "set-active":
        if (message.active) activate();
        else deactivate();
        return undefined;
      default:
        return undefined;
    }
  });
}
