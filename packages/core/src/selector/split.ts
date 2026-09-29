import { scan } from "./scan";

/**
 * Split a selector list on top-level commas. Commas inside `:is()`, `:not()`,
 * attribute values and strings are left alone. Never throws: specificity is
 * per complex selector, so every rule passes through here.
 */
export function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = [];
  let start = 0;
  scan(selectorText, (char, index, depth) => {
    if (char === "," && depth === 0) {
      parts.push(selectorText.slice(start, index));
      start = index + 1;
    }
    return undefined;
  });
  parts.push(selectorText.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}
