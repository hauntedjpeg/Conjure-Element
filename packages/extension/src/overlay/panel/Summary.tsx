import { selectorLabel, sizeLabel } from "@conjure/core";
import type { SelectionDTO } from "../../messaging/protocol";

function notices(selection: SelectionDTO): { key: string; text: string }[] {
  const found: { key: string; text: string }[] = [];
  if (selection.closedRoot === "closed") {
    found.push({
      key: "closed-root",
      text: "Closed shadow root. Its content cannot be inspected.",
    });
  }
  if (selection.closedRoot === "suspected") {
    found.push({
      key: "suspected-root",
      text: "May have a closed shadow root. Its content cannot be inspected.",
    });
  }
  if (selection.frame === "refused") {
    found.push({ key: "frame-refused", text: "This frame cannot be inspected." });
  }
  if (selection.frame === "inspectable") {
    found.push({ key: "frame", text: "Frame. Pick inside it to inspect its content." });
  }
  if (!selection.baseline) {
    found.push({
      key: "no-baseline",
      text: "This page blocks the UA baseline, so every computed value is listed.",
    });
  }
  return found;
}

export function Summary({ selection }: { selection: SelectionDTO }) {
  const { summary } = selection;
  return (
    <section class="summary" aria-label="Selected element">
      <div class="selector">
        <span class="tag">{summary.tag}</span>
        {summary.id ? <span class="id">#{summary.id}</span> : null}
        <span class="classes">
          {selectorLabel({ tag: "", id: null, classes: summary.classes }, summary.classes.length)}
        </span>
      </div>
      <div class="size">{sizeLabel(summary)}</div>
      {notices(selection).map((notice) => (
        <p class="notice" data-notice={notice.key} key={notice.key}>
          {notice.text}
        </p>
      ))}
    </section>
  );
}
