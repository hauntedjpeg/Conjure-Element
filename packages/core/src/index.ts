export { type Baseline, createBaseline } from "./baseline/baseline";
export { CATEGORIES, type Category, categoryOf } from "./computed/categories";
export { type ComputedEntry, diffFromBaseline, type StyleRecord } from "./computed/diff";
export {
  type EntryFilter,
  type EntryGroup,
  filterEntries,
  groupByCategory,
  matchesQuery,
} from "./computed/search";
export { snapshotElement, snapshotStyle } from "./computed/snapshot";
export { browserHost, type CascadeHost, windowOf } from "./host";
export {
  type BoxEdges,
  type BoxModel,
  boxModel,
  type Edges,
  type Rect,
  readBoxEdges,
} from "./picker/box-model";
export { suspectClosedRoot } from "./picker/closed-root";
export {
  ancestorChain,
  type Breadcrumb,
  breadcrumb,
  type Crumb,
  defaultPickerEnv,
  flatChildren,
  flatParent,
  type NavDirection,
  navigate,
} from "./picker/composed-tree";
export type { ClosedRootState, PickerEnv } from "./picker/env";
export { deepElementFromPoint } from "./picker/hit-test";
export { type ElementSummary, selectorLabel, sizeLabel, summarize } from "./picker/summary";
export { type PseudoElementSplit, splitPseudoElement } from "./selector/pseudo-element";
export { compareSpecificity, specificity } from "./selector/specificity";
export { splitSelectorList } from "./selector/split";
export type {
  PropertyOrigin,
  ResolvedProperty,
  ResolvedStyle,
  ResolvedVariable,
  Specificity,
  Winner,
} from "./types";
