/** Viewport coordinates, as `getBoundingClientRect` reports them. */
export type Rect = { x: number; y: number; width: number; height: number };

export type Edges = { top: number; right: number; bottom: number; left: number };

export type BoxEdges = { margin: Edges; border: Edges; padding: Edges };

/** The four nested boxes of the CSS box model, outermost first. */
export type BoxModel = { margin: Rect; border: Rect; padding: Rect; content: Rect };

function inset(rect: Rect, edges: Edges): Rect {
  const width = Math.max(0, rect.width - edges.left - edges.right);
  const height = Math.max(0, rect.height - edges.top - edges.bottom);
  return { x: rect.x + edges.left, y: rect.y + edges.top, width, height };
}

function outset(rect: Rect, edges: Edges): Rect {
  return {
    x: rect.x - edges.left,
    y: rect.y - edges.top,
    width: rect.width + edges.left + edges.right,
    height: rect.height + edges.top + edges.bottom,
  };
}

function clamp(edges: Edges): Edges {
  return {
    top: Math.max(0, edges.top),
    right: Math.max(0, edges.right),
    bottom: Math.max(0, edges.bottom),
    left: Math.max(0, edges.left),
  };
}

/**
 * Derive the box model from the border box. Axis-aligned: for a transformed
 * element the border box is already its bounding box, so the inner bands
 * are approximate.
 *
 * A negative margin pulls the element outside its margin box; there is no
 * band to draw for it, so it counts as zero.
 */
export function boxModel(borderBox: Rect, edges: BoxEdges): BoxModel {
  const padding = inset(borderBox, clamp(edges.border));
  return {
    margin: outset(borderBox, clamp(edges.margin)),
    border: { ...borderBox },
    padding,
    content: inset(padding, clamp(edges.padding)),
  };
}

type StyleReader = { getPropertyValue(property: string): string };

function px(style: StyleReader, property: string): number {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

function edges(style: StyleReader, prefix: string, suffix = ""): Edges {
  return {
    top: px(style, `${prefix}-top${suffix}`),
    right: px(style, `${prefix}-right${suffix}`),
    bottom: px(style, `${prefix}-bottom${suffix}`),
    left: px(style, `${prefix}-left${suffix}`),
  };
}

/** Read the box edges out of a computed style. */
export function readBoxEdges(style: StyleReader): BoxEdges {
  return {
    margin: edges(style, "margin"),
    border: edges(style, "border", "-width"),
    padding: edges(style, "padding"),
  };
}
