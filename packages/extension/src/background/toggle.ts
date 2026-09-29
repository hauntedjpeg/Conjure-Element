import { browser } from "wxt/browser";
import { sendToAllFrames, sendToFrame } from "../messaging/bus";
import type { FrameId, Message } from "../messaging/protocol";

const INSPECTOR_FILE = "/inspector.js";
const TOP_FRAME = 0;

/**
 * Inject the inspector. It guards itself, so repeat injection is harmless.
 *
 * Without `injectImmediately` the call waits for every frame to finish
 * loading, and one slow frame would hold up the toolbar button.
 */
async function inject(tabId: number, frameIds?: number[]): Promise<void> {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true as const };
  try {
    await browser.scripting.executeScript({
      target,
      files: [INSPECTOR_FILE],
      injectImmediately: true,
    });
  } catch {
    // Not every browser knows the option.
    await browser.scripting.executeScript({ target, files: [INSPECTOR_FILE] });
  }
}

export async function toggleTab(tabId: number): Promise<boolean> {
  await inject(tabId);
  const state = await sendToFrame(tabId, TOP_FRAME, { t: "toggle" });
  await sendToAllFrames(tabId, { t: "set-active", ...state });
  return state.active;
}

export async function broadcastInactive(tabId: number): Promise<void> {
  await sendToAllFrames(tabId, {
    t: "set-active",
    active: false,
    picking: false,
    selection: null,
  });
}

/** A frame that loaded after activation joins the session already running. */
export async function adoptLateFrame(tabId: number, frameId: number): Promise<void> {
  if (frameId === TOP_FRAME) return;
  let state: Awaited<ReturnType<typeof queryActive>>;
  try {
    state = await queryActive(tabId);
  } catch {
    // No inspector in the top frame: the tab was never activated.
    return;
  }
  if (!state.active) return;
  await inject(tabId, [frameId]);
  await sendToFrame(tabId, frameId, { t: "set-active", ...state });
}

function queryActive(tabId: number) {
  return sendToFrame(tabId, TOP_FRAME, { t: "query-active" });
}

/** Pass a frame's message on, stamped with where it came from. */
export async function relay(
  tabId: number,
  from: FrameId,
  message: Extract<Message, { t: "relay" }>,
): Promise<void> {
  const out: Message = { t: "picker", from, instance: message.instance, body: message.body };
  try {
    if (message.to === "all") await sendToAllFrames(tabId, out);
    else await sendToFrame(tabId, message.to, out);
  } catch {
    // The receiving frame has gone away; there is nobody left to tell.
  }
}
