import type { CascadeHost } from "../host";
import type { StyleRecord } from "./diff";

/** Copy a live computed style into plain data. */
export function snapshotStyle(style: CSSStyleDeclaration): StyleRecord {
  const record: StyleRecord = {};
  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);
    if (property) record[property] = style.getPropertyValue(property);
  }
  return record;
}

export function snapshotElement(el: Element, host: CascadeHost): StyleRecord {
  return snapshotStyle(host.computedStyle(el));
}
