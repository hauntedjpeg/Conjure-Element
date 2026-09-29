import { isScaffoldNode } from "../message/scaffold";
import type { FigMessage, NodeChange } from "../types";

/** Deep clone that preserves `Uint8Array` fields (blobs, hashes). */
export function cloneMessage<T>(value: T): T {
  return structuredClone(value);
}

/** Return a copy of `message` with `patch` applied to each content node. */
export function mutateContent(
  message: FigMessage,
  patch: (node: NodeChange, index: number) => NodeChange,
): FigMessage {
  const copy = cloneMessage(message);
  let index = 0;
  copy.nodeChanges = (copy.nodeChanges ?? []).map((node) => {
    if (isScaffoldNode(node)) return node;
    const patched = patch(node, index);
    index += 1;
    return patched;
  });
  return copy;
}
