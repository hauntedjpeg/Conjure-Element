export type Category = "layout" | "box" | "typography" | "color" | "effects" | "other";

/** Display order in the panel. */
export const CATEGORIES: readonly Category[] = [
  "layout",
  "box",
  "typography",
  "color",
  "effects",
  "other",
];

type Rule = { category: Category; test: RegExp };

/**
 * First match wins, so the order matters: `text-decoration-color` is a
 * colour before it is typography, and `color-scheme` is neither.
 */
const RULES: Rule[] = [
  { category: "other", test: /^(color-scheme|color-interpolation|color-rendering)/ },
  { category: "other", test: /^(print-color-adjust|forced-color-adjust)$/ },
  { category: "effects", test: /^(box-shadow|text-shadow|opacity|filter|backdrop-filter)$/ },
  { category: "effects", test: /^(mix-blend-mode|background-blend-mode|isolation|will-change)$/ },
  { category: "effects", test: /^(transform|rotate|scale|translate|perspective|backface)/ },
  {
    category: "effects",
    test: /^(transition|animation|clip-path|clip$|mask|offset-|view-transition)/,
  },
  { category: "color", test: /(^|-)color$/ },
  { category: "color", test: /^(background|fill|stroke|accent|caret)/ },
  { category: "box", test: /^(min-|max-)?(width|height|block-size|inline-size)$/ },
  { category: "box", test: /^(margin|padding|border|outline|box-sizing|aspect-ratio)/ },
  { category: "layout", test: /^(display|position|top|right|bottom|left|inset|float|clear)$/ },
  { category: "layout", test: /^(inset-|z-index$|visibility$|vertical-align$|table-layout$)/ },
  { category: "layout", test: /^(flex|order$|grid|gap$|row-gap$|column-gap$|columns$|column-)/ },
  { category: "layout", test: /^(align-|justify-|place-|overflow|contain|content-visibility)/ },
  { category: "layout", test: /^(anchor-|position-|object-fit$|object-position$)/ },
  { category: "typography", test: /^(font|line-|letter-spacing|word-|text-|white-space|tab-size)/ },
  { category: "typography", test: /^(hyphen|overflow-wrap|direction$|unicode-bidi|writing-mode)/ },
  { category: "typography", test: /^(list-style|quotes$|hanging-punctuation|ruby|initial-letter)/ },
];

const PREFIX = /^-(webkit|moz|ms|o|apple|epub)-/;

export function categoryOf(property: string): Category {
  if (property.startsWith("--")) return "other";
  const name = property.replace(PREFIX, "");
  for (const rule of RULES) {
    if (rule.test.test(name)) return rule.category;
  }
  return "other";
}
