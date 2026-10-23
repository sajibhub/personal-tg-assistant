import http from "node:http";
import { config } from "./config/env.js";
import { connectDatabase } from "./config/db.js";
import { connectTelegram, client } from "./telegram/client.js";
import { registerTelegramHandlers } from "./telegram/handlers.js";
import { warmupEmbeddings } from "./services/embeddings.js";

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("ok\n");
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Health endpoint listening on port ${config.port}`);
});

async function main() {
  console.log(
    `Brain: mode=${config.brainMode}, model=${config.strongModel}, reasoning=${config.reasoningEffort}, ` +
    `parallel drafts=${config.enableEvaluation}, voice replies=${config.voiceReplies} (${config.ttsModel}/${config.ttsVoice})`
  );
  await connectDatabase();
  // Load the embedding model in the background so the first message is fast.
  warmupEmbeddings().catch(() => {});
  await connectTelegram();
  registerTelegramHandlers();
  console.log("Telegram AI brain v2 is running (voice-to-voice, max reasoning, rolling memory)");
}

main().catch(async error => {
  console.error("Startup failed:", error?.stack || error?.message || error);
  server.close();
  try { await client.disconnect(); } catch {}
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close();
  try { await client.disconnect(); } catch {}
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Keep the process alive on stray background errors (network hiccups etc.).
process.on("unhandledRejection", reason => {
  console.error("Unhandled rejection:", reason?.stack || reason?.message || reason);
});
