import dotenv from "dotenv";
dotenv.config();

import http from "http"; // Added built-in HTTP module
import fs from "fs";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

import askAI from "./askAI.js";
import { transcribeAudio } from "./transcribe.js";
import { getHistory, addMessage, clearHistory } from "./memory.js";

// --- HTTP SERVER (For hosting/uptime monitoring) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    // Respond with "ok" for any request
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ HTTP API Server running on http://0.0.0.0:${PORT}`);
});
// ---------------------------------------------------

const client = new TelegramClient(
    new StringSession(process.env.SESSION),
    Number(process.env.API_ID),
    process.env.API_HASH,
    { connectionRetries: 5 }
);

const start = async () => {
    await client.start({});

    client.addEventHandler(
        async (event) => {
            try {
                const message = event.message;
                if (message.out) return; // Ignore own messages

                // Ignore groups & channels
                if (message.isGroup || message.isChannel) return;

                // Ignore bots
                let sender;
                try {
                    sender = await message.getSender();
                } catch (e) {
                    return;
                }
                if (sender?.bot) return;

                const chatId = String(message.chatId);
                let userText = "";

                // Handle Voice Notes & Audio Files
                if (message.media) {
                    const doc = message.media.document;
                    
                    // Check if it's an audio/voice file
                    if (doc && (doc.mimeType.startsWith("audio/") || doc.mimeType.startsWith("video/"))) {
                        const tempPath = `voice_${Date.now()}.ogg`;
                        
                        // Download the voice note
                        await client.downloadMedia(message.media, { outputFile: tempPath });
                        
                        // Transcribe using Groq Whisper
                        userText = await transcribeAudio(tempPath);
                        
                        // Delete the temporary audio file
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                        if (!userText) {
                            await client.sendMessage(chatId, { message: "Couldn't understand the audio." });
                            return;
                        }

                        // Tell the AI this was a voice note so it has context
                        userText = `[Voice Note]: ${userText}`; 
                    } else {
                        // It's an image/video but not a voice note, ignore for now
                        return;
                    }
                } else if (message.text) {
                    // Handle normal text messages
                    userText = message.text.trim();
                } else {
                    return; // Ignore if no text and no audio
                }

                // Command to clear memory (works for text and voice)
                if (userText.toLowerCase().replace("[voice note]: ", "") === "/forget") {
                    clearHistory(chatId);
                    await client.sendMessage(chatId, {
                        message: "done, forgot everything 🧹",
                        replyTo: message.id,
                    });
                    return;
                }

                const sent = await client.sendMessage(chatId, {
                    message: "Thinking...",
                    replyTo: message.id,
                });

                const msgId = sent.id;
                const history = getHistory(chatId);

                // Get AI reply with context
                const aiReply = await askAI(userText, history);

                // Save to memory (saves the transcribed text as the user message)
                addMessage(chatId, "user", userText);
                addMessage(chatId, "assistant", aiReply);

                // Try to edit the "Thinking..." message
                try {
                    await client.editMessage(chatId, {
                        message: msgId,
                        text: aiReply,
                        linkPreview: false, // Prevents Telegram from showing link previews
                    });
                } catch (editErr) {
                    // If editing fails (e.g., message is too long or identical), send as new message
                    console.log("Edit failed, sending new message.");
                    await client.sendMessage(chatId, { 
                        message: aiReply, 
                        linkPreview: false 
                    });
                }

            } catch (err) {
                console.log("AI ERROR:", err.message);
            }
        },
        new NewMessage({
            incoming: true,
            outgoing: false,
        })
    );

    // Keep the Node process alive for the Telegram client
    await new Promise(() => {});
};

start();