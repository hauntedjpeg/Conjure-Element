import type { Specificity } from "../types";
import { closingParen, scan } from "./scan";
import { splitSelectorList } from "./split";

const ZERO: Specificity = [0, 0, 0];

/** CSS2 pseudo-elements that may be written with a single colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);

/** Take the most specific argument: `:is()`, `:not()`, `:has()`. */
const MAX_OF_ARGS = new Set(["is", "not", "has", "matches", "-webkit-any", "-moz-any"]);

/** A pseudo-class plus the most specific selector in the `of S` clause. */
const NTH_WITH_OF = new Set(["nth-child", "nth-last-child"]);

/** Pseudo-elements whose argument is a selector that adds to specificity. */
const PSEUDO_ELEMENT_WITH_SELECTOR = new Set(["slotted"]);

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function maxOfList(list: string): Specificity {
  let best: Specificity = ZERO;
  for (const selector of splitSelectorList(list)) {
    const candidate = specificity(selector);
    if (compareSpecificity(candidate, best) > 0) best = candidate;
  }
  return best;
}

const IDENT = /^(?:[a-zA-Z0-9_ -￿-]|\\.)+/;

function readIdent(text: string, from: number): string {
  return IDENT.exec(text.slice(from))?.[0] ?? "";
}

/**
 * Specificity of one complex selector (no top-level commas).
 *
 * - `:where()` contributes nothing.
 * - `:is()`, `:not()`, `:has()` take their most specific argument.
 * - `:nth-child(An+B of S)` is a pseudo-class plus the most specific `S`.
 * - Pseudo-elements count as types, `::slotted(S)` adds its argument.
 * - `:host(S)` and `:host-context(S)` are a pseudo-class plus their argument.
 */
export function specificity(selector: string): Specificity {
  let total: Specificity = ZERO;
  let skipUntil = -1;
  let expectType = true;

  scan(selector, (char, index, depth) => {
    if (index < skipUntil) return undefined;

    if (depth > 0) return undefined;

    if (char === "[") {
      total = add(total, [0, 1, 0]);
      expectType = false;
      return undefined;
    }
    if (char === "]") return undefined;

    if (char === " " || char === ">" || char === "+" || char === "~" || char === "|") {
      // `|` is a namespace separator: the prefix before it was not a type.
      expectType = true;
      return undefined;
    }

    if (char === "#") {
      total = add(total, [1, 0, 0]);
      skipUntil = index + 1 + readIdent(selector, index + 1).length;
      expectType = false;
      return undefined;
    }

    if (char === ".") {
      total = add(total, [0, 1, 0]);
      skipUntil = index + 1 + readIdent(selector, index + 1).length;
      expectType = false;
      return undefined;
    }

    if (char === ":") {
      const double = selector.charAt(index + 1) === ":";
      const nameStart = index + (double ? 2 : 1);
      const name = readIdent(selector, nameStart).toLowerCase();
      let end = nameStart + name.length;
      let args: string | null = null;
      if (selector.charAt(end) === "(") {
        const close = closingParen(selector, end);
        if (close !== -1) {
          args = selector.slice(end + 1, close);
          end = close + 1;
        }
      }
      skipUntil = end;
      expectType = false;

      if (double || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        total = add(total, [0, 0, 1]);
        if (args !== null && PSEUDO_ELEMENT_WITH_SELECTOR.has(name)) {
          total = add(total, maxOfList(args));
        }
        return undefined;
      }
      if (name === "where") return undefined;
      if (MAX_OF_ARGS.has(name)) {
        if (args !== null) total = add(total, maxOfList(args));
        return undefined;
      }
      total = add(total, [0, 1, 0]);
      if (args === null) return undefined;
      if (NTH_WITH_OF.has(name)) {
        const of = /\sof\s/i.exec(args);
        if (of) total = add(total, maxOfList(args.slice(of.index + of[0].length)));
      } else if (name === "host" || name === "host-context") {
        total = add(total, maxOfList(args));
      }
      return undefined;
    }

    if (char === "*" || char === "&") {
      // Universal adds nothing. `&` is resolved by desugaring before this runs.
      expectType = false;
      return undefined;
    }

    if (expectType && /[a-zA-Z_ -￿\\]/.test(char)) {
      const ident = readIdent(selector, index);
      const next = selector.charAt(index + ident.length);
      skipUntil = index + ident.length;
      // `svg|rect`: `svg` is a namespace prefix, not a type.
      if (next === "|" && selector.charAt(index + ident.length + 1) !== "=") return undefined;
      total = add(total, [0, 0, 1]);
      expectType = false;
    }
    return undefined;
  });

  return total;
}
