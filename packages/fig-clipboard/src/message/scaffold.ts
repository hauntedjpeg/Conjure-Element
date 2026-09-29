import type { FigMessage, Guid, Matrix, NodeChange } from "../types";

export const DOCUMENT_GUID: Guid = { sessionID: 0, localID: 0 };
export const CANVAS_GUID: Guid = { sessionID: 0, localID: 1 };

/** Session id for authored content nodes; any non-zero value works. */
const CONTENT_SESSION = 1;
const FIRST_CONTENT_ID = 2;

export const IDENTITY: Matrix = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

export function translate(x: number, y: number): Matrix {
  return { ...IDENTITY, m02: x, m12: y };
}

export function createGuidAllocator(sessionID = CONTENT_SESSION): () => Guid {
  let next = FIRST_CONTENT_ID;
  return () => {
    const guid = { sessionID, localID: next };
    next += 1;
    return guid;
  };
}

/**
 * Sibling order is the lexicographic order of `position` strings. Printable
 * ASCII from `!` upward gives 94 slots per character, which a fixed-width
 * base-94 encoding keeps sortable for any child count.
 */
export function positionAt(index: number, siblingCount = 1): string {
  const BASE = 94;
  const FIRST = 33;
  let width = 1;
  for (let capacity = BASE; capacity < siblingCount; capacity *= BASE) width += 1;
  let out = "";
  let rest = index;
  for (let i = 0; i < width; i += 1) {
    out = String.fromCharCode(FIRST + (rest % BASE)) + out;
    rest = Math.floor(rest / BASE);
  }
  return out;
}

function documentNode(): NodeChange {
  return {
    guid: DOCUMENT_GUID,
    phase: "CREATED",
    type: "DOCUMENT",
    name: "Document",
    visible: true,
    opacity: 1,
    transform: IDENTITY,
  };
}

function canvasNode(name: string): NodeChange {
  return {
    guid: CANVAS_GUID,
    phase: "CREATED",
    parentIndex: { guid: DOCUMENT_GUID, position: "!" },
    type: "CANVAS",
    name,
    visible: true,
    opacity: 1,
    transform: IDENTITY,
    backgroundOpacity: 1,
    backgroundEnabled: true,
  };
}

export type ScaffoldOptions = {
  canvasName?: string;
  pasteID?: number;
  pasteFileKey?: string;
  blobs?: { bytes: Uint8Array }[];
};

/**
 * Wrap content nodes in the DOCUMENT → CANVAS scaffold every clipboard
 * payload carries. Top-level content nodes must already point their
 * `parentIndex` at `CANVAS_GUID`.
 */
export function buildSceneMessage(
  content: NodeChange[],
  options: ScaffoldOptions = {},
): FigMessage {
  const message: FigMessage = {
    type: "NODE_CHANGES",
    sessionID: 0,
    ackID: 0,
    nodeChanges: [documentNode(), canvasNode(options.canvasName ?? "Page 1"), ...content],
    pasteID: options.pasteID ?? 1,
    pasteFileKey: options.pasteFileKey ?? "CONJURE",
    pasteIsPartiallyOutsideEnclosingFrame: false,
    isCut: false,
    pasteEditorType: "DESIGN",
    publishedAssetGuids: [],
  };
  if (options.blobs?.length) message.blobs = options.blobs;
  return message;
}

const SCAFFOLD_TYPES = new Set(["DOCUMENT", "CANVAS"]);

export function isScaffoldNode(node: NodeChange): boolean {
  return typeof node.type === "string" && SCAFFOLD_TYPES.has(node.type);
}

export function contentNodes(message: FigMessage): NodeChange[] {
  return (message.nodeChanges ?? []).filter((node) => !isScaffoldNode(node));
}
