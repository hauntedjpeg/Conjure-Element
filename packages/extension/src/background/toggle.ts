import { browser } from "wxt/browser";
import { sendToAllFrames, sendToFrame } from "../messaging/bus";

const INSPECTOR_FILE = "/inspector.js";
const TOP_FRAME = 0;

/** Inject the inspector. It guards itself, so repeat injection is harmless. */
async function inject(tabId: number, frameIds?: number[]): Promise<void> {
  await browser.scripting.executeScript({
    target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true },
    files: [INSPECTOR_FILE],
  });
}

export async function toggleTab(tabId: number): Promise<boolean> {
  await inject(tabId);
  const { active } = await sendToFrame(tabId, TOP_FRAME, { t: "toggle" });
  await sendToAllFrames(tabId, { t: "set-active", active });
  return active;
}

export async function broadcastInactive(tabId: number): Promise<void> {
  await sendToAllFrames(tabId, { t: "set-active", active: false });
}

/** A frame that loaded after activation joins the session already running. */
export async function adoptLateFrame(tabId: number, frameId: number): Promise<void> {
  if (frameId === TOP_FRAME) return;
  let active = false;
  try {
    ({ active } = await sendToFrame(tabId, TOP_FRAME, { t: "query-active" }));
  } catch {
    // No inspector in the top frame: the tab was never activated.
    return;
  }
  if (!active) return;
  await inject(tabId, [frameId]);
  await sendToFrame(tabId, frameId, { t: "set-active", active: true });
}
