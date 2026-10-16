# ⚡ Sajib's Personal Telegram AI Assistant

An ultra-fast, intelligent Telegram Userbot designed to handle direct messages naturally. Powered by **GramJS** and **Groq Cloud**, this assistant transcribes voice messages in real-time, maintains persistent local memory, and strictly acts like a natural human user—free from "AI slop."

---

## 🌟 Features

* **⚡ Ultra-Fast AI Replies:** Leverages Groq's `gpt-oss-120b` model to generate context-aware, human-like responses with sub-second latency.
* **🎙️ Voice Note Transcription:** Automatically transcribes incoming audio notes using `whisper-large-v3-turbo` and seamlessly processes them through the conversational engine.
* **💾 Local File Memory:** Maintains chat history per user in individual `.json` files (`memory/` directory) with a sliding window of the last 20 messages.
* **👤 Authentic Human Persona:** Configured with strict rules banning repetitive "AI slop" vocabulary (e.g., *delve*, *ensure*), markdown formatting, and standard assistant clichés to ensure authentic Telegram interactions.
* **🛡️ Smart Traffic Filtering:** Strictly processes direct messages while ignoring channels, group chats, and official Telegram bots to prevent infinite response loops and excessive API calls.
* **🧹 Conversation Control:** Includes a simple `/forget` command allowing users to wipe their chat history and reset context instantly.

---

## 🛠️ Tech Stack

* **Runtime:** [Node.js](https://nodejs.org/) (ES Modules)
* **Telegram API:** [GramJS](https://gram.js.org/) (`telegram` package for Userbot operation)
* **AI Engine:** [Groq SDK](https://console.groq.com/) (`gpt-oss-120b` & `whisper-large-v3-turbo`)
* **Utilities:** `dotenv` for configuration, `input` for secure CLI prompt handling

---

## 📁 Project Structure

```text
.
├── app.js             # Entry point & event listeners for Telegram messages
├── askAI.js           # Groq LLM logic & strict persona prompt configuration
├── transcribe.js      # Groq Whisper integration for audio processing
├── memory.js          # File-based persistent context management
├── createSession.js   # Interactive utility to generate Telegram StringSession
├── .env.example       # Template for required environment variables
├── memory/            # Local directory storing user chat histories (.json)
└── package.json       # Project dependencies and script aliases
```

---

## 🚀 Getting Started

### Prerequisites

* **Node.js** (v18.0.0 or higher)
* **Telegram API Credentials**: Obtain `API_ID` and `API_HASH` from [my.telegram.org](https://my.telegram.org)
* **Groq API Key**: Obtain a key from [console.groq.com](https://console.groq.com)

---

### Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/telegram-ai-assistant.git
   cd telegram-ai-assistant
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure Environment Variables:**

   Create a `.env` file in the root directory:

   ```bash
   cp .env.example .env
   ```

   Fill in your credentials:

   ```env
   API_ID=1234567
   API_HASH=your_telegram_api_hash
   GROQ_API_KEY=gsk_your_groq_api_key_here
   STRING_SESSION=
   ```

4. **Generate Telegram Session:**

   Run the interactive auth script to log into your account and retrieve your `STRING_SESSION`:

   ```bash
   node createSession.js
   ```

   Copy the generated session string output from the terminal and paste it into your `.env` file for `STRING_SESSION`.

---

## 🎯 Usage

Start the personal userbot:

```bash
npm start
```

Once running, the assistant will automatically monitor incoming direct messages, transcribe any voice notes, and reply using context-aware responses.

### User Commands

* `/forget` — Resets and deletes the stored local memory file for the user executing the command.

---

## 👤 Author

**MOHAMMAD SAJIB**

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).