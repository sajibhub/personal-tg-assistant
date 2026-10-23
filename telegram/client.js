import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { config } from "../config/env.js";

export const client = new TelegramClient(
  new StringSession(config.session),
  config.apiId,
  config.apiHash,
  {
    connectionRetries: 5,
    autoReconnect: true,
    retryDelay: 2000,
    deviceModel: "telegram-ai-brain",
    systemVersion: "2.0",
    appVersion: "2.0"
  }
);

export async function connectTelegram() {
  if (config.session) {
    await client.connect();
    if (await client.checkAuthorization()) {
      console.log("Telegram session connected");
      return;
    }
    console.warn("SESSION was rejected or expired. Starting login flow.");
  }

  const rl = readline.createInterface({ input, output });
  try {
    await client.start({
      phoneNumber: async () => rl.question("Telegram phone number (with country code): "),
      password: async () => rl.question("Telegram 2FA password (if enabled): "),
      phoneCode: async () => rl.question("Telegram login code: "),
      onError: (error) => console.error("Telegram login error:", error.message)
    });
    const session = client.session.save();
    console.log("\nLOGIN SUCCESSFUL. Copy this session string into SESSION in your .env:\n");
    console.log(session);
    console.log("\nRestart the app after saving it. Do not share this string.\n");
  } finally {
    rl.close();
  }
}
