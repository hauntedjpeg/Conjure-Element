import { scan } from "./scan";

/** CSS2 pseudo-elements that may still be written with a single colon. */
const LEGACY = new Set(["before", "after", "first-line", "first-letter"]);

export type PseudoElementSplit = {
  /** The selector with its trailing pseudo-element removed. */
  base: string;
  /** Normalised to double-colon form, e.g. `::before`; null when absent. */
  pseudoElement: string | null;
};

/**
 * `element.matches()` rejects pseudo-elements, so they are stripped, the
 * remainder is matched, and values are read via `getComputedStyle(el, pseudo)`.
 *
 * Only a pseudo-element on the subject (rightmost) compound counts.
 * Pseudo-classes that follow it, as in `::after:hover`, are kept on the base.
 */
export function splitPseudoElement(selector: string): PseudoElementSplit {
  const text = selector.trim();
  let subjectStart = 0;
  let found: { start: number; end: number; name: string } | null = null;

  scan(text, (char, index, depth) => {
    if (depth !== 0) return undefined;
    if (char === " " || char === ">" || char === "+" || char === "~") {
      subjectStart = index + 1;
      found = null;
      return undefined;
    }
    if (char !== ":") return undefined;
    const double = text.charAt(index + 1) === ":";
    if (!double && text.charAt(index - 1) === ":") return undefined;
    const nameStart = index + (double ? 2 : 1);
    const name = /^[a-zA-Z-]+/.exec(text.slice(nameStart))?.[0] ?? "";
    if (name === "") return undefined;
    if (!double && !LEGACY.has(name.toLowerCase())) return undefined;
    let end = nameStart + name.length;
    if (text.charAt(end) === "(") {
      let close = -1;
      scan(text.slice(end), (c, i, d) => {
        if (c === ")" && d === 0 && i > 0) {
          close = end + i;
          return true;
        }
        return undefined;
      });
      if (close === -1) return undefined;
      end = close + 1;
    }
    if (found === null) found = { start: index, end, name: text.slice(nameStart, end) };
    return undefined;
  });

  const match = found as { start: number; end: number; name: string } | null;
  if (match === null || match.start < subjectStart) return { base: text, pseudoElement: null };
  const before = text.slice(0, match.start);
  const after = text.slice(match.end);
  const last = before.charAt(before.length - 1);
  // A bare `::before` or `.a > ::before` applies to any element.
  const needsUniversal = before === "" || /[\s>+~]/.test(last);
  return {
    base: `${before}${needsUniversal ? "*" : ""}${after}`,
    pseudoElement: `::${match.name.toLowerCase()}`,
  };
}
