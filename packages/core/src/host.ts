/**
 * Everything the engines need from their environment that is not reachable
 * from a DOM node. Core never touches globals or extension APIs directly;
 * the extension supplies a host whose `fetchStylesheetText` goes through the
 * background worker, and tests supply whatever they need to control.
 */
export interface CascadeHost {
  matches(el: Element, selector: string): boolean;
  matchMedia(win: Window, query: string): boolean;
  supports(win: Window, condition: string): boolean;
  computedStyle(el: Element, pseudo?: string): CSSStyleDeclaration;
  /** Resolve null when the sheet cannot be fetched; callers degrade gracefully. */
  fetchStylesheetText(href: string): Promise<{ text: string; etag: string | null } | null>;
}

/** The window that owns `el`; differs from the caller's inside iframes. */
export function windowOf(el: Element): Window {
  const win = el.ownerDocument.defaultView;
  if (!win) throw new Error("Element is not attached to a window");
  return win;
}

type SupportsWindow = Window & { CSS: { supports(condition: string): boolean } };

export function browserHost(overrides: Partial<CascadeHost> = {}): CascadeHost {
  return {
    matches(el, selector) {
      try {
        return el.matches(selector);
      } catch {
        // Selectors this engine cannot parse match nothing.
        return false;
      }
    },
    matchMedia: (win, query) => win.matchMedia(query).matches,
    supports: (win, condition) => (win as SupportsWindow).CSS.supports(condition),
    computedStyle: (el, pseudo) => windowOf(el).getComputedStyle(el, pseudo),
    fetchStylesheetText: async () => null,
    ...overrides,
  };
}
