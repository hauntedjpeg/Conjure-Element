import { type ComputedEntry, filterEntries, groupByCategory } from "@conjure/core";

type StyleListProps = {
  entries: ComputedEntry[];
  baseline: boolean;
  query: string;
  showAll: boolean;
  onQuery(query: string): void;
  onShowAll(showAll: boolean): void;
};

const TITLES = {
  layout: "Layout",
  box: "Box",
  typography: "Typography",
  color: "Color",
  effects: "Effects",
  other: "Other",
} as const;

export function StyleList(props: StyleListProps) {
  const { entries, query, showAll } = props;
  const shown = filterEntries(entries, { query, showAll });
  const groups = groupByCategory(shown);
  const nonDefault = entries.filter((entry) => !entry.isDefault).length;

  return (
    <div class="styles">
      <div class="toolbar">
        <input
          class="search"
          type="search"
          placeholder="Filter by property or value"
          aria-label="Filter styles"
          value={query}
          // Not `onKeyDown`: keys pressed in the panel never reach its handlers.
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <label class="toggle">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => props.onShowAll(event.currentTarget.checked)}
          />
          Show all computed
        </label>
      </div>
      <p class="count" aria-live="polite">
        <span class="shown">{shown.length}</span> shown · <span>{nonDefault}</span> non-default ·{" "}
        <span>{entries.length}</span> computed
      </p>
      <div class="panel-body">
        {groups.length === 0 ? <p class="status">No matching properties.</p> : null}
        {groups.map((group) => (
          <section class="group" data-category={group.category} key={group.category}>
            <h3>
              {TITLES[group.category]} <span class="group-count">{group.entries.length}</span>
            </h3>
            <ul>
              {group.entries.map((entry) => (
                <li class={entry.isDefault ? "row default" : "row"} key={entry.property}>
                  <span class="property">{entry.property}</span>
                  <span class="value">{entry.value}</span>
                  {entry.usedValue ? (
                    <span class="used" title="Resolved by layout">
                      used
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
