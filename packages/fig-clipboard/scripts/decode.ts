/**
 * Decode a saved clipboard HTML file.
 *
 *   pnpm --filter @conjure/fig-clipboard decode <file.html> [--json]
 */
import { readFileSync } from "node:fs";
import { decodeClipboardHtml, formatSummary, jsonReplacer, summarize } from "../src/index";

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error("Usage: decode <file.html> [--json]");
  process.exitCode = 1;
} else {
  const decoded = decodeClipboardHtml(readFileSync(file, "utf8"));
  if (flag === "--json") {
    console.log(JSON.stringify(decoded.message, jsonReplacer, 2));
  } else {
    console.log(formatSummary(summarize(decoded)));
  }
}
