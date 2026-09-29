export type ClosedRootState =
  /** No root, or an open one. */
  | "none"
  /** Known to host a closed root. */
  | "closed"
  /** Renders in a way its light DOM does not explain. */
  | "suspected";

/**
 * How the picker sees shadow roots and which elements it must not see at
 * all. A seam, so that the extension can supply what only it knows: its own
 * overlay host, and the browser's view of closed roots where there is one.
 */
export interface PickerEnv {
  /** The root the picker may descend into. Closed roots are never returned. */
  shadowRootOf(el: Element): ShadowRoot | null;
  closedRoot(el: Element): ClosedRootState;
  /** True for elements that belong to the inspector itself. */
  ignore(el: Element): boolean;
}
