import type { FigMessage, NodeChange } from "../types";
import { mutateContent } from "./mutate";

/** Fields a node needs to exist in the tree at all. */
export const IDENTITY_FIELDS = ["guid", "phase", "parentIndex", "type", "name"] as const;

/** Fields that place and size a node; needed for it to be visible on `Cmd+V`. */
export const GEOMETRY_FIELDS = ["size", "transform", "visible"] as const;

/** Every NodeChange field a visual-property copy may carry. */
export const VISUAL_FIELDS = [
  "opacity",
  "blendMode",
  "fillPaints",
  "strokePaints",
  "strokeWeight",
  "strokeAlign",
  "strokeJoin",
  "strokeCap",
  "borderStrokeWeightsIndependent",
  "borderTopWeight",
  "borderRightWeight",
  "borderBottomWeight",
  "borderLeftWeight",
  "cornerRadius",
  "cornerSmoothing",
  "rectangleTopLeftCornerRadius",
  "rectangleTopRightCornerRadius",
  "rectangleBottomLeftCornerRadius",
  "rectangleBottomRightCornerRadius",
  "rectangleCornerRadiiIndependent",
  "effects",
] as const;

export type SparsifyOptions = {
  /** Property fields to keep on each content node. */
  keep: readonly string[];
  /** Keep size/transform/visible as well. Default true. */
  keepGeometry?: boolean;
};

/**
 * Strip every content node down to identity fields plus `keep`. Kiwi message
 * fields are optional on the wire, so what is left is a payload that says
 * nothing about the removed properties.
 */
export function sparsify(message: FigMessage, options: SparsifyOptions): FigMessage {
  const allowed = new Set<string>([
    ...IDENTITY_FIELDS,
    ...(options.keepGeometry === false ? [] : GEOMETRY_FIELDS),
    ...options.keep,
  ]);
  return mutateContent(message, (node) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (allowed.has(key)) out[key] = value;
    }
    return out as NodeChange;
  });
}
