/**
 * The two ways a page can put `text/html` on the clipboard. Both must be
 * called synchronously inside a user gesture, with the HTML already built.
 */
export type WritePath = "async-api" | "copy-event";

export function buildClipboardItem(html: string, plain: string): ClipboardItem {
  return new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([plain], { type: "text/plain" }),
  });
}

export function writeViaAsyncApi(html: string, plain: string): Promise<void> {
  return navigator.clipboard.write([buildClipboardItem(html, plain)]);
}

/**
 * `setData` writes the string verbatim, with none of the sanitising or
 * attribute escaping the async API applies.
 */
export function writeViaCopyEvent(doc: Document, html: string, plain: string): boolean {
  let handled = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", plain);
    event.preventDefault();
    handled = true;
  };
  doc.addEventListener("copy", onCopy, { capture: true, once: true });
  try {
    const ok = doc.execCommand("copy");
    return ok && handled;
  } finally {
    doc.removeEventListener("copy", onCopy, { capture: true });
  }
}
