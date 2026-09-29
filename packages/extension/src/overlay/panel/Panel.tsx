import { useState } from "preact/hooks";
import type { SelectionDTO } from "../../messaging/protocol";
import { Breadcrumb } from "./Breadcrumb";
import { StyleList } from "./StyleList";
import { Summary } from "./Summary";

export type PanelProps = {
  picking: boolean;
  selection: SelectionDTO | null;
  onClose(): void;
  onPick(picking: boolean): void;
  /** `index` is a position in the owner's element chain. */
  onCrumb(index: number): void;
  onLeaveFrame(): void;
};

export function Panel(props: PanelProps) {
  const { picking, selection } = props;
  // Kept across selections: the same search is usually wanted on the next element.
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  return (
    <aside class="panel" aria-label="Conjure Element inspector">
      <header class="panel-header">
        <span class="title">Conjure Element</span>
        <button
          type="button"
          class="icon-button pick"
          aria-pressed={picking}
          aria-label="Pick an element"
          title="Pick an element"
          onClick={() => props.onPick(!picking)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M2 2l4.6 11 1.5-4.5L12.6 7 2 2z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="icon-button"
          onClick={props.onClose}
          aria-label="Close inspector"
        >
          ×
        </button>
      </header>
      {selection ? (
        <>
          <Breadcrumb
            crumbs={selection.crumbs}
            onCrumb={props.onCrumb}
            onLeaveFrame={props.onLeaveFrame}
          />
          <Summary selection={selection} />
          <StyleList
            entries={selection.entries}
            baseline={selection.baseline}
            query={query}
            showAll={showAll}
            onQuery={setQuery}
            onShowAll={setShowAll}
          />
        </>
      ) : (
        <div class="panel-body empty">
          <p class="status">{picking ? "Click an element to inspect it." : "Nothing selected."}</p>
          <p class="hint">
            Press <kbd>Esc</kbd> to exit.
          </p>
        </div>
      )}
    </aside>
  );
}
