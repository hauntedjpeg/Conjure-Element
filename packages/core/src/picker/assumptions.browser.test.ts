/**
 * Browser behaviour the picker and the UA baseline are built on, pinned in
 * both engines. Findings are written up in docs/decisions/0003.
 */
import { afterEach, describe, expect, it } from "vitest";

const FRAME_NAME = "__conjure_spike_frame";

let cleanup: (() => void)[] = [];

afterEach(() => {
  for (const undo of cleanup) undo();
  cleanup = [];
});

function shadowHost(mode: ShadowRootMode): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("spike-host");
  const root = host.attachShadow({ mode });
  document.documentElement.append(host);
  cleanup.push(() => host.remove());
  return { host, root };
}

function hiddenFrame(parent: Node): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.name = FRAME_NAME;
  frame.setAttribute(
    "style",
    "position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none",
  );
  parent.appendChild(frame);
  return frame;
}

function writeStandards(frame: HTMLIFrameElement): Document {
  const doc = frame.contentDocument;
  if (!doc) throw new Error("no contentDocument");
  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();
  return doc;
}

describe("baseline frame", () => {
  it("is quirks mode until a doctype is written, synchronously", () => {
    const { root } = shadowHost("closed");
    const frame = hiddenFrame(root);
    expect(frame.contentDocument?.compatMode).toBe("BackCompat");
    const doc = writeStandards(frame);
    expect(doc.compatMode).toBe("CSS1Compat");
    expect(frame.contentDocument).toBe(doc);
  });

  it("computes styles while zero-sized and hidden", () => {
    const { root } = shadowHost("closed");
    const doc = writeStandards(hiddenFrame(root));
    const div = doc.createElement("div");
    const span = doc.createElement("span");
    const button = doc.createElement("button");
    doc.body.append(div, span, button);
    const view = doc.defaultView as Window;
    expect(view.getComputedStyle(div).display).toBe("block");
    expect(view.getComputedStyle(span).display).toBe("inline");
    expect(view.getComputedStyle(button).display).toBe("inline-block");
    expect(view.getComputedStyle(div).length).toBeGreaterThan(200);
    // Inherited from the frame's own hidden root, not from its container.
    expect(view.getComputedStyle(div).visibility).toBe("visible");
  });

  it("computes nothing for a disconnected element", () => {
    const { root } = shadowHost("closed");
    const doc = writeStandards(hiddenFrame(root));
    const div = doc.createElement("div");
    const style = (doc.defaultView as Window).getComputedStyle(div);
    expect(style.display).toBe("");
  });

  it("inside a shadow root is invisible to window.length", () => {
    const before = window.length;
    const { root } = shadowHost("closed");
    const frame = hiddenFrame(root);
    expect(window.length).toBe(before);
    expect(frame.contentWindow).not.toBeNull();
  });

  it("inside a shadow root is not reachable by name", () => {
    const { root } = shadowHost("closed");
    hiddenFrame(root);
    expect((window as unknown as Record<string, unknown>)[FRAME_NAME]).toBeUndefined();
  });
});

describe("hit testing", () => {
  it("document.elementsFromPoint stops at a shadow host", () => {
    const { host, root } = shadowHost("open");
    host.setAttribute("style", "position:fixed;left:0;top:0;width:100px;height:100px;z-index:999");
    root.innerHTML = '<div id="inner" style="width:100px;height:100px"></div>';
    const hits = document.elementsFromPoint(10, 10);
    expect(hits[0]).toBe(host);
    expect(hits.some((el) => el.id === "inner")).toBe(false);
  });

  it("ShadowRoot.elementsFromPoint also returns elements outside the root", () => {
    const { host, root } = shadowHost("open");
    host.setAttribute("style", "position:fixed;left:0;top:0;width:100px;height:100px;z-index:999");
    root.innerHTML = '<div id="inner" style="width:100px;height:100px"></div>';
    const hits = root.elementsFromPoint(10, 10);
    expect(hits[0]?.id).toBe("inner");
    const outside = hits.filter((el) => el.getRootNode() !== root);
    expect(outside.length).toBeGreaterThan(0);
  });

  it("skips elements with pointer-events: none", () => {
    const { host, root } = shadowHost("open");
    host.setAttribute(
      "style",
      "position:fixed;left:0;top:0;width:100px;height:100px;z-index:999;pointer-events:none",
    );
    root.innerHTML = '<div style="width:100px;height:100px"></div>';
    expect(document.elementsFromPoint(10, 10)).not.toContain(host);
  });

  it("a closed root hides its content from the outside", () => {
    const { host, root } = shadowHost("closed");
    host.setAttribute("style", "position:fixed;left:0;top:0;width:100px;height:100px;z-index:999");
    root.innerHTML = '<div style="width:100px;height:100px"></div>';
    expect(host.shadowRoot).toBeNull();
    expect(document.elementsFromPoint(10, 10)[0]).toBe(host);
  });
});

describe("slots", () => {
  it("assignedSlot is null under a closed root, even for slotted content", () => {
    const { host, root } = shadowHost("closed");
    root.innerHTML = "<slot></slot>";
    const child = document.createElement("span");
    child.textContent = "slotted";
    host.append(child);
    expect(child.assignedSlot).toBeNull();
    expect(child.getClientRects().length).toBeGreaterThan(0);
  });

  it("unslotted light DOM under a shadow root is not rendered", () => {
    const { host, root } = shadowHost("closed");
    root.innerHTML = "<p>shadow only</p>";
    const child = document.createElement("span");
    child.textContent = "orphan";
    host.append(child);
    expect(child.getClientRects().length).toBe(0);
    expect(host.getClientRects().length).toBeGreaterThan(0);
  });
});
