// Optional multilingual sentence embeddings for story matching.
// Uses transformers.js with paraphrase-multilingual-MiniLM-L12-v2 (50+ languages incl. Hindi,
// trained so that translations and paraphrases land close together). The model (~120 MB) is
// downloaded once into DATA_DIR/models. If the package or model is unavailable, matching falls
// back to the lexical + phonetic rules in verify.js.
import path from 'node:path';
import { config } from './config.js';

let extractor = null;
let loading = null;
let failed = false;

export const semanticActive = () => config.semantic.enabled && !failed;
export const semanticReady = () => Boolean(extractor);

async function load() {
  if (extractor || failed) return extractor;
  loading ||= (async () => {
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(config.dataDir, 'models');
      extractor = await pipeline('feature-extraction', config.semantic.model, { dtype: 'q8' });
      console.log(`[semantic] loaded ${config.semantic.model}`);
    } catch (e) {
      failed = true;
      console.warn(`[semantic] disabled, using lexical matching only: ${e.message}`);
    }
    return extractor;
  })();
  return loading;
}

// Returns one unit-length vector per title, or null when embeddings are unavailable.
export async function embed(titles) {
  if (!titles.length || !semanticActive()) return null;
  const model = await load();
  if (!model) return null;
  const out = [];
  for (let i = 0; i < titles.length; i += 32) {
    const batch = titles.slice(i, i + 32);
    const tensor = await model(batch, { pooling: 'mean', normalize: true });
    const dim = tensor.dims[1];
    for (let j = 0; j < batch.length; j++) out.push(tensor.data.slice(j * dim, (j + 1) * dim));
  }
  return out;
}
