import { describe, expect, it } from "vitest";
import { composeEnvelope } from "./compose";
import { hasFigmaMarkers, parseEnvelope } from "./parse";

const PAYLOAD = btoa("fig-kiwi-bytes");
const META = { fileKey: "abc", pasteID: 42, dataType: "scene" };

describe("envelope", () => {
  for (const variant of ["figma-exact", "figit"] as const) {
    it(`round-trips the ${variant} variant`, () => {
      const html = composeEnvelope(PAYLOAD, { meta: META, variant });
      const parsed = parseEnvelope(html);
      expect(new TextDecoder().decode(parsed.fig)).toBe("fig-kiwi-bytes");
      expect(parsed.meta).toEqual(META);
      expect(parsed.escaped).toBe(false);
    });
  }

  it("keeps markers inside attributes, never as comment nodes", () => {
    const html = composeEnvelope(PAYLOAD, { meta: META });
    expect(html).toContain('data-buffer="<!--(figma)');
    expect(html).toContain('data-metadata="<!--(figmeta)');
    expect(html.replace(/="[^"]*"/g, "")).not.toContain("<!--");
  });

  it("reads markers that Chrome entity-escaped", () => {
    const html = composeEnvelope(PAYLOAD, { meta: META })
      .replaceAll("<!--", "&lt;!--")
      .replaceAll("-->", "--&gt;");
    const parsed = parseEnvelope(html);
    expect(parsed.escaped).toBe(true);
    expect(parsed.meta).toEqual(META);
  });

  it("escapes the trailing text span", () => {
    const html = composeEnvelope(PAYLOAD, { text: "<b>&" });
    expect(html).toContain("&lt;b&gt;&amp;</span>");
  });

  it("rejects HTML with no payload", () => {
    expect(hasFigmaMarkers("<p>hello</p>")).toBe(false);
    expect(() => parseEnvelope("<p>hello</p>")).toThrow(/No Figma payload markers/);
  });
});
