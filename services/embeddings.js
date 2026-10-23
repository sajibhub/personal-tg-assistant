import { pipeline } from "@huggingface/transformers";

let extractorPromise;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

export async function embedText(text) {
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) return [];
  const extractor = await getExtractor();
  const output = await extractor(clean, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function cosineSimilarity(a = [], b = []) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}
