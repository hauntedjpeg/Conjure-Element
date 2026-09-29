import { browser } from "wxt/browser";
import { isMessage, type Message, type Reply } from "./protocol";

export function sendToWorker<M extends Message>(message: M): Promise<Reply<M>> {
  return browser.runtime.sendMessage(message) as Promise<Reply<M>>;
}

export function sendToFrame<M extends Message>(
  tabId: number,
  frameId: number,
  message: M,
): Promise<Reply<M>> {
  return browser.tabs.sendMessage(tabId, message, { frameId }) as Promise<Reply<M>>;
}

export function sendToAllFrames(tabId: number, message: Message): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message);
}

export type Sender = { tabId: number | undefined; frameId: number | undefined };

type Handler = (message: Message, sender: Sender) => unknown;

/**
 * Register a handler. Returning `undefined` leaves the message for other
 * listeners; anything else is sent back as the reply.
 */
export function onMessage(handler: Handler): () => void {
  const listener = (
    raw: unknown,
    sender: { tab?: { id?: number }; frameId?: number },
    sendResponse: (response: unknown) => void,
  ): true | undefined => {
    if (!isMessage(raw)) return undefined;
    const result = handler(raw, { tabId: sender.tab?.id, frameId: sender.frameId });
    if (result === undefined) return undefined;
    Promise.resolve(result).then(sendResponse, () => sendResponse(undefined));
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

/** False once the extension has been reloaded or removed under this script. */
export function isContextValid(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}
