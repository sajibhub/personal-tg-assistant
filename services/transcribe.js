import fs from "node:fs";
import { groq } from "../ai/groq.js";
import { config } from "../config/env.js";

export async function transcribeAudio(filePath) {
  try {
    const result = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: config.transcriptionModel,
      response_format: "json"
    });
    return result.text?.trim() || "";
  } catch (error) {
    console.error("Transcription failed:", error.message);
    return "";
  }
}
