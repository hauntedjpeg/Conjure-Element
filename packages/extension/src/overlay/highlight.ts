import {
  type BoxModel,
  boxModel,
  type Rect,
  readBoxEdges,
  selectorLabel,
  sizeLabel,
  summarize,
} from "@conjure/core";

export type Highlight = {
  /** The box-model bands and label that follow the pointer. */
  setHover(el: Element | null, note?: string): void;
  /** The outline that stays on the frozen selection. */
  setSelection(el: Element | null): void;
  destroy(): void;
};

const BANDS = ["margin", "border", "padding", "content"] as const;
const LABEL_GAP = 6;
const EDGE = 4;

function div(doc: Document, className: string): HTMLDivElement {
  const el = doc.createElement("div");
  el.className = className;
  el.hidden = true;
  return el;
}

function place(el: HTMLElement, rect: Rect): void {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

/** A band is a box whose borders are as thick as the gap to the next box in. */
function ring(el: HTMLElement, outer: Rect, inner: Rect): void {
  place(el, outer);
  const top = inner.y - outer.y;
  const left = inner.x - outer.x;
  const bottom = outer.y + outer.height - (inner.y + inner.height);
  const right = outer.x + outer.width - (inner.x + inner.width);
  el.style.borderWidth = `${top}px ${right}px ${bottom}px ${left}px`;
}

function measure(el: Element): { rect: Rect; model: BoxModel } | null {
  const view = el.ownerDocument.defaultView;
  if (!el.isConnected || !view) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0 && el.getClientRects().length === 0) return null;
  const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
  return { rect, model: boxModel(rect, readBoxEdges(view.getComputedStyle(el))) };
}

/**
 * Drawn with plain DOM, not Preact: it is repositioned on every animation
 * frame while anything is highlighted, which also keeps it in step with
 * scrolling, resizing and layout changes without listening for any of them.
 */
export function createHighlight(layer: HTMLElement): Highlight {
  const doc = layer.ownerDocument;
  const view = doc.defaultView;
  const hover = div(doc, "hover");
  const bands = Object.fromEntries(
    BANDS.map((name) => [name, div(doc, `band ${name}`)] as const),
  ) as Record<(typeof BANDS)[number], HTMLDivElement>;
  for (const name of BANDS) {
    bands[name].hidden = false;
    hover.append(bands[name]);
  }
  const label = div(doc, "label");
  const selection = div(doc, "selection");
  layer.append(selection, hover, label);

  let hovered: Element | null = null;
  let selected: Element | null = null;
  let note = "";
  let labelKey = "";
  let handle = 0;

  function writeLabel(el: Element): void {
    const summary = summarize(el);
    const key = `${selectorLabel(summary)}|${sizeLabel(summary)}|${note}`;
    if (key === labelKey) return;
    labelKey = key;
    label.replaceChildren();
    const parts: [string, string][] = [
      ["tag", summary.tag],
      ["id", summary.id ? `#${summary.id}` : ""],
      ["classes", selectorLabel({ ...summary, tag: "", id: null })],
      ["size", sizeLabel(summary)],
      ["note", note],
    ];
    for (const [className, text] of parts) {
      if (!text) continue;
      const span = doc.createElement("span");
      span.className = className;
      span.textContent = text;
      label.append(span);
    }
  }

  function placeLabel(model: BoxModel): void {
    const width = doc.documentElement.clientWidth;
    const height = view?.innerHeight ?? doc.documentElement.clientHeight;
    const box = label.getBoundingClientRect();
    let top = model.margin.y - box.height - LABEL_GAP;
    if (top < EDGE) top = model.margin.y + model.margin.height + LABEL_GAP;
    if (top + box.height > height - EDGE) top = Math.max(EDGE, model.border.y + EDGE);
    const left = Math.max(EDGE, Math.min(model.margin.x, width - box.width - EDGE));
    label.style.left = `${left}px`;
    label.style.top = `${top}px`;
  }

  function drawHover(): void {
    const measured = hovered ? measure(hovered) : null;
    hover.hidden = measured === null;
    label.hidden = measured === null;
    if (!measured || !hovered) return;
    const { model } = measured;
    ring(bands.margin, model.margin, model.border);
    ring(bands.border, model.border, model.padding);
    ring(bands.padding, model.padding, model.content);
    place(bands.content, model.content);
    writeLabel(hovered);
    placeLabel(model);
  }

  function drawSelection(): void {
    const measured = selected ? measure(selected) : null;
    selection.hidden = measured === null;
    if (measured) place(selection, measured.rect);
  }

  function draw(): void {
    handle = 0;
    drawHover();
    drawSelection();
    if (hovered || selected) schedule();
  }

  function schedule(): void {
    if (handle === 0 && view) handle = view.requestAnimationFrame(draw);
  }

  return {
    setHover(el, text = "") {
      hovered = el;
      note = text;
      // Draw now as well: a test, or a user, may look before the next frame.
      drawHover();
      schedule();
    },
    setSelection(el) {
      selected = el;
      drawSelection();
      schedule();
    },
    destroy() {
      if (handle !== 0) view?.cancelAnimationFrame(handle);
      handle = 0;
      hovered = null;
      selected = null;
      selection.remove();
      hover.remove();
      label.remove();
    },
  };
}
