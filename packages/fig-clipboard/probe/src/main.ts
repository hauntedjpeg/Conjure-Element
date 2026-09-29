import {
  type BuiltProbe,
  buildProbe,
  decodeClipboardHtml,
  type EnvelopeVariant,
  formatSummary,
  hasFigmaMarkers,
  jsonReplacer,
  loadTemplate,
  PROBES,
  type ProbeId,
  summarize,
  type Template,
  type WritePath,
  writeViaAsyncApi,
  writeViaCopyEvent,
} from "../../src/index";

type Built = { probe: BuiltProbe; plain: string } | { error: string };

const state: {
  variant: EnvelopeVariant;
  source: "synthetic" | "template";
  stripGeometry: boolean;
  template: Template | null;
  built: Map<ProbeId, Built>;
} = {
  variant: "figma-exact",
  source: "synthetic",
  stripGeometry: false,
  template: null,
  built: new Map(),
};

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function log(message: string, tone: "ok" | "bad" | "" = ""): void {
  const time = new Date().toLocaleTimeString();
  $("log").prepend(el("li", { className: tone, textContent: `${time}  ${message}` }));
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  el("a", { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- authoring

/**
 * Payloads are built when an option changes, never inside a click handler.
 * This mirrors the extension's constraint: Safari only allows clipboard
 * writes synchronously inside the gesture.
 */
function rebuild(): void {
  state.built.clear();
  for (const definition of PROBES) {
    const useTemplate =
      state.template !== null && (state.source === "template" || definition.needsTemplate);
    try {
      const probe = buildProbe(definition.id, {
        variant: state.variant,
        stripGeometry: state.stripGeometry,
        ...(useTemplate && state.template ? { template: state.template } : {}),
      });
      const plain = `Conjure probe ${definition.id}: ${definition.title}`;
      state.built.set(definition.id, { probe, plain });
    } catch (error) {
      state.built.set(definition.id, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  renderProbes();
}

function describe(built: Built): { text: string; title: string } {
  if ("error" in built) return { text: built.error, title: "" };
  const { probe } = built;
  const fields = probe.message
    ? Object.keys(
        probe.message.nodeChanges?.find((n) => n.type !== "DOCUMENT" && n.type !== "CANVAS") ?? {},
      )
    : [];
  const dropped = probe.dropped.length ? `, ${probe.dropped.length} dropped` : "";
  return {
    text: `${probe.source}, ${probe.bytes} B${dropped}`,
    title: fields.length ? `First content node: ${fields.join(", ")}` : "Replayed verbatim",
  };
}

async function write(id: ProbeId, path: WritePath): Promise<void> {
  const built = state.built.get(id);
  if (!built || "error" in built) return;
  const { probe, plain } = built;
  const label = `${id} via ${path} (${state.variant}, ${probe.source})`;
  try {
    if (path === "async-api") {
      await writeViaAsyncApi(probe.html, plain);
    } else if (!writeViaCopyEvent(document, probe.html, plain)) {
      throw new Error("execCommand('copy') was refused");
    }
    const definition = PROBES.find((p) => p.id === id);
    log(`Wrote ${label}. In Figma, select the target and press ${definition?.paste}.`, "ok");
  } catch (error) {
    log(`Failed ${label}: ${error instanceof Error ? error.message : String(error)}`, "bad");
  }
}

function renderProbes(): void {
  const body = $("probes");
  body.replaceChildren();
  for (const definition of PROBES) {
    const built = state.built.get(definition.id);
    const ready = built !== undefined && !("error" in built);
    const info = built ? describe(built) : { text: "", title: "" };
    const button = (path: WritePath, text: string) => {
      const b = el("button", { type: "button", textContent: text, disabled: !ready });
      b.dataset.probe = definition.id;
      b.dataset.path = path;
      return b;
    };
    body.append(
      el("tr", {}, [
        el("td", {}, [
          el("span", { className: "id", textContent: definition.id }),
          ` ${definition.title}`,
        ]),
        el("td", { textContent: definition.paste }),
        el("td", { textContent: definition.expect }),
        el("td", { textContent: definition.watchFor }),
        el("td", { className: ready ? "muted" : "bad", textContent: info.text, title: info.title }),
        el("td", { className: "actions" }, [
          button("async-api", "clipboard.write"),
          button("copy-event", "copy event"),
        ]),
      ]),
    );
  }
}

// ------------------------------------------------------------------ capture

type Representation = { type: string; size: number; text: string | null };

function useTemplate(html: string, origin: string): void {
  state.template = loadTemplate(html);
  const option = $<HTMLSelectElement>("source").querySelector<HTMLOptionElement>(
    'option[value="template"]',
  );
  if (option) option.disabled = false;
  const summary = summarize(state.template);
  $("template-status").textContent =
    `Template: ${origin}, ${summary.content.length} content node(s), schema ${summary.schemaTypes} types, dataType ${summary.dataType}.`;
  log(`Loaded template from ${origin}`, "ok");
  rebuild();
}

function renderCapture(origin: string, representations: Representation[]): void {
  const out = $("capture-out");
  out.hidden = false;
  out.replaceChildren();

  const types = el("dl", { className: "types" });
  for (const rep of representations) {
    types.append(
      el("dt", { textContent: rep.type }),
      el("dd", { textContent: `${rep.size} bytes` }),
    );
  }
  out.append(
    el("p", { textContent: `${origin}: ${representations.length} representation(s)` }),
    types,
  );

  const html = representations.find((rep) => rep.text !== null && hasFigmaMarkers(rep.text))?.text;
  if (!html) {
    out.append(
      el("p", { className: "bad", textContent: "No Figma payload markers in any representation." }),
    );
    const first = representations.find((rep) => rep.text);
    if (first?.text) out.append(el("pre", { textContent: first.text.slice(0, 4000) }));
    log(`${origin}: no Figma payload`, "bad");
    return;
  }

  try {
    const decoded = decodeClipboardHtml(html);
    const json = JSON.stringify(decoded.message, jsonReplacer, 2);
    const escaped = html.includes("&lt;!--(figma)");
    out.append(
      el("p", {
        className: "ok",
        textContent: `Figma payload decoded${escaped ? " (markers arrived entity-escaped)" : ""}.`,
      }),
      el("pre", { textContent: formatSummary(summarize(decoded)) }),
      el("div", { className: "row" }, [
        el("button", {
          type: "button",
          className: "primary",
          textContent: "Use as template",
          onclick: () => useTemplate(html, origin),
        }),
        el("button", {
          type: "button",
          textContent: "Download public.html",
          onclick: () => download("public.html", html, "text/html"),
        }),
        el("button", {
          type: "button",
          textContent: "Download decoded.json",
          onclick: () => download("decoded.json", json, "application/json"),
        }),
      ]),
      el("details", {}, [
        el("summary", { textContent: "Decoded message" }),
        el("pre", { textContent: json }),
      ]),
      el("details", {}, [
        el("summary", { textContent: "Raw HTML" }),
        el("pre", { textContent: html.length > 6000 ? `${html.slice(0, 6000)}…` : html }),
      ]),
    );
    log(`${origin}: decoded ${decoded.byteLength} B payload`, "ok");
  } catch (error) {
    out.append(
      el("p", {
        className: "bad",
        textContent: `Markers found but decode failed: ${String(error)}`,
      }),
    );
    log(`${origin}: decode failed`, "bad");
  }
}

async function readClipboard(): Promise<void> {
  try {
    let items: ClipboardItems;
    let mode = "unsanitized";
    try {
      // Chromium only; other engines reject the option.
      items = await (
        navigator.clipboard.read as (options?: { unsanitized: string[] }) => Promise<ClipboardItems>
      ).call(navigator.clipboard, { unsanitized: ["text/html"] });
    } catch {
      mode = "sanitized";
      items = await navigator.clipboard.read();
    }
    const representations: Representation[] = [];
    for (const item of items) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        const text = type.startsWith("text/") ? await blob.text() : null;
        representations.push({ type, size: blob.size, text });
      }
    }
    renderCapture(`clipboard.read (${mode})`, representations);
  } catch (error) {
    log(`clipboard.read failed: ${error instanceof Error ? error.message : String(error)}`, "bad");
  }
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault();
  const data = event.clipboardData;
  if (!data) return;
  const representations = Array.from(data.types, (type) => {
    const text = data.getData(type);
    return { type, size: new Blob([text]).size, text };
  });
  renderCapture("paste event", representations);
}

// --------------------------------------------------------------------- init

function init(): void {
  $("env").textContent = `${navigator.userAgent} · secure context: ${window.isSecureContext}`;

  $("read").addEventListener("click", () => void readClipboard());
  document.addEventListener("paste", onPaste);
  $<HTMLInputElement>("file").addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      useTemplate(await file.text(), file.name);
    } catch (error) {
      log(
        `Could not load ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        "bad",
      );
    }
  });

  $<HTMLSelectElement>("variant").addEventListener("change", (event) => {
    state.variant = (event.target as HTMLSelectElement).value as EnvelopeVariant;
    rebuild();
  });
  $<HTMLSelectElement>("source").addEventListener("change", (event) => {
    state.source = (event.target as HTMLSelectElement).value as "synthetic" | "template";
    rebuild();
  });
  $<HTMLInputElement>("strip").addEventListener("change", (event) => {
    state.stripGeometry = (event.target as HTMLInputElement).checked;
    rebuild();
  });

  $("probes").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    const id = button?.dataset.probe as ProbeId | undefined;
    const path = button?.dataset.path as WritePath | undefined;
    if (id && path) void write(id, path);
  });

  rebuild();
  log("Ready. Payloads are pre-built; buttons only write.");
}

init();
