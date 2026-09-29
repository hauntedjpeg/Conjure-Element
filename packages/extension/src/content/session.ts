import {
  type Baseline,
  breadcrumb,
  browserHost,
  createBaseline,
  deepElementFromPoint,
  diffFromBaseline,
  flatParent,
  type NavDirection,
  navigate,
  type PickerEnv,
  snapshotElement,
  summarize,
} from "@conjure/core";
import { BASELINE_FRAME_NAME, OVERLAY_TAG } from "../constants";
import type {
  FrameId,
  FrameTraits,
  PickerCommand,
  PickerMessage,
  SelectionDTO,
  SelectionRef,
} from "../messaging/protocol";
import { createHighlight, type Highlight } from "../overlay/highlight";
import { mountOverlay, type Overlay } from "../overlay/mount";
import { pickerEnv } from "./env";

export type SessionOptions = {
  isTop: boolean;
  picking: boolean;
  /** The selection the tab already holds, when this frame joins late. */
  selection: SelectionRef | null;
  /** Identifies this frame's own messages when they come back from the worker. */
  instance: string;
  send(to: FrameId | "all", body: PickerMessage): void;
  onExit(): void;
};

export type Session = {
  receive(from: FrameId, instance: string, body: PickerMessage): void;
  /** True when the key was the inspector's to handle. */
  handleArrow(direction: NavDirection): boolean;
  state(): { picking: boolean; selection: SelectionRef | null };
  /** True once anything in the tab is selected. */
  hasSelection(): boolean;
  /** True for events that come from the inspector's own UI. */
  owns(event: Event): boolean;
  /** True while the user is typing into the panel. */
  typing(): boolean;
  destroy(): void;
};

type Owned = { id: number; el: Element; elements: Element[] };
type FrameStatus = "inspectable" | "refused";

const FRAME_TAGS = new Set(["iframe", "frame"]);
/** How long a frame has to answer a probe. */
const PROBE_TIMEOUT = 400;
/** A frame that did not answer is asked again after this long. */
const VERDICT_LIFETIME = 3000;
const SCROLLABLE = /^(auto|scroll|overlay)$/;
const LINE_HEIGHT = 16;

function isFrameElement(el: Element): el is HTMLIFrameElement {
  return FRAME_TAGS.has(el.localName);
}

/**
 * One frame's share of an inspect session: its overlay, its highlight, its
 * picker, and the selection when it holds it. Frame 0 also drives the panel.
 *
 * Frames only ever hear about each other through the worker, frame 0
 * included, so there is a single path for every change of state.
 */
export function createSession(doc: Document, options: SessionOptions): Session {
  const { isTop, instance, send } = options;
  const view = doc.defaultView;
  const overlay: Overlay = mountOverlay(doc, { panel: isTop });
  const env: PickerEnv = pickerEnv(overlay.host);
  const highlight: Highlight = createHighlight(overlay.layer);
  const baseline: Baseline = createBaseline(overlay.root, BASELINE_FRAME_NAME);
  const host = browserHost();
  const { shield } = overlay;

  let picking = options.picking;
  /** The selection as the whole tab knows it. */
  let current: SelectionRef | null = options.selection;
  /** Set while this frame holds the selection. */
  let owned: Owned | null = null;
  /** What the panel shows. Frame 0 only. */
  let shown: SelectionDTO | null = null;
  let counter = 0;
  let hoverOwner = false;
  /** The frame element the pointer was passed through to. */
  let handover: Element | null = null;

  /** Learned as the pointer crosses into each frame. */
  const frameOf = new WeakMap<Element, FrameId>();
  const elementOf = new Map<FrameId, WeakRef<Element>>();
  /** What probing has found out about frames this document cannot look into. */
  const verdicts = new WeakMap<Element, { status: FrameStatus; at: number }>();
  let probe: { el: Element; timer: number } | null = null;

  // Frames

  /**
   * Whether a frame element, as its document sees it, could be the frame
   * that describes itself as `inner`. A name the page has since changed
   * from inside cannot be matched; an element without one matches on size.
   */
  function fits(outer: FrameTraits, inner: FrameTraits): boolean {
    if (outer.name && outer.name !== inner.name) return false;
    return Math.abs(outer.width - inner.width) <= 1 && Math.abs(outer.height - inner.height) <= 1;
  }

  /** This frame, from the inside. */
  function traits(): FrameTraits {
    return { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0, name: view?.name ?? "" };
  }

  /** A frame element, from the outside. */
  function traitsOf(el: Element): FrameTraits {
    const style = view?.getComputedStyle(el);
    const px = (property: string) =>
      Number.parseFloat(style?.getPropertyValue(property) ?? "") || 0;
    return {
      width: el.clientWidth - px("padding-left") - px("padding-right"),
      height: el.clientHeight - px("padding-top") - px("padding-bottom"),
      name: el.getAttribute("name") ?? "",
    };
  }

  function endHandover(): void {
    handover = null;
    shield.classList.remove("handed-over");
  }

  function settle(status: FrameStatus): void {
    if (!probe) return;
    const { el, timer } = probe;
    view?.clearTimeout(timer);
    probe = null;
    verdicts.set(el, { status, at: Date.now() });
    if (status === "refused" && handover === el) {
      // Nobody is in there to take the pointer, so take it back.
      endHandover();
      if (picking) highlight.setHover(el, note(el));
    }
  }

  /**
   * Ask whether an inspector is running in a frame this document cannot
   * see into. Any frame that fits the description answers, so a frame that
   * cannot answer is taken for one that can if the two look alike.
   */
  function startProbe(el: Element): void {
    if (!view || probe?.el === el) return;
    settle("refused");
    probe = { el, timer: view.setTimeout(() => settle("refused"), PROBE_TIMEOUT) };
    send("all", { p: "probe", frame: traitsOf(el) });
  }

  /**
   * Almost every frame can be inspected, and treating one that can as one
   * that cannot would put its content out of reach. So a frame counts as
   * inspectable until it has failed to answer.
   */
  function frameStatus(el: HTMLIFrameElement): FrameStatus {
    if (frameOf.has(el)) return "inspectable";
    let inner: Document | null = null;
    try {
      inner = el.contentDocument;
    } catch {
      // Cross-origin.
    }
    // Same origin: an inspector is running there if its overlay is.
    if (inner) return inner.querySelector(OVERLAY_TAG) ? "inspectable" : "refused";
    const verdict = verdicts.get(el);
    if (verdict?.status === "inspectable") return "inspectable";
    if (!verdict || Date.now() - verdict.at > VERDICT_LIFETIME) startProbe(el);
    return verdict?.status ?? "inspectable";
  }

  /** The frame element the pointer is inside, as the page's own hover state has it. */
  function hoveredFrame(): Element | null {
    let root: Document | ShadowRoot = doc;
    for (let depth = 0; depth < 32; depth++) {
      const chain = root.querySelectorAll(":hover");
      const deepest = chain[chain.length - 1];
      if (!deepest) return null;
      if (isFrameElement(deepest)) return deepest;
      const inner = env.shadowRootOf(deepest);
      if (!inner) return null;
      root = inner;
    }
    return null;
  }

  /**
   * Work out which frame element a claiming frame lives in. The pointer is
   * inside it, so it is the one the page sees as hovered; it has to look
   * the part as well, because the claim may be from a frame nested deeper,
   * or the pointer may have moved on by the time the claim arrives.
   */
  function recognise(from: FrameId, inner: FrameTraits): void {
    if (elementOf.get(from)?.deref()?.isConnected) return;
    const el = hoveredFrame() ?? handover;
    if (!el || frameOf.has(el) || !fits(traitsOf(el), inner)) return;
    frameOf.set(el, from);
    elementOf.set(from, new WeakRef(el));
    if (probe?.el === el) settle("inspectable");
  }

  // Hover

  function note(el: Element): string {
    if (isFrameElement(el)) return frameStatus(el) === "refused" ? "cannot inspect" : "";
    const state = env.closedRoot(el);
    if (state === "closed") return "closed shadow root";
    return state === "suspected" ? "closed shadow root?" : "";
  }

  function claim(): void {
    if (hoverOwner) return;
    hoverOwner = true;
    send("all", { p: "claim", self: traits() });
  }

  function hoverAt(x: number, y: number): Element | null {
    const hit = deepElementFromPoint(doc, x, y, env);
    if (!hit) {
      highlight.setHover(null);
      return null;
    }
    claim();
    if (isFrameElement(hit) && frameStatus(hit) === "inspectable") {
      // The frame has an inspector of its own; step aside and let it work.
      handover = hit;
      shield.classList.add("handed-over");
      highlight.setHover(null);
      return null;
    }
    highlight.setHover(hit, note(hit));
    return hit;
  }

  // Selection

  function inspect(el: Element, id: number): SelectionDTO {
    const { crumbs } = breadcrumb(el);
    const base = baseline.styleFor(el);
    return {
      id,
      summary: summarize(el),
      crumbs: isTop ? crumbs : [{ kind: "frame", url: doc.location.href }, ...crumbs],
      entries: diffFromBaseline(snapshotElement(el, host), base ?? {}),
      baseline: base !== null,
      closedRoot: env.closedRoot(el),
      frame: isFrameElement(el) ? frameStatus(el) : null,
    };
  }

  function select(el: Element): void {
    counter += 1;
    // Read the styles before anything else changes what the page can see.
    const selection = inspect(el, counter);
    owned = { id: counter, el, elements: breadcrumb(el).elements };
    highlight.setHover(null);
    highlight.setSelection(el);
    send("all", { p: "selected", selection });
  }

  function step(direction: NavDirection): void {
    if (!owned) return;
    const { el } = owned;
    if (direction === "child" && isFrameElement(el)) {
      const inside = frameOf.get(el);
      if (inside !== undefined) send(inside, { p: "select-frame-root" });
      return;
    }
    const next = navigate(el, direction, env);
    if (next) {
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
      select(next);
    } else if (direction === "parent" && !isTop && flatParent(el) === null) {
      send("all", { p: "select-frame-host" });
    }
  }

  function run(command: PickerCommand): void {
    if (!owned) return;
    switch (command.c) {
      case "select-crumb": {
        const el = owned.elements[command.index];
        if (el?.isConnected) select(el);
        return;
      }
      case "navigate":
        step(command.direction);
        return;
      case "leave-frame":
        if (!isTop) send("all", { p: "select-frame-host" });
        return;
    }
  }

  function command(body: PickerCommand): void {
    if (!current) return;
    send(current.owner, { p: "command", selectionId: current.id, command: body });
  }

  // Shield

  function swallow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function onShieldMove(event: PointerEvent): void {
    hoverAt(event.clientX, event.clientY);
  }

  function onShieldClick(event: MouseEvent): void {
    swallow(event);
    if (event.button !== 0) return;
    const hit = hoverAt(event.clientX, event.clientY);
    if (hit) select(hit);
  }

  function onShieldLeave(): void {
    if (!handover) highlight.setHover(null);
  }

  /** A shield does not scroll, so pass the wheel to whatever is beneath it. */
  function onShieldWheel(event: WheelEvent): void {
    if (!view || event.ctrlKey) return;
    const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? view.innerHeight : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    const start = deepElementFromPoint(doc, event.clientX, event.clientY, env);
    for (let el = start; el; el = flatParent(el)) {
      // The document scrolls on its own; only scrollers inside it need help.
      if (el === doc.documentElement || el === doc.body) return;
      const style = view.getComputedStyle(el);
      const vertical =
        dy !== 0 && SCROLLABLE.test(style.overflowY) && el.scrollHeight > el.clientHeight;
      const horizontal =
        dx !== 0 && SCROLLABLE.test(style.overflowX) && el.scrollWidth > el.clientWidth;
      if (!vertical && !horizontal) continue;
      const before = [el.scrollLeft, el.scrollTop];
      el.scrollBy({ left: dx, top: dy, behavior: "instant" });
      if (el.scrollLeft !== before[0] || el.scrollTop !== before[1]) {
        event.preventDefault();
        return;
      }
    }
  }

  /**
   * While the shield is stepping aside for a frame, the first pointer event
   * this document sees means the pointer has come back out of it.
   */
  function onWindowMove(event: PointerEvent): void {
    if (!picking || !handover || overlay.host === event.target) return;
    endHandover();
    hoverAt(event.clientX, event.clientY);
  }

  function onWindowLeave(): void {
    if (!handover) highlight.setHover(null);
  }

  const SWALLOWED = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "auxclick"];
  for (const type of SWALLOWED) shield.addEventListener(type, swallow);
  shield.addEventListener("contextmenu", swallow);
  shield.addEventListener("click", onShieldClick);
  shield.addEventListener("pointermove", onShieldMove);
  shield.addEventListener("pointerleave", onShieldLeave);
  shield.addEventListener("wheel", onShieldWheel, { passive: false });
  view?.addEventListener("pointermove", onWindowMove, true);
  doc.documentElement.addEventListener("pointerleave", onWindowLeave);

  // State

  function setPicking(next: boolean): void {
    picking = next;
    shield.hidden = !picking;
    if (!picking) {
      endHandover();
      hoverOwner = false;
      highlight.setHover(null);
    }
  }

  function render(): void {
    overlay.renderPanel({
      picking,
      selection: shown,
      onClose: options.onExit,
      onPick: (next) => send("all", { p: "set-picking", picking: next }),
      onCrumb: (index) => command({ c: "select-crumb", index }),
      onLeaveFrame: () => command({ c: "leave-frame" }),
    });
  }

  setPicking(picking);
  render();

  return {
    receive(from, sender, body) {
      const mine = sender === instance;
      switch (body.p) {
        case "claim":
          if (mine) return;
          hoverOwner = false;
          highlight.setHover(null);
          recognise(from, body.self);
          return;
        case "probe":
          if (!mine && !isTop && fits(body.frame, traits())) send(from, { p: "present" });
          return;
        case "present":
          settle("inspectable");
          return;
        case "set-picking":
          setPicking(body.picking);
          render();
          return;
        case "selected":
          current = body.selection ? { owner: from, id: body.selection.id } : null;
          if (!mine) {
            owned = null;
            highlight.setSelection(null);
          }
          shown = body.selection;
          setPicking(false);
          render();
          return;
        case "command":
          if (body.command.c !== "select-crumb" || owned?.id === body.selectionId) {
            run(body.command);
          }
          return;
        case "select-frame-host": {
          const el = elementOf.get(from)?.deref();
          if (el?.isConnected) {
            el.scrollIntoView({ block: "nearest", inline: "nearest" });
            select(el);
          }
          return;
        }
        case "select-frame-root":
          select(doc.documentElement);
          return;
      }
    },
    handleArrow(direction) {
      if (!owned && !current) return false;
      if (owned) step(direction);
      else command({ c: "navigate", direction });
      return true;
    },
    state: () => ({ picking, selection: current }),
    // The owner knows before the rest of the tab has been told.
    hasSelection: () => owned !== null || current !== null,
    owns: (event) => event.target === overlay.host || event.composedPath().includes(overlay.host),
    typing: () => overlay.root.activeElement?.matches("input, textarea, select") ?? false,
    destroy() {
      if (probe) view?.clearTimeout(probe.timer);
      probe = null;
      view?.removeEventListener("pointermove", onWindowMove, true);
      doc.documentElement.removeEventListener("pointerleave", onWindowLeave);
      highlight.destroy();
      baseline.dispose();
      overlay.unmount();
    },
  };
}
