type PanelProps = { onClose(): void };

/** Placeholder until the picker and style list land in M1. */
export function Panel({ onClose }: PanelProps) {
  return (
    <aside class="panel" aria-label="Conjure Element inspector">
      <header class="panel-header">
        <span class="title">Conjure Element</span>
        <button type="button" class="icon-button" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>
      <div class="panel-body">
        <p class="status">Inspect mode is on.</p>
        <p class="hint">
          Press <kbd>Esc</kbd> to exit.
        </p>
      </div>
    </aside>
  );
}
