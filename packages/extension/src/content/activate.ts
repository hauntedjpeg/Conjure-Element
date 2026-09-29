import type { NavDirection } from "@conjure/core";
import { isContextValid, onMessage, sendToWorker } from "../messaging/bus";
import type { ActiveReply, SelectionRef } from "../messaging/protocol";
import { createSession, type Session } from "./session";

const ARROWS: Record<string, NavDirection> = {
  ArrowUp: "parent",
  ArrowDown: "child",
  ArrowLeft: "previous",
  ArrowRight: "next",
};

const KEY_EVENTS = ["keydown", "keyup", "keypress"] as const;

/** True when the key belongs to something the user is typing into. */
function isEditing(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.matches("input, textarea, select");
}

/**
 * Per-frame inspector lifecycle. Frame 0 owns the panel and the active
 * state; every frame owns a highlight layer and a picker of its own.
 */
export function startInspector(): void {
  const isTop = window.top === window;
  const instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let session: Session | null = null;

  function activate(picking: boolean, selection: SelectionRef | null): void {
    if (session) return;
    // Injected into a frame that has only just begun to load.
    if (!document.documentElement) return;
    session = createSession(document, {
      isTop,
      picking,
      selection,
      instance,
      onExit: exit,
      send(to, body) {
        if (!isContextValid()) return;
        sendToWorker({ t: "relay", to, instance, body }).catch(() => {});
      },
    });
    for (const type of KEY_EVENTS) window.addEventListener(type, onKey, true);
    window.addEventListener("pagehide", deactivate);
  }

  function deactivate(): void {
    if (!session) return;
    session.destroy();
    session = null;
    for (const type of KEY_EVENTS) window.removeEventListener(type, onKey, true);
    window.removeEventListener("pagehide", deactivate);
  }

  /** Leave inspect mode from inside the page and tell the other frames. */
  function exit(): void {
    deactivate();
    if (!isContextValid()) return;
    sendToWorker({ t: "deactivated" }).catch(() => {});
  }

  function state(): ActiveReply {
    const held = session?.state();
    return {
      active: session !== null,
      picking: held?.picking ?? false,
      selection: held?.selection ?? null,
    };
  }

  function onKey(event: KeyboardEvent): void {
    if (!session) return;
    if (!isContextValid()) {
      // The extension was reloaded under us; nothing can reach this script now.
      deactivate();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown") exit();
      return;
    }
    const inPanel = session.owns(event);
    // A key pressed in the panel still does its job there, but no listener
    // of the page's gets to hear about it.
    if (inPanel) event.stopImmediatePropagation();
    if (inPanel ? session.typing() : isEditing(event)) return;
    const direction = ARROWS[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!session.hasSelection()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown") session.handleArrow(direction);
  }

  onMessage((message, _sender) => {
    switch (message.t) {
      case "toggle":
        if (!isTop) return undefined;
        if (session) deactivate();
        else activate(true, null);
        return state();
      case "query-active":
        return isTop ? state() : undefined;
      case "set-active":
        if (message.active) activate(message.picking, message.selection);
        else deactivate();
        return undefined;
      case "picker":
        session?.receive(message.from, message.instance, message.body);
        return undefined;
      default:
        return undefined;
    }
  });
}
