import { suspectClosedRoot } from "./closed-root";
import type { PickerEnv } from "./env";
import { selectorLabel } from "./summary";

export type Crumb =
  | {
      kind: "element";
      label: string;
      /** Position in the element chain, root first. */
      index: number;
      slot: boolean;
    }
  | { kind: "shadow-root"; mode: ShadowRootMode }
  /** Added by the extension in front of a selection inside a frame. */
  | { kind: "frame"; url: string };

export type NavDirection = "parent" | "child" | "previous" | "next";

/** Elements that take no part in rendering; arrow keys step over them. */
const UNRENDERED = new Set([
  "head",
  "style",
  "script",
  "template",
  "link",
  "meta",
  "title",
  "base",
  "noscript",
]);

export function defaultPickerEnv(overrides: Partial<PickerEnv> = {}): PickerEnv {
  return {
    shadowRootOf: (el) => el.shadowRoot,
    closedRoot: suspectClosedRoot,
    ignore: () => false,
    ...overrides,
  };
}

/** `instanceof` fails across frames, so go by shape. */
function asShadowRoot(node: Node | null): ShadowRoot | null {
  return node !== null && node.nodeType === 11 && "host" in node ? (node as ShadowRoot) : null;
}

function asElement(node: Node | null): Element | null {
  return node !== null && node.nodeType === 1 ? (node as Element) : null;
}

function isSlot(el: Element): el is HTMLSlotElement {
  return el.localName === "slot" && "assignedElements" in el;
}

/**
 * The parent in the flattened tree: a slotted element's parent is its slot,
 * and the top of a shadow tree hangs off its host. Inheritance follows this
 * tree, not the DOM.
 */
export function flatParent(el: Element): Element | null {
  if (el.assignedSlot) return el.assignedSlot;
  const parent = el.parentNode;
  return asShadowRoot(parent)?.host ?? asElement(parent);
}

function navigable(elements: Iterable<Element>, env: PickerEnv): Element[] {
  return Array.from(elements).filter((el) => !UNRENDERED.has(el.localName) && !env.ignore(el));
}

export function flatChildren(el: Element, env: PickerEnv): Element[] {
  const root = env.shadowRootOf(el);
  if (root) return navigable(root.children, env);
  if (isSlot(el)) {
    const assigned = el.assignedElements();
    // With nothing assigned, the slot renders its own fallback content.
    return navigable(assigned.length > 0 ? assigned : el.children, env);
  }
  return navigable(el.children, env);
}

function siblings(el: Element, env: PickerEnv): Element[] {
  const parent = flatParent(el);
  if (!parent) return [el];
  const flat = flatChildren(parent, env);
  if (flat.includes(el)) return flat;
  // Light DOM that no slot picked up: it has DOM siblings and nothing else.
  return navigable(el.parentElement?.children ?? [el], env);
}

export function navigate(el: Element, direction: NavDirection, env: PickerEnv): Element | null {
  switch (direction) {
    case "parent":
      return flatParent(el);
    case "child":
      return flatChildren(el, env)[0] ?? null;
    case "previous":
    case "next": {
      const all = siblings(el, env);
      const at = all.indexOf(el);
      if (at === -1) return null;
      return all[at + (direction === "next" ? 1 : -1)] ?? null;
    }
  }
}

/** From the document element down to `el`, along the flattened tree. */
export function ancestorChain(el: Element): Element[] {
  const chain: Element[] = [];
  const seen = new Set<Element>();
  for (let at: Element | null = el; at && !seen.has(at); at = flatParent(at)) {
    seen.add(at);
    chain.unshift(at);
  }
  return chain;
}

export type Breadcrumb = { crumbs: Crumb[]; elements: Element[] };

/**
 * The breadcrumb for `el`, with a marker wherever the path enters a shadow
 * tree: `my-card › #shadow-root › .header`.
 */
export function breadcrumb(el: Element): Breadcrumb {
  const elements = ancestorChain(el);
  const crumbs: Crumb[] = [];
  elements.forEach((element, index) => {
    const root = asShadowRoot(element.parentNode);
    if (root && root.host === elements[index - 1]) {
      crumbs.push({ kind: "shadow-root", mode: root.mode });
    }
    crumbs.push({
      kind: "element",
      label: selectorLabel({
        tag: element.localName,
        id: element.id || null,
        classes: Array.from(element.classList),
      }),
      index,
      slot: isSlot(element),
    });
  });
  return { crumbs, elements };
}
