import { pipeline } from "@huggingface/transformers";
import { createHash } from "node:crypto";
import { config } from "../config/env.js";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
let extractorPromise;
let warmedUp = false;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  }
  return extractorPromise;
}

/** Pre-load the model so the first real message is not slowed down. */
export async function warmupEmbeddings() {
  if (warmedUp) return;
  try {
    const extractor = await getExtractor();
    await extractor("warmup", { pooling: "mean", normalize: true });
    warmedUp = true;
    console.log("Embedding model warmed up");
  } catch (error) {
    console.warn("Embedding warmup failed (will retry on first use):", error.message);
    extractorPromise = undefined;
  }
}

// ---- LRU cache: identical texts never recompute ----
const cacheKey = text => createHash("sha1").update(`${MODEL_ID}:${text}`).digest("hex");
const cache = new Map();

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value); // refresh recency
  return value;
}

function cacheSet(key, vector) {
  if (cache.size >= config.embedCacheSize) {
    cache.delete(cache.keys().next().value); // evict oldest
  }
  cache.set(key, vector);
}

export async function embedText(text) {
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) return [];
  const key = cacheKey(clean);
  const hit = cacheGet(key);
  if (hit) return hit;

  const extractor = await getExtractor();
  const output = await extractor(clean, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  cacheSet(key, vector);
  return vector;
}

/** Embed many texts in one model pass (batching is much faster in a loop-heavy workload). */
export async function embedBatch(texts = []) {
  const clean = texts.map(t => String(t || "").trim().slice(0, 4000));
  const results = new Array(clean.length).fill(null);
  const pending = [];

  clean.forEach((text, index) => {
    if (!text) return;
    const key = cacheKey(text);
    const hit = cacheGet(key);
    if (hit) results[index] = hit;
    else pending.push({ index, text, key });
  });

  if (pending.length) {
    const extractor = await getExtractor();
    // transformers.js supports array input; process in small batches for memory safety.
    for (let i = 0; i < pending.length; i += 16) {
      const slice = pending.slice(i, i + 16);
      const output = await extractor(slice.map(p => p.text), { pooling: "mean", normalize: true });
      const dims = output.dims[output.dims.length - 1];
      slice.forEach((item, row) => {
        const vector = Array.from(output.data.slice(row * dims, (row + 1) * dims));
        cacheSet(item.key, vector);
        results[item.index] = vector;
      });
    }
  }
  return results;
}

export function cosineSimilarity(a = [], b = []) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}
