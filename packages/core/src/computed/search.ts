import { CATEGORIES, type Category } from "./categories";
import type { ComputedEntry } from "./diff";

export type EntryFilter = {
  /** Space-separated terms; every one must occur in the name or the value. */
  query: string;
  /** Include entries that match the UA baseline. */
  showAll: boolean;
};

export type EntryGroup = { category: Category; entries: ComputedEntry[] };

export function matchesQuery(entry: ComputedEntry, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${entry.property}: ${entry.value}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function filterEntries(entries: ComputedEntry[], filter: EntryFilter): ComputedEntry[] {
  return entries.filter(
    (entry) => (filter.showAll || !entry.isDefault) && matchesQuery(entry, filter.query),
  );
}

/** Groups in display order; empty ones are left out. */
export function groupByCategory(entries: ComputedEntry[]): EntryGroup[] {
  return CATEGORIES.map((category) => ({
    category,
    entries: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0);
}
