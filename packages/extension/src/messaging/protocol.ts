/**
 * Messages between the background worker and content scripts. Frame 0 owns
 * the inspector's active state; the worker only relays.
 */
export type Message =
  /** worker → frame 0. Flip inspect mode. */
  | { t: "toggle" }
  /** worker → frame 0. Asked when a late frame needs to know the tab's state. */
  | { t: "query-active" }
  /** worker → every frame. */
  | { t: "set-active"; active: boolean }
  /** frame 0 → worker. Inspect mode ended from inside the page, e.g. Esc. */
  | { t: "deactivated" }
  /** any frame → worker, on load. */
  | { t: "frame:hello"; isTop: boolean };

export type ActiveReply = { active: boolean };

export type Reply<M extends Message> = M extends { t: "toggle" | "query-active" }
  ? ActiveReply
  : undefined;

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" && value !== null && typeof (value as { t?: unknown }).t === "string"
  );
}
