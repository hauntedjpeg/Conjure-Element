/**
 * Character-level scanning shared by the selector utilities. Tracks the
 * three things that can hide a delimiter: strings, escapes, and nesting.
 */
export type ScanVisitor = (char: string, index: number, depth: number) => boolean | undefined;

/**
 * Walk `input`, calling `visit` for every character that is outside strings
 * and not escaped. `depth` counts open `(` and `[`. Return true to stop.
 */
export function scan(input: string, visit: ScanVisitor): void {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charAt(i);
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (visit(char, i, depth) === true) return;
    if (char === "(" || char === "[") depth += 1;
  }
}

/** Index of the `)` closing the `(` at `open`, or -1 when unbalanced. */
export function closingParen(input: string, open: number): number {
  let close = -1;
  scan(input.slice(open), (char, index, depth) => {
    if (char === ")" && depth === 0 && index > 0) {
      close = open + index;
      return true;
    }
    return undefined;
  });
  return close;
}
