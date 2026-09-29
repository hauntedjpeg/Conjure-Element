export { base64ToBytes, base64ToUtf8, bytesToBase64, utf8ToBase64 } from "./base64";
export {
  buildClipboardItem,
  type WritePath,
  writeViaAsyncApi,
  writeViaCopyEvent,
} from "./clipboard-write";
export { decodeClipboardHtml, decodeFigBytes, jsonReplacer } from "./codec/decode";
export {
  BUNDLED_SCHEMA,
  type EncodedPayload,
  type EncodeOptions,
  encodeMessageBundled,
  encodeWithSchema,
} from "./codec/encode";
export { type ValidationIssue, validateMessage } from "./codec/validate";
export {
  type ComposeOptions,
  composeEnvelope,
  DEFAULT_META,
  type EnvelopeVariant,
} from "./envelope/compose";
export { hasFigmaMarkers, type ParsedEnvelope, parseEnvelope } from "./envelope/parse";
export {
  buildSceneMessage,
  CANVAS_GUID,
  contentNodes,
  createGuidAllocator,
  DOCUMENT_GUID,
  IDENTITY,
  isScaffoldNode,
  positionAt,
  type ScaffoldOptions,
  translate,
} from "./message/scaffold";
export {
  buildRectangle,
  dropShadow,
  type RectangleSpec,
  type ShadowEffect,
  type SolidPaint,
  solidPaint,
} from "./node/build";
export {
  type BuildProbeOptions,
  type BuiltProbe,
  buildProbe,
  PROBES,
  type ProbeDefinition,
  type ProbeId,
  type ProbeSource,
  syntheticSource,
} from "./probes";
export { formatSummary, type PayloadSummary, summarize } from "./summary";
export { loadTemplate, type Template } from "./template/load";
export { cloneMessage, mutateContent } from "./template/mutate";
export {
  GEOMETRY_FIELDS,
  IDENTITY_FIELDS,
  type SparsifyOptions,
  sparsify,
  VISUAL_FIELDS,
} from "./template/sparsify";
export type {
  ClipboardMeta,
  Color,
  Compression,
  DecodedPayload,
  FigMessage,
  Guid,
  Matrix,
  NodeChange,
  ParentIndex,
  Schema,
} from "./types";
