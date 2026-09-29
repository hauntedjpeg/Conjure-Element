import { type Category, categoryOf } from "./categories";

/** Computed longhands by property name. */
export type StyleRecord = Record<string, string>;

export type ComputedEntry = {
  property: string;
  value: string;
  /**
   * True when the value is what the browser would have produced with no
   * author styles at all. Until the cascade engine lands this is judged
   * against the UA baseline alone, so an inherited value counts as
   * non-default.
   */
  isDefault: boolean;
  category: Category;
  /** The value depends on layout, so it says nothing about what was authored. */
  usedValue: boolean;
};

/** `getComputedStyle` resolves these to used pixel values. */
const USED_VALUE = new Set([
  "width",
  "height",
  "top",
  "right",
  "bottom",
  "left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "transform-origin",
  "perspective-origin",
  "grid-template-columns",
  "grid-template-rows",
]);

/** Set by the document's language, never by a stylesheet. */
const IGNORED = new Set(["-webkit-locale"]);

/** Properties that only matter while another one is in effect. */
const INERT_WITHOUT: Record<string, string[]> = {
  "transform-origin": ["transform", "rotate", "scale", "translate"],
  "perspective-origin": ["perspective"],
};

const SIDE = /(^|-)(block-start|block-end|inline-start|inline-end)(-|$)/;
const AXIS = /(^|-)(block|inline)$/;
const SIZE = /(^|-)(block|inline)-size$/;
const CORNER = /^border-(start|end)-(start|end)-radius$/;

/**
 * A physical property of the same family as a logical one. Which side it
 * maps to depends on the writing mode, but the family is all that matters
 * here: if the physical properties are listed, the logical ones repeat them.
 */
export function physicalCounterpart(property: string): string | null {
  if (CORNER.test(property)) return "border-top-left-radius";
  if (SIZE.test(property)) return property.replace(SIZE, "$1height");
  if (SIDE.test(property)) {
    if (property.startsWith("inset-")) return "top";
    return property.replace(SIDE, "$1top$3");
  }
  if (AXIS.test(property)) return property.replace(AXIS, "$1x");
  return null;
}

function isInert(property: string, computed: StyleRecord): boolean {
  const drivers = INERT_WITHOUT[property];
  if (!drivers) return false;
  return drivers.every((driver) => (computed[driver] ?? "none") === "none");
}

/** `border-color`, `outline-color` and friends default to the text colour. */
function tracksCurrentColor(property: string, computed: StyleRecord, baseline: StyleRecord) {
  if (property === "color" || !property.endsWith("-color")) return false;
  const base = baseline[property];
  return base !== undefined && base === baseline.color && computed[property] === computed.color;
}

/**
 * Compare an element's computed style with the UA baseline for its tag.
 * Entries come back in property-name order, vendor-prefixed ones last.
 */
export function diffFromBaseline(computed: StyleRecord, baseline: StyleRecord): ComputedEntry[] {
  const entries: ComputedEntry[] = [];
  for (const property of Object.keys(computed)) {
    const value = computed[property];
    if (value === undefined) continue;
    const physical = physicalCounterpart(property);
    if (physical !== null && physical in computed) continue;

    const isDefault =
      IGNORED.has(property) ||
      value === baseline[property] ||
      isInert(property, computed) ||
      tracksCurrentColor(property, computed, baseline);

    entries.push({
      property,
      value,
      isDefault,
      category: categoryOf(property),
      usedValue: USED_VALUE.has(property),
    });
  }
  return entries.sort(compareProperties);
}

function compareProperties(a: ComputedEntry, b: ComputedEntry): number {
  const aPrefixed = a.property.startsWith("-");
  const bPrefixed = b.property.startsWith("-");
  if (aPrefixed !== bPrefixed) return aPrefixed ? 1 : -1;
  return a.property < b.property ? -1 : a.property > b.property ? 1 : 0;
}
