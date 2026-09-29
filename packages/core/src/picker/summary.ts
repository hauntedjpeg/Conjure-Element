export type ElementSummary = {
  /** Lower case for HTML, as written for SVG and MathML. */
  tag: string;
  id: string | null;
  classes: string[];
  /** Border-box size in CSS pixels. */
  width: number;
  height: number;
};

const LABEL_CLASS_LIMIT = 3;

export function summarize(el: Element): ElementSummary {
  const rect = el.getBoundingClientRect();
  return {
    tag: el.localName,
    id: el.id || null,
    classes: Array.from(el.classList),
    width: rect.width,
    height: rect.height,
  };
}

/** `button#save.btn.primary`, the way DevTools writes it. */
export function selectorLabel(
  summary: Pick<ElementSummary, "tag" | "id" | "classes">,
  classLimit = LABEL_CLASS_LIMIT,
): string {
  const id = summary.id ? `#${summary.id}` : "";
  const shown = summary.classes.slice(0, classLimit).map((name) => `.${name}`);
  const hidden = summary.classes.length - shown.length;
  return `${summary.tag}${id}${shown.join("")}${hidden > 0 ? ` +${hidden}` : ""}`;
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function sizeLabel(summary: Pick<ElementSummary, "width" | "height">): string {
  return `${trim(summary.width)} × ${trim(summary.height)}`;
}
