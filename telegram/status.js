import { Api } from "telegram";
import { client } from "./client.js";

/**
 * Set your Telegram account online or offline.
 * @param {boolean} online 
 */
export async function setStatus(online) {
  try {
    await client.invoke(
      new Api.account.UpdateStatus({
        offline: !online, 
      })
    );
  } catch (err) {
    console.error("Failed to update status:", err?.message || err);
  }
}