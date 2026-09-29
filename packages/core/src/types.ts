/** `(a, b, c)`: ids, classes/attributes/pseudo-classes, types/pseudo-elements. */
export type Specificity = readonly [a: number, b: number, c: number];

export type PropertyOrigin = {
  value: string;
  /** The specific complex selector that matched, not the whole selector list. */
  selector: string;
  specificity: Specificity;
  important: boolean;
  /** `@layer` name, or null when unlayered. */
  layer: string | null;
  source: { href: string | null; line?: number };
  /** Enclosing `@media` / `@supports` / `@container` conditions, outermost first. */
  conditions: string[];
};

export type Winner = PropertyOrigin | "inline" | "ua-default" | "initial";

export type ResolvedVariable = { name: string; value: string; definedOn: Element };

export type ResolvedProperty = {
  property: string;
  /** From `getComputedStyle`: the ground truth. */
  computedValue: string;
  /** Resolved px for layout-dependent properties. */
  usedValue?: string;
  winner: Winner;
  /** Losing declarations, in cascade order. */
  overridden: PropertyOrigin[];
  /** Set when the value came from an ancestor in the flattened tree. */
  inheritedFrom: Element | null;
  isCustomProperty: boolean;
  resolvedVariables?: ResolvedVariable[];
};

export type ResolvedStyle = Map<string, ResolvedProperty>;
