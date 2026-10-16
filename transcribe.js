import fs from "fs";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export const transcribeAudio = async (filePath) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is missing");
        }

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-large-v3-turbo",
            temperature: 0,
            response_format: "verbose_json",
        });

        return transcription.text;
    } catch (error) {
        console.error("Transcription Error:", error.message);
        return null;
    }
};