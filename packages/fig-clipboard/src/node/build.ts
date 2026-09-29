import { CANVAS_GUID, positionAt, translate } from "../message/scaffold";
import type { Color, Guid, NodeChange } from "../types";

export type SolidPaint = {
  type: "SOLID";
  color: Color;
  opacity: number;
  visible: boolean;
  blendMode: string;
};

export type ShadowEffect = {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: Color;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
  visible: boolean;
  blendMode: string;
  showShadowBehindNode?: boolean;
};

export function solidPaint(color: Color, opacity = 1): SolidPaint {
  return { type: "SOLID", color, opacity, visible: true, blendMode: "NORMAL" };
}

export function dropShadow(
  color: Color,
  x: number,
  y: number,
  radius: number,
  spread = 0,
): ShadowEffect {
  return {
    type: "DROP_SHADOW",
    color,
    offset: { x, y },
    radius,
    spread,
    visible: true,
    blendMode: "NORMAL",
    showShadowBehindNode: false,
  };
}

export type RectangleSpec = {
  guid: Guid;
  name: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  fills?: SolidPaint[];
  strokes?: SolidPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  opacity?: number;
  effects?: ShadowEffect[];
  parent?: Guid;
  position?: string;
};

/** A complete, self-sufficient rectangle for the `Cmd+V` node-paste path. */
export function buildRectangle(spec: RectangleSpec): NodeChange {
  const node: NodeChange = {
    guid: spec.guid,
    phase: "CREATED",
    parentIndex: { guid: spec.parent ?? CANVAS_GUID, position: spec.position ?? positionAt(0) },
    type: "ROUNDED_RECTANGLE",
    name: spec.name,
    visible: true,
    opacity: spec.opacity ?? 1,
    size: { x: spec.width, y: spec.height },
    transform: translate(spec.x ?? 0, spec.y ?? 0),
    strokeWeight: spec.strokeWeight ?? 1,
    strokeAlign: "INSIDE",
    strokeJoin: "MITER",
    fillPaints: spec.fills ?? [],
  };
  if (spec.strokes) node.strokePaints = spec.strokes;
  if (spec.cornerRadius !== undefined) node.cornerRadius = spec.cornerRadius;
  if (spec.effects) node.effects = spec.effects;
  return node;
}
