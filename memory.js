import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEMORY_DIR = path.join(__dirname, "memory");
const MAX_HISTORY = 20;

// Ensure memory folder exists
if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Helper to get the file path for a specific chat
const getFilePath = (chatId) => path.join(MEMORY_DIR, `${chatId}.json`);

export const getHistory = (chatId) => {
    const filePath = getFilePath(chatId);
    if (!fs.existsSync(filePath)) return [];
    
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return [];
    }
};

export const addMessage = (chatId, role, content) => {
    const filePath = getFilePath(chatId);
    const history = getHistory(chatId);

    history.push({ role, content, time: Date.now() });

    // Trim old messages if too long
    if (history.length > MAX_HISTORY) {
        // Remove the oldest messages
        history.splice(0, history.length - MAX_HISTORY);
    }

    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
};

export const clearHistory = (chatId) => {
    const filePath = getFilePath(chatId);
    
    // Delete the file completely if it exists
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};