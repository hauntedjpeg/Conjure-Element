import { execFileSync } from "node:child_process";

export type PasteboardItem = { type: string; length: number; base64: string | null };

export type PasteboardDump = { changeCount: number; items: PasteboardItem[] };

const MAX_BUFFER = 512 * 1024 * 1024;

/**
 * JXA source. Reading NSPasteboard directly sees every representation,
 * including custom types the web clipboard API never exposes, and none of it
 * has passed through a browser's HTML sanitiser.
 */
function script(withData: boolean): string {
  return `
ObjC.import("AppKit");
const pb = $.NSPasteboard.generalPasteboard;
const types = ObjC.deepUnwrap(pb.types) || [];
JSON.stringify({
  changeCount: Number(pb.changeCount),
  items: types.map((type) => {
    const data = pb.dataForType(type);
    const missing = data.isNil();
    return {
      type,
      length: missing ? 0 : Number(data.length),
      base64: ${withData} && !missing ? data.base64EncodedStringWithOptions(0).js : null,
    };
  }),
});`;
}

function run(withData: boolean): PasteboardDump {
  if (process.platform !== "darwin") {
    throw new Error("Pasteboard capture is macOS only; use the probe page's capture panel instead");
  }
  const out = execFileSync("osascript", ["-l", "JavaScript", "-e", script(withData)], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  return JSON.parse(out) as PasteboardDump;
}

/** Type names and sizes only; no clipboard content is read. */
export function listPasteboard(): PasteboardDump {
  return run(false);
}

export function dumpPasteboard(): PasteboardDump {
  return run(true);
}
