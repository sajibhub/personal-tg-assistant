import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { client } from "./client.js";
import { safeSendText } from "./typing.js";
import { synthesizeSpeech, convertToOggOpus, wavDurationSeconds, isSpeakable } from "../services/tts.js";

/**
 * Send a reply as a Telegram VOICE NOTE (voice in -> voice out).
 * Pipeline: text -> Groq PlayAI TTS (wav) -> ffmpeg ogg/opus if available
 * -> sendFile with DocumentAttributeAudio(voice=true).
 * Graceful degradation chain: voice note -> audio attachment -> plain text.
 */
export async function sendReply(chatId, replyText, { replyTo, asVoice = false } = {}) {
  const text = String(replyText || "").slice(0, 4000);
  if (!text) return null;

  if (asVoice && isSpeakable(text)) {
    try {
      const wav = await synthesizeSpeech(text);
      const ogg = await convertToOggOpus(wav);
      const audio = ogg || wav;
      const duration = ogg ? wavDurationSeconds(wav) : wavDurationSeconds(wav);
      const file = new CustomFile(ogg ? "voice.ogg" : "voice.wav", audio.length, "", audio);
      const attributes = [new Api.DocumentAttributeAudio({
        voice: true,
        ...(duration ? { duration } : {})
      })];
      const sent = await client.sendFile(chatId, {
        file,
        attributes,
        replyTo,
        forceDocument: false
      });
      return { sent, mode: "voice" };
    } catch (error) {
      console.warn("Voice reply failed; falling back to text:", error?.message || error);
    }
  }

  const sent = await safeSendText(chatId, text, { replyTo });
  return sent ? { sent, mode: "text" } : null;
}
