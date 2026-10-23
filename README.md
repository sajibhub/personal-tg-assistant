# Telegram AI Brain v2

A smarter, faster, voice-first upgrade of your Telegram AI brain.

Built on the same stack you already use (GramJS + Groq + MongoDB + local MiniLM embeddings), with major upgrades in five areas:

## What's new vs v1

### 1. Voice — voice in, voice out
- **Voice-note replies**: when someone sends a voice note, the bot now answers with a **voice note** (Groq PlayAI TTS), not just text.
- If ffmpeg is installed on the server, audio is converted to OGG/Opus (Telegram's native voice format with waveform). Without ffmpeg it still sends the voice note as WAV, with automatic fallback to text if anything fails.
- Smart gates: very long replies (over `TTS_MAX_CHARS`), links/code blocks, and non-English/non-Spanish text (PlayAI TTS limitation) automatically fall back to a text reply — so Bengali voice chats still get instant text answers.
- **Better transcription accuracy**: recent chat vocabulary (names, places, slang) is fed to Whisper as a context `prompt`, temperature is pinned to 0, and there is an automatic fallback from `whisper-large-v3-turbo` to `whisper-large-v3`.
- **Round video notes** are now transcribed too.
- If a voice note can't be transcribed at all, the bot politely asks the sender to repeat instead of ignoring them.

### 2. Smarter brain — "max" thinking mode
- `BRAIN_MODE=max` (default): every real message runs on **gpt-oss-120b with `reasoning_effort=high`** — the model genuinely thinks before answering.
- Tiered routing still protects you: pure greetings/acks ("hi", "ok", "thanks") skip the heavy thinking and answer instantly with low reasoning.
- **Parallel drafting**: two drafts are generated **at the same time** (not one after another), then a strong-model judge picks the winner — better quality with almost zero extra wall-clock time.
- **Time awareness**: the system prompt always carries the current date/time in your timezone (`TIMEZONE`), so "tomorrow at 8" is understood correctly.
- Refined drafting persona: mirrors the sender's language exactly (including Bengali), handles spoken language from voice transcriptions naturally, never mentions transcription.

### 3. Faster
- Parallel drafts instead of sequential (evaluation no longer doubles latency).
- Typing indicator while thinking, so the chat feels alive and responsive.
- **Embedding LRU cache** (`EMBED_CACHE_SIZE`): repeated words/phrases skip recomputation entirely.
- Batched embeddings for memory extraction (one model pass for up to 8 memories).
- All utility jobs (query rewrite, summaries, memory extraction) run on fast/low-reasoning settings and never block the reply.
- Automatic retry with backoff + timeouts on every Groq call; if the strong model ever fails, the router self-heals and answers with the fast model rather than staying silent.

### 4. Better memory
- **Rolling conversation summaries**: every `SUMMARY_EVERY` messages the background summarizer merges the old summary with new messages, so month-long chats never lose context.
- **Query rewrite**: short/ambiguous queries and noisy voice transcriptions are rewritten into clean keyword queries before memory search — big recall improvement for voice.
- **Smarter ranking**: memories and old messages now score by cosine similarity + importance + recency boost (recent facts surface more often).
- **Embedding-based dedupe** at write time: near-duplicate memories (cosine > 0.90) merge instead of piling up.
- Stronger sensitive-data filter (passwords, PINs, OTPs, card/bank numbers never stored).

### 5. Commands
| Command | Effect |
|---|---|
| `/forget` | clear all saved memory for this chat |
| `/ai on` / `/ai off` | toggle auto-replies |
| `/summary` | on-demand summary of the chat so far |

## Setup

```bash
npm install
cp .env.example .env   # fill in your values
npm start
```

Same `.env` variables as v1 (API_ID, API_HASH, SESSION, GROQ_API_KEY, MONGO_URI) plus new optional ones — all documented in `.env.example`. Existing MongoDB data works as-is (the Chat model just gains summary fields).

Optional but recommended: install `ffmpeg` on the server for proper OGG voice notes:
```bash
sudo apt install -y ffmpeg
```

## Notes & tuning

- **Voice language**: Groq's `playai-tts` currently speaks English and Spanish. Bengali (or other) conversations automatically get text replies. When Groq ships a multilingual TTS model, just change `GROQ_TTS_MODEL` in `.env` — no code change needed.
- **Voice choice**: try `GROQ_TTS_VOICE=Arista-PlayAI`, `Quinn-PlayAI`, `Thunder-PlayAI`, etc.
- **Too slow?** Set `BRAIN_MODE=auto` (deep reasoning only for complex messages) or `BRAIN_MODE=fast`, and/or `ENABLE_REPLY_EVALUATION=false`.
- **Free-tier TTS rate limits**: if TTS hits a rate limit, the bot instantly falls back to a text reply — the user never notices a failure.
- The reply-queue, per-chat serialization, `/forget` semantics and health endpoint all work exactly as in v1.
