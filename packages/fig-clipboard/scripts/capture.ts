/**
 * Capture whatever Figma just put on the macOS pasteboard.
 *
 *   pnpm probe:capture <name>      write fixtures/captured/<name>/
 *   pnpm probe:capture --types     list pasteboard types and sizes only
 *   pnpm probe:changecount         print the pasteboard change counter
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSummary, jsonReplacer, summarize } from "../src/index";
import { findPayload } from "./lib/find-payloads";
import { dumpPasteboard, listPasteboard } from "./lib/pasteboard";

const FIXTURES = fileURLToPath(new URL("../fixtures/captured/", import.meta.url));
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function printTypes(items: { type: string; length: number }[]): void {
  if (items.length === 0) {
    console.log("  (pasteboard is empty)");
    return;
  }
  const width = Math.max(...items.map((item) => item.type.length));
  for (const item of items) {
    console.log(`  ${item.type.padEnd(width)}  ${item.length} bytes`);
  }
}

function safeFileName(type: string): string {
  return type.replace(/[^A-Za-z0-9._-]/g, "_");
}

function capture(name: string): void {
  const dump = dumpPasteboard();
  const dir = join(FIXTURES, name);
  mkdirSync(join(dir, "raw"), { recursive: true });

  console.log(`changeCount ${dump.changeCount}`);
  console.log("pasteboard types:");
  printTypes(dump.items);

  const found = [];
  for (const item of dump.items) {
    if (item.base64 === null) continue;
    const bytes = new Uint8Array(Buffer.from(item.base64, "base64"));
    writeFileSync(join(dir, "raw", `${safeFileName(item.type)}.bin`), bytes);
    try {
      const payload = findPayload(item.type, bytes);
      if (payload) found.push(payload);
    } catch (error) {
      console.log(`\n${item.type}: has Figma markers but failed to decode: ${String(error)}`);
    }
  }

  writeFileSync(
    join(dir, "types.json"),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        changeCount: dump.changeCount,
        types: dump.items.map(({ type, length }) => ({ type, length })),
        payloads: found.map(({ type, form }) => ({ type, form })),
      },
      null,
      2,
    )}\n`,
  );

  if (found.length === 0) {
    console.log("\nNo Figma payload on the pasteboard.");
    console.log("If you just pressed ⌘⌥C, that is a finding: record it in docs/probe/RESULTS.md.");
    console.log(`Raw representations saved to ${join(dir, "raw")}`);
    return;
  }

  // Prefer the HTML envelope: it is the only form a web page can write back.
  const primary = found.find((payload) => payload.form === "html-envelope") ?? found[0];
  if (!primary) return;
  const summary = summarize(primary.decoded);
  if (primary.html !== null) writeFileSync(join(dir, "public.html"), primary.html);
  writeFileSync(join(dir, "meta.json"), `${JSON.stringify(primary.decoded.meta, null, 2)}\n`);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    join(dir, "decoded.json"),
    `${JSON.stringify(primary.decoded.message, jsonReplacer, 2)}\n`,
  );

  console.log(`\nFigma payload found in ${primary.type} (${primary.form})`);
  for (const other of found) {
    if (other !== primary) console.log(`also present in ${other.type} (${other.form})`);
  }
  console.log(formatSummary(summary));
  console.log(`\nSaved to ${dir}`);
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "--changecount") {
    console.log(listPasteboard().changeCount);
    return;
  }
  if (arg === "--types") {
    const dump = listPasteboard();
    console.log(`changeCount ${dump.changeCount}`);
    printTypes(dump.items);
    return;
  }
  if (!arg || !NAME_PATTERN.test(arg)) {
    console.error("Usage: pnpm probe:capture <name>   (letters, digits, . _ -)");
    console.error("       pnpm probe:capture --types");
    console.error("       pnpm probe:changecount");
    process.exitCode = 1;
    return;
  }
  capture(arg);
}

main();
