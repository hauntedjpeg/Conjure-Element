import { BUNDLED_SCHEMA, encodeMessageBundled, encodeWithSchema } from "./codec/encode";
import { validateMessage } from "./codec/validate";
import { composeEnvelope, DEFAULT_META, type EnvelopeVariant } from "./envelope/compose";
import { buildSceneMessage, createGuidAllocator } from "./message/scaffold";
import { buildRectangle, dropShadow, solidPaint } from "./node/build";
import type { Template } from "./template/load";
import { cloneMessage } from "./template/mutate";
import { sparsify, VISUAL_FIELDS } from "./template/sparsify";
import type { ClipboardMeta, FigMessage, Schema } from "./types";

/**
 * The M0.5 probe matrix (PRD §9.3). Each probe is a payload whose effect on
 * a Figma layer with known properties tells us how Paste Properties treats
 * absent fields.
 */
export type ProbeId = "N1" | "R1" | "R2" | "P1" | "P2" | "P3" | "P4" | "P5";

export type ProbeSource = "synthetic" | "template";

export type ProbeDefinition = {
  id: ProbeId;
  title: string;
  paste: "⌘V" | "⌘⌥V";
  expect: string;
  watchFor: string;
  /** Visual fields kept on the content node; `null` means not a sparse probe. */
  keep: readonly string[] | null;
  needsTemplate: boolean;
};

export const PROBES: readonly ProbeDefinition[] = [
  {
    id: "N1",
    title: "Node payload: one rectangle",
    paste: "⌘V",
    expect: "A 120×80 purple rounded rectangle named “Conjure N1” appears",
    watchFor: "Nothing pastes, or Figma shows an error toast",
    keep: null,
    needsTemplate: false,
  },
  {
    id: "R1",
    title: "Replay: captured payload, byte for byte",
    paste: "⌘⌥V",
    expect: "Same result as pasting straight from Figma",
    watchFor: "Nothing applies: the browser write path is mangling the payload",
    keep: null,
    needsTemplate: true,
  },
  {
    id: "R2",
    title: "Re-encode: captured payload through our encoder",
    paste: "⌘⌥V",
    expect: "Same result as R1",
    watchFor: "R1 works but R2 does not: encoder or schema mismatch",
    keep: null,
    needsTemplate: true,
  },
  {
    id: "P1",
    title: "Sparse: effects only",
    paste: "⌘⌥V",
    expect: "Shadow applied, fill untouched",
    watchFor: "Fill reset to default",
    keep: ["effects"],
    needsTemplate: false,
  },
  {
    id: "P2",
    title: "Sparse: fillPaints only",
    paste: "⌘⌥V",
    expect: "Fill applied, radius untouched",
    watchFor: "Radius zeroed",
    keep: ["fillPaints"],
    needsTemplate: false,
  },
  {
    id: "P3",
    title: "Sparse: cornerRadius only",
    paste: "⌘⌥V",
    expect: "Radius applied",
    watchFor: "Stroke removed",
    keep: ["cornerRadius"],
    needsTemplate: false,
  },
  {
    id: "P4",
    title: "Sparse: no properties",
    paste: "⌘⌥V",
    expect: "No-op",
    watchFor: "Layer wiped",
    keep: [],
    needsTemplate: false,
  },
  {
    id: "P5",
    title: "Dense: all visual properties",
    paste: "⌘⌥V",
    expect: "Target takes on every visual property of the source",
    watchFor: "Size or position changes",
    keep: VISUAL_FIELDS,
    needsTemplate: false,
  },
];

const PURPLE = { r: 0.486, g: 0.227, b: 0.929, a: 1 };
const ORANGE = { r: 0.976, g: 0.451, b: 0.086, a: 1 };
const SHADOW = { r: 0, g: 0, b: 0, a: 0.35 };

/** A rectangle with distinctive values for every probed property. */
export function syntheticSource(name: string): FigMessage {
  const guid = createGuidAllocator();
  return buildSceneMessage([
    buildRectangle({
      guid: guid(),
      name,
      width: 120,
      height: 80,
      fills: [solidPaint(PURPLE)],
      strokes: [solidPaint(ORANGE)],
      strokeWeight: 3,
      cornerRadius: 24,
      opacity: 0.9,
      effects: [dropShadow(SHADOW, 0, 8, 16)],
    }),
  ]);
}

export type BuiltProbe = {
  id: ProbeId;
  source: ProbeSource;
  html: string;
  message: FigMessage | null;
  bytes: number;
  /** Fields the encoder's schema does not know and therefore dropped. */
  dropped: string[];
};

export type BuildProbeOptions = {
  variant?: EnvelopeVariant;
  /** Captured payload to derive from. Required for R1/R2, optional for P*. */
  template?: Template;
  /** For sparse probes: also strip size/transform. */
  stripGeometry?: boolean;
};

function encode(
  message: FigMessage,
  schema: Schema,
  meta: ClipboardMeta,
  variant: EnvelopeVariant | undefined,
  version?: number,
): { html: string; bytes: number; dropped: string[] } {
  const dropped = validateMessage(message, schema)
    .filter((issue) => issue.kind === "unknown-field")
    .map((issue) => issue.path);
  const encoded =
    schema === BUNDLED_SCHEMA
      ? encodeMessageBundled(message)
      : encodeWithSchema(message, schema, version === undefined ? {} : { version });
  return {
    html: composeEnvelope(encoded.base64, { meta, variant: variant ?? "figma-exact" }),
    bytes: encoded.size,
    dropped,
  };
}

export function buildProbe(id: ProbeId, options: BuildProbeOptions = {}): BuiltProbe {
  const definition = PROBES.find((probe) => probe.id === id);
  if (!definition) throw new Error(`Unknown probe ${id}`);
  const { variant } = options;
  // N1 validates the node-paste path and is always the synthetic rectangle.
  const template = id === "N1" ? undefined : options.template;

  if (id === "R1") {
    if (!template) throw new Error("R1 replays a captured payload; load a capture first");
    return {
      id,
      source: "template",
      html: template.sourceHtml,
      message: null,
      bytes: template.byteLength,
      dropped: [],
    };
  }

  if (template) {
    const meta = template.meta ?? DEFAULT_META;
    const message =
      definition.keep === null
        ? cloneMessage(template.message)
        : sparsify(template.message, {
            keep: definition.keep,
            keepGeometry: !options.stripGeometry,
          });
    return {
      id,
      source: "template",
      message,
      ...encode(message, template.schema, meta, variant, template.version),
    };
  }

  if (definition.needsTemplate) {
    throw new Error(`${id} needs a captured payload; load a capture first`);
  }

  const source = syntheticSource(`Conjure ${id}`);
  const message =
    definition.keep === null
      ? source
      : sparsify(source, { keep: definition.keep, keepGeometry: !options.stripGeometry });
  return {
    id,
    source: "synthetic",
    message,
    ...encode(message, BUNDLED_SCHEMA, DEFAULT_META, variant),
  };
}
