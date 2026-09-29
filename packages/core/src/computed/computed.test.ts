import { describe, expect, it } from "vitest";
import { categoryOf } from "./categories";
import { diffFromBaseline, physicalCounterpart } from "./diff";
import { filterEntries, groupByCategory, matchesQuery } from "./search";

describe("categoryOf", () => {
  it.each([
    ["display", "layout"],
    ["position", "layout"],
    ["top", "layout"],
    ["z-index", "layout"],
    ["flex-direction", "layout"],
    ["grid-template-columns", "layout"],
    ["row-gap", "layout"],
    ["justify-content", "layout"],
    ["overflow-x", "layout"],
    ["width", "box"],
    ["min-height", "box"],
    ["margin-top", "box"],
    ["padding-left", "box"],
    ["border-top-width", "box"],
    ["border-top-left-radius", "box"],
    ["box-sizing", "box"],
    ["outline-style", "box"],
    ["font-size", "typography"],
    ["line-height", "typography"],
    ["letter-spacing", "typography"],
    ["text-transform", "typography"],
    ["white-space-collapse", "typography"],
    ["-webkit-font-smoothing", "typography"],
    ["color", "color"],
    ["background-color", "color"],
    ["background-image", "color"],
    ["border-top-color", "color"],
    ["text-decoration-color", "color"],
    ["-webkit-text-fill-color", "color"],
    ["fill", "color"],
    ["box-shadow", "effects"],
    ["text-shadow", "effects"],
    ["opacity", "effects"],
    ["backdrop-filter", "effects"],
    ["transform", "effects"],
    ["transition-duration", "effects"],
    ["mix-blend-mode", "effects"],
    ["color-scheme", "other"],
    ["print-color-adjust", "other"],
    ["cursor", "other"],
    ["pointer-events", "other"],
    ["--brand", "other"],
  ] as const)("%s is %s", (property, category) => {
    expect(categoryOf(property)).toBe(category);
  });
});

describe("physicalCounterpart", () => {
  it.each([
    ["margin-block-start", "margin-top"],
    ["padding-inline-end", "padding-top"],
    ["border-block-end-width", "border-top-width"],
    ["border-inline-start-color", "border-top-color"],
    ["inset-block-start", "top"],
    ["inset-inline-end", "top"],
    ["block-size", "height"],
    ["inline-size", "height"],
    ["min-inline-size", "min-height"],
    ["max-block-size", "max-height"],
    ["contain-intrinsic-block-size", "contain-intrinsic-height"],
    ["border-start-end-radius", "border-top-left-radius"],
    ["overflow-block", "overflow-x"],
    ["overscroll-behavior-inline", "overscroll-behavior-x"],
    ["scroll-margin-block-start", "scroll-margin-top"],
  ])("%s repeats %s", (logical, physical) => {
    expect(physicalCounterpart(logical)).toBe(physical);
  });

  it.each(["margin-top", "display", "width", "text-align", "line-break"])(
    "%s is not logical",
    (property) => {
      expect(physicalCounterpart(property)).toBeNull();
    },
  );
});

describe("diffFromBaseline", () => {
  const baseline = {
    color: "rgb(0, 0, 0)",
    display: "block",
    "border-top-color": "rgb(0, 0, 0)",
    "background-color": "rgba(0, 0, 0, 0)",
    "margin-top": "0px",
    "margin-block-start": "0px",
    width: "0px",
    transform: "none",
    "transform-origin": "0px 0px",
    "-webkit-locale": "auto",
  };

  function diff(overrides: Record<string, string>) {
    const entries = diffFromBaseline({ ...baseline, ...overrides }, baseline);
    return Object.fromEntries(entries.map((entry) => [entry.property, entry]));
  }

  it("marks values that match the baseline as default", () => {
    const result = diff({ display: "flex" });
    expect(result.display?.isDefault).toBe(false);
    expect(result["background-color"]?.isDefault).toBe(true);
  });

  it("drops logical aliases when the physical property is listed", () => {
    const result = diff({ "margin-top": "8px", "margin-block-start": "8px" });
    expect(result["margin-top"]?.isDefault).toBe(false);
    expect(result["margin-block-start"]).toBeUndefined();
  });

  it("keeps a logical property that has no physical counterpart listed", () => {
    const entries = diffFromBaseline({ "inline-size": "10px" }, { "inline-size": "0px" });
    expect(entries.map((entry) => entry.property)).toEqual(["inline-size"]);
  });

  it("treats colours that follow the text colour as default", () => {
    const result = diff({ color: "rgb(255, 0, 0)", "border-top-color": "rgb(255, 0, 0)" });
    expect(result.color?.isDefault).toBe(false);
    expect(result["border-top-color"]?.isDefault).toBe(true);
  });

  it("reports a colour that differs from the text colour", () => {
    const result = diff({ color: "rgb(255, 0, 0)", "border-top-color": "rgb(0, 0, 255)" });
    expect(result["border-top-color"]?.isDefault).toBe(false);
  });

  it("does not apply the text-colour rule to colours with their own default", () => {
    const result = diff({ color: "rgba(0, 0, 0, 0)" });
    // The baseline background is transparent, not the text colour.
    expect(result["background-color"]?.isDefault).toBe(true);
    const changed = diff({ color: "rgb(1, 1, 1)", "background-color": "rgb(1, 1, 1)" });
    expect(changed["background-color"]?.isDefault).toBe(false);
  });

  it("hides transform-origin unless a transform is in effect", () => {
    expect(diff({ "transform-origin": "50px 20px" })["transform-origin"]?.isDefault).toBe(true);
    const moved = diff({ "transform-origin": "50px 20px", transform: "matrix(1, 0, 0, 1, 0, 0)" });
    expect(moved["transform-origin"]?.isDefault).toBe(false);
  });

  it("flags layout-dependent values", () => {
    const result = diff({ width: "300px" });
    expect(result.width).toMatchObject({ isDefault: false, usedValue: true });
    expect(result.display?.usedValue).toBe(false);
  });

  it("ignores the document language", () => {
    expect(diff({ "-webkit-locale": '"en"' })["-webkit-locale"]?.isDefault).toBe(true);
  });

  it("sorts by name with vendor-prefixed properties last", () => {
    const entries = diffFromBaseline(
      { "-webkit-line-clamp": "none", width: "1px", color: "red", "--x": "1" },
      {},
    );
    expect(entries.map((entry) => entry.property)).toEqual([
      "color",
      "width",
      "--x",
      "-webkit-line-clamp",
    ]);
  });
});

describe("search", () => {
  const entries = diffFromBaseline(
    {
      display: "flex",
      "background-color": "rgb(37, 99, 235)",
      "font-size": "16px",
      "font-weight": "400",
      opacity: "1",
    },
    { "font-weight": "400", opacity: "1" },
  );

  it("matches on property name or value, ignoring case", () => {
    const names = (query: string) =>
      entries.filter((entry) => matchesQuery(entry, query)).map((entry) => entry.property);
    expect(names("FONT")).toEqual(["font-size", "font-weight"]);
    expect(names("rgb(37")).toEqual(["background-color"]);
    expect(names("font 16")).toEqual(["font-size"]);
    expect(names("   ")).toHaveLength(5);
    expect(names("nothing")).toEqual([]);
  });

  it("hides defaults unless asked", () => {
    const shown = filterEntries(entries, { query: "", showAll: false });
    expect(shown.map((entry) => entry.property)).toEqual([
      "background-color",
      "display",
      "font-size",
    ]);
    expect(filterEntries(entries, { query: "", showAll: true })).toHaveLength(5);
    expect(filterEntries(entries, { query: "weight", showAll: false })).toEqual([]);
  });

  it("groups in display order and omits empty groups", () => {
    const groups = groupByCategory(filterEntries(entries, { query: "", showAll: true }));
    expect(groups.map((group) => [group.category, group.entries.length])).toEqual([
      ["layout", 1],
      ["typography", 2],
      ["color", 1],
      ["effects", 1],
    ]);
  });
});
