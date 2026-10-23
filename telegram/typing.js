import { Api } from "telegram";
import { client } from "./client.js";
import { config } from "../config/env.js";

/** Fire-and-forget safe message send (never throws to caller). */
export async function safeSendText(chatId, message, options = {}) {
  try {
    return await client.sendMessage(chatId, { message, linkPreview: false, ...options });
  } catch (error) {
    console.error("safeSendText failed:", error?.message || error);
    return null;
  }
}

/**
 * Show "typing..." continuously while a slow AI task runs.
 * Telegram typing status expires after ~5s, so we refresh it every 3.5s.
 */
export async function withTyping(chatId, task) {
  if (!config.enableTyping) return task();

  let active = true;
  const loop = (async () => {
    while (active) {
      try {
        await client.invoke(new Api.messages.SetTyping({
          peer: chatId,
          action: new Api.SendMessageTypingAction()
        }));
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 3500));
    }
  })();

  try {
    return await task();
  } finally {
    active = false;
    try { await Promise.race([loop, new Promise(resolve => setTimeout(resolve, 200))]); } catch {}
  }
}