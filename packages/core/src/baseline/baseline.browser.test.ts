import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffFromBaseline } from "../computed/diff";
import { snapshotElement } from "../computed/snapshot";
import { browserHost } from "../host";
import { type Baseline, createBaseline } from "./baseline";

const FRAME_NAME = "__conjure_baseline_test";
const host = browserHost();

let container: HTMLElement;
let root: ShadowRoot;
let baseline: Baseline;
let page: HTMLIFrameElement;

/** An unstyled document of ordinary size, standing in for a page. */
function unstyledPage(): Document {
  page = document.createElement("iframe");
  page.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;border:0");
  document.body.append(page);
  const doc = page.contentDocument as Document;
  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();
  return doc;
}

beforeEach(() => {
  container = document.createElement("baseline-test-host");
  root = container.attachShadow({ mode: "closed" });
  document.documentElement.append(container);
  baseline = createBaseline(root, FRAME_NAME);
});

afterEach(() => {
  baseline.dispose();
  container.remove();
  page?.remove();
});

function nonDefault(el: Element): string[] {
  const base = baseline.styleFor(el);
  if (!base) throw new Error("no baseline");
  return diffFromBaseline(snapshotElement(el, host), base)
    .filter((entry) => !entry.isDefault)
    .map((entry) => entry.property);
}

describe("baseline frame", () => {
  it("is created on first use, inside the container, and removed on dispose", () => {
    const before = window.length;
    expect(root.querySelector("iframe")).toBeNull();
    baseline.styleFor(document.body);
    const frame = root.querySelector("iframe");
    expect(frame?.name).toBe(FRAME_NAME);
    expect(frame?.contentDocument?.compatMode).toBe("CSS1Compat");
    expect(frame?.contentDocument?.body.childElementCount).toBe(0);
    expect(window.length).toBe(before);
    baseline.dispose();
    expect(root.querySelector("iframe")).toBeNull();
  });

  it("caches by tag", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    expect(baseline.styleFor(a)).toBe(baseline.styleFor(b));
    expect(baseline.styleFor(document.createElement("span"))).not.toBe(baseline.styleFor(a));
  });

  it("knows the UA style of each tag", () => {
    const display = (tag: string) => baseline.styleFor(document.createElement(tag))?.display;
    expect(display("div")).toBe("block");
    expect(display("span")).toBe("inline");
    expect(display("li")).toBe("list-item");
    expect(display("table")).toBe("table");
    expect(display("unknown-thing")).toBe("inline");
  });

  it("distinguishes input types", () => {
    const text = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(baseline.styleFor(text)).not.toBe(baseline.styleFor(checkbox));
  });

  it("keeps SVG apart from HTML", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "a");
    const html = document.createElement("a");
    expect(baseline.styleFor(svg)).not.toBe(baseline.styleFor(html));
  });

  it("does not run custom element constructors", () => {
    let constructed = 0;
    customElements.define(
      "baseline-probe",
      class extends HTMLElement {
        constructor() {
          super();
          constructed += 1;
        }
      },
    );
    const el = document.createElement("baseline-probe");
    expect(constructed).toBe(1);
    baseline.styleFor(el);
    expect(constructed).toBe(1);
  });

  it("recovers after dispose", () => {
    const first = baseline.styleFor(document.createElement("p"));
    baseline.dispose();
    const second = baseline.styleFor(document.createElement("p"));
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});

describe("diff against the baseline", () => {
  /** Resolved by layout, so they differ on any element that has a size. */
  const LAYOUT = new Set([
    "width",
    "height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "top",
    "right",
    "bottom",
    "left",
    "grid-template-columns",
    "grid-template-rows",
  ]);

  it.each([
    "div",
    "span",
    "p",
    "h1",
    "a",
    "ul",
    "li",
    "button",
    "input",
    "textarea",
    "select",
    "img",
    "table",
    "section",
    "label",
    "unknown-thing",
  ])("a bare <%s> in an unstyled document has nothing to report beyond layout", (tag) => {
    const doc = unstyledPage();
    const el = doc.createElement(tag);
    el.textContent = tag === "input" || tag === "img" ? "" : "text";
    doc.body.append(el);
    expect(nonDefault(el).filter((property) => !LAYOUT.has(property))).toEqual([]);
  });

  it("reports what the author set", () => {
    const doc = unstyledPage();
    const el = doc.createElement("div");
    el.setAttribute(
      "style",
      "display:flex;gap:8px;padding:4px 12px;background:rgb(37,99,235);border-radius:6px;opacity:.5",
    );
    doc.body.append(el);
    const found = nonDefault(el);
    expect(found).toEqual(
      expect.arrayContaining([
        "display",
        "row-gap",
        "column-gap",
        "padding-top",
        "padding-left",
        "background-color",
        "border-top-left-radius",
        "opacity",
      ]),
    );
    expect(found).not.toContain("color");
    expect(found).not.toContain("font-size");
    expect(found.length).toBeLessThan(30);
  });

  it("reports inherited values, which the baseline cannot tell from authored ones", () => {
    const doc = unstyledPage();
    doc.body.setAttribute("style", "color:rgb(200,0,0);font-size:20px");
    const el = doc.createElement("span");
    el.textContent = "inherits";
    doc.body.append(el);
    const found = nonDefault(el);
    expect(found).toContain("color");
    expect(found).toContain("font-size");
    // These follow the text colour, so they are not reported separately.
    expect(found).not.toContain("border-top-color");
    expect(found).not.toContain("outline-color");
    expect(found).not.toContain("text-decoration-color");
  });
});
