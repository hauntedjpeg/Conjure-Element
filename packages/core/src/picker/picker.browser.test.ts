import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { suspectClosedRoot } from "./closed-root";
import {
  ancestorChain,
  breadcrumb,
  defaultPickerEnv,
  flatChildren,
  flatParent,
  navigate,
} from "./composed-tree";
import { deepElementFromPoint } from "./hit-test";
import { summarize } from "./summary";

const env = defaultPickerEnv();

let stage: HTMLElement;

function define(name: string, mode: ShadowRootMode | null, html = ""): void {
  if (customElements.get(name)) return;
  customElements.define(
    name,
    class extends HTMLElement {
      constructor() {
        super();
        if (mode) this.attachShadow({ mode }).innerHTML = html;
      }
    },
  );
}

beforeEach(() => {
  define(
    "t-badge",
    "open",
    '<style>.dot{display:block;width:20px;height:20px}</style><i class="dot"></i>',
  );
  define(
    "t-card",
    "open",
    `<style>:host{display:block}</style>
     <header class="header"><slot name="title"><em id="fallback">Untitled</em></slot></header>
     <div class="body"><slot></slot></div>
     <t-badge id="badge"></t-badge>`,
  );
  define("t-vault", "closed", '<button style="width:80px;height:30px">secret</button>');
  define("t-vault-slotted", "closed", "<slot></slot>");
  define("t-vault-unslotted", "closed", "<p>shadow only</p>");
  define("t-plain", null);

  stage = document.createElement("div");
  stage.id = "stage";
  stage.setAttribute(
    "style",
    "position:fixed;left:0;top:0;width:400px;z-index:99999;background:#fff",
  );
  stage.innerHTML = `
    <t-card id="card"><h2 slot="title" id="title">Title</h2><p id="body">Body</p><b id="extra">x</b></t-card>
    <t-card id="empty-card"></t-card>
    <t-vault id="vault"></t-vault>
    <t-vault-slotted id="vault-slotted"><span>light</span></t-vault-slotted>
    <t-vault-unslotted id="vault-unslotted"><span>orphan</span></t-vault-unslotted>
    <t-plain id="plain"><span id="plain-child">child</span></t-plain>
    <t-plain id="plain-empty" style="display:block;height:0"></t-plain>
    <ul id="list"><li id="one">1</li><li id="two">2</li><li id="three">3</li></ul>`;
  document.body.append(stage);
});

afterEach(() => {
  stage.remove();
});

function byId(id: string): HTMLElement {
  return stage.querySelector(`#${id}`) as HTMLElement;
}

function inCard(selector: string): HTMLElement {
  return byId("card").shadowRoot?.querySelector(selector) as HTMLElement;
}

describe("flattened tree", () => {
  it("a slotted element's parent is its slot", () => {
    const parent = flatParent(byId("title"));
    expect(parent?.localName).toBe("slot");
    expect(parent?.getAttribute("name")).toBe("title");
    expect(flatParent(parent as Element)).toBe(inCard(".header"));
  });

  it("the top of a shadow tree hangs off the host", () => {
    expect(flatParent(inCard(".header"))).toBe(byId("card"));
  });

  it("the document element has no parent", () => {
    expect(flatParent(document.documentElement)).toBeNull();
  });

  it("a host's children are its shadow tree, without the style element", () => {
    const children = flatChildren(byId("card"), env);
    expect(children.map((el) => el.localName)).toEqual(["header", "div", "t-badge"]);
  });

  it("a slot's children are what is assigned to it", () => {
    const slot = inCard(".body slot");
    expect(flatChildren(slot, env).map((el) => el.id)).toEqual(["body", "extra"]);
  });

  it("an empty slot's children are its fallback content", () => {
    const slot = byId("empty-card").shadowRoot?.querySelector("slot[name=title]") as Element;
    expect(flatChildren(slot, env).map((el) => el.id)).toEqual(["fallback"]);
  });

  it("ignores what the environment says to ignore", () => {
    const skipping = defaultPickerEnv({ ignore: (el) => el.id === "two" });
    expect(flatChildren(byId("list"), skipping).map((el) => el.id)).toEqual(["one", "three"]);
  });

  it("chains from the document element through slots and hosts", () => {
    const chain = ancestorChain(byId("body")).map((el) => el.id || el.localName);
    expect(chain).toEqual(["html", "body", "stage", "card", "div", "slot", "body"]);
  });
});

describe("navigate", () => {
  it("walks siblings and stops at the ends", () => {
    expect(navigate(byId("one"), "next", env)).toBe(byId("two"));
    expect(navigate(byId("two"), "previous", env)).toBe(byId("one"));
    expect(navigate(byId("one"), "previous", env)).toBeNull();
    expect(navigate(byId("three"), "next", env)).toBeNull();
  });

  it("goes down into a shadow tree and back up", () => {
    const header = navigate(byId("card"), "child", env);
    expect(header).toBe(inCard(".header"));
    expect(navigate(header as Element, "parent", env)).toBe(byId("card"));
  });

  it("treats elements assigned to the same slot as siblings", () => {
    expect(navigate(byId("body"), "next", env)).toBe(byId("extra"));
    // The title is in another slot, although it is a DOM sibling.
    expect(navigate(byId("body"), "previous", env)).toBeNull();
  });

  it("crosses nested shadow roots", () => {
    const badge = inCard("#badge");
    const dot = navigate(badge, "child", env);
    expect(dot?.className).toBe("dot");
    expect(navigate(dot as Element, "parent", env)).toBe(badge);
  });

  it("has nowhere to go inside a leaf", () => {
    expect(navigate(byId("one"), "child", env)).toBeNull();
  });
});

describe("breadcrumb", () => {
  it("marks where the path enters a shadow tree", () => {
    const { crumbs, elements } = breadcrumb(
      inCard("#badge").shadowRoot?.querySelector(".dot") as Element,
    );
    const text = crumbs.map((crumb) =>
      crumb.kind === "element" ? crumb.label : crumb.kind === "shadow-root" ? "#shadow-root" : "",
    );
    expect(text).toEqual([
      "html",
      "body",
      "div#stage",
      "t-card#card",
      "#shadow-root",
      "t-badge#badge",
      "#shadow-root",
      "i.dot",
    ]);
    expect(elements).toHaveLength(6);
  });

  it("routes slotted content through its slot", () => {
    const { crumbs, elements } = breadcrumb(byId("title"));
    const tail = crumbs.slice(-5);
    expect(tail.map((crumb) => crumb.kind)).toEqual([
      "element",
      "shadow-root",
      "element",
      "element",
      "element",
    ]);
    const slot = tail[3];
    expect(slot).toMatchObject({ kind: "element", label: "slot", slot: true });
    const last = tail[4];
    if (last?.kind !== "element") throw new Error("expected an element crumb");
    expect(elements[last.index]).toBe(byId("title"));
  });

  it("indexes every element crumb into the chain", () => {
    const { crumbs, elements } = breadcrumb(byId("two"));
    for (const crumb of crumbs) {
      if (crumb.kind === "element") expect(elements[crumb.index]).toBeDefined();
    }
    expect(elements.at(-1)).toBe(byId("two"));
  });
});

describe("deepElementFromPoint", () => {
  function centre(el: Element): [number, number] {
    const rect = el.getBoundingClientRect();
    return [rect.x + rect.width / 2, rect.y + rect.height / 2];
  }

  it("finds an element inside nested open roots", () => {
    const dot = inCard("#badge").shadowRoot?.querySelector(".dot") as Element;
    expect(deepElementFromPoint(document, ...centre(dot), env)).toBe(dot);
  });

  it("finds slotted content", () => {
    expect(deepElementFromPoint(document, ...centre(byId("body")), env)).toBe(byId("body"));
  });

  it("stops at the host of a closed root", () => {
    expect(deepElementFromPoint(document, ...centre(byId("vault")), env)).toBe(byId("vault"));
  });

  it("looks past ignored elements", () => {
    const cover = document.createElement("div");
    cover.setAttribute("style", "position:fixed;inset:0;z-index:999999");
    document.body.append(cover);
    try {
      const skipping = defaultPickerEnv({ ignore: (el) => el === cover });
      expect(deepElementFromPoint(document, ...centre(byId("two")), env)).toBe(cover);
      expect(deepElementFromPoint(document, ...centre(byId("two")), skipping)).toBe(byId("two"));
    } finally {
      cover.remove();
    }
  });

  it("returns null outside the viewport", () => {
    expect(deepElementFromPoint(document, -10, -10, env)).toBeNull();
  });
});

describe("suspectClosedRoot", () => {
  it.each([
    ["card", "none"],
    ["plain", "none"],
    ["plain-empty", "none"],
    ["vault", "suspected"],
    ["vault-unslotted", "suspected"],
    // Indistinguishable from an element with no root at all.
    ["vault-slotted", "none"],
    ["list", "none"],
  ] as const)("%s: %s", (id, expected) => {
    expect(suspectClosedRoot(byId(id))).toBe(expected);
  });
});

describe("summarize", () => {
  it("reads tag, id, classes and border-box size", () => {
    const el = document.createElement("button");
    el.id = "save";
    el.className = "btn primary";
    el.setAttribute("style", "box-sizing:border-box;width:120px;height:40.5px;padding:0;border:0");
    stage.append(el);
    expect(summarize(el)).toEqual({
      tag: "button",
      id: "save",
      classes: ["btn", "primary"],
      width: 120,
      height: 40.5,
    });
  });

  it("handles SVG, whose className is not a string", () => {
    stage.insertAdjacentHTML(
      "beforeend",
      '<svg width="10" height="10"><rect class="r" width="5" height="5"/></svg>',
    );
    const rect = stage.querySelector("rect") as Element;
    expect(summarize(rect)).toMatchObject({ tag: "rect", id: null, classes: ["r"] });
  });
});
