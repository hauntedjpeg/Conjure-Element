import type {
  ClosedRootState,
  ComputedEntry,
  Crumb,
  ElementSummary,
  NavDirection,
} from "@conjure/core";

/**
 * Messages between the background worker and content scripts. Frame 0 owns
 * the panel and the inspector's active state. The worker holds no state of
 * its own, so it can be stopped and restarted at any point.
 */

export type FrameId = number;

/** Which frame holds the selection, and which of its selections it is. */
export type SelectionRef = { owner: FrameId; id: number };

/**
 * Everything the panel shows about a selection. Plain data: the element
 * itself never leaves the frame that owns it.
 */
export type SelectionDTO = {
  id: number;
  summary: ElementSummary;
  crumbs: Crumb[];
  entries: ComputedEntry[];
  /** False where the page allows no baseline frame; nothing is then a default. */
  baseline: boolean;
  closedRoot: ClosedRootState;
  /** Set when the element is itself a frame. */
  frame: "inspectable" | "refused" | null;
};

/**
 * Sent to the frame that owns the selection. A crumb is a position in one
 * particular selection's chain; the others apply to whatever is selected by
 * the time they arrive, so that keys pressed in quick succession all count.
 */
export type PickerCommand =
  | { c: "select-crumb"; index: number }
  | { c: "navigate"; direction: NavDirection }
  /** Select the frame element that contains the owner. */
  | { c: "leave-frame" };

/**
 * What a frame and the document that contains it can both know about the
 * frame without touching the page: the size of its viewport, and its name
 * where the frame element was given one.
 */
export type FrameTraits = { width: number; height: number; name: string };

/** What frames say to each other. Content scripts can only talk through the worker. */
export type PickerMessage =
  /** The pointer is in the sender's frame; everyone else drops their hover. */
  | { p: "claim"; self: FrameTraits }
  /** Is there an inspector in a frame that looks like this? */
  | { p: "probe"; frame: FrameTraits }
  /** The answer to a probe, from any frame it fits. Silence means no. */
  | { p: "present" }
  | { p: "set-picking"; picking: boolean }
  /** The sender now holds the selection. Picking ends. */
  | { p: "selected"; selection: SelectionDTO | null }
  | { p: "command"; selectionId: number; command: PickerCommand }
  /** Whichever frame contains the sender selects the element that hosts it. */
  | { p: "select-frame-host" }
  /** The receiver selects its document element. */
  | { p: "select-frame-root" };

export type Message =
  /** worker → frame 0. Flip inspect mode. */
  | { t: "toggle" }
  /** worker → frame 0. Asked when a late frame needs to know the tab's state. */
  | { t: "query-active" }
  /** worker → every frame. */
  | { t: "set-active"; active: boolean; picking: boolean; selection: SelectionRef | null }
  /** frame 0 → worker. Inspect mode ended from inside the page, e.g. Esc. */
  | { t: "deactivated" }
  /** any frame → worker, on load. */
  | { t: "frame:hello"; isTop: boolean }
  /** frame → worker. Pass `body` on to one frame or to all of them. */
  | { t: "relay"; to: FrameId | "all"; instance: string; body: PickerMessage }
  /** worker → frame. A relayed message, stamped with the frame it came from. */
  | { t: "picker"; from: FrameId; instance: string; body: PickerMessage };

export type ActiveReply = { active: boolean; picking: boolean; selection: SelectionRef | null };

export type Reply<M extends Message> = M extends { t: "toggle" | "query-active" }
  ? ActiveReply
  : undefined;

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" && value !== null && typeof (value as { t?: unknown }).t === "string"
  );
}
