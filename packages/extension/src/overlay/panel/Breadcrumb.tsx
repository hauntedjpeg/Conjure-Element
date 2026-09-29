import type { Crumb } from "@conjure/core";
import { useLayoutEffect, useRef } from "preact/hooks";

type BreadcrumbProps = {
  crumbs: Crumb[];
  onCrumb(index: number): void;
  onLeaveFrame(): void;
};

function frameLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname;
  } catch {
    return url;
  }
}

/** Boundaries have no identity of their own, so they borrow their neighbour's. */
function keyOf(crumb: Crumb, next: Crumb | undefined): string {
  if (crumb.kind === "element") return `element-${crumb.index}`;
  const before = next?.kind === "element" ? next.index : "end";
  return `${crumb.kind}-before-${before}`;
}

export function Breadcrumb({ crumbs, onCrumb, onLeaveFrame }: BreadcrumbProps) {
  const last = crumbs.at(-1);
  const nav = useRef<HTMLElement>(null);

  // The selection is the last crumb, so a long path is shown from its end.
  useLayoutEffect(() => {
    if (nav.current) nav.current.scrollLeft = nav.current.scrollWidth;
  }, [crumbs]);

  return (
    <nav class="breadcrumb" aria-label="Ancestors" ref={nav}>
      <ol>
        {crumbs.map((crumb, position) => {
          const key = keyOf(crumb, crumbs[position + 1]);
          if (crumb.kind === "frame") {
            return (
              <li class="crumb boundary frame" key={key}>
                <button type="button" title={crumb.url} onClick={onLeaveFrame}>
                  frame {frameLabel(crumb.url)}
                </button>
              </li>
            );
          }
          if (crumb.kind === "shadow-root") {
            return (
              <li class="crumb boundary shadow" key={key}>
                <span title={`${crumb.mode} shadow root`}>#shadow-root</span>
              </li>
            );
          }
          return (
            <li class={crumb.slot ? "crumb slot" : "crumb"} key={key}>
              <button
                type="button"
                aria-current={crumb === last ? "true" : undefined}
                onClick={() => onCrumb(crumb.index)}
              >
                {crumb.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
