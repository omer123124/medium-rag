/**
 * Single source of truth for RAG hyperparameters.
 *
 * `GET /api/stats` serves these values directly, so editing this file is the ONLY
 * place hyperparameters change. Limits enforced by the assignment:
 *   chunk_size  <= 1024 tokens
 *   overlap_ratio <= 0.3
 *   top_k       <= 30 (and >= 1)
 *
 * Rationale for the current values lives in TECH_DOC.md.
 */
export const ragConfig = {
  /** Max tokens per chunk. */
  chunk_size: 512,
  /** Fraction of a chunk that overlaps the previous one (0..0.3). */
  overlap_ratio: 0.15,
  /** Number of chunks retrieved from Pinecone per query (1..30). */
  top_k: 8,
} as const;

export type RagConfig = typeof ragConfig;

// Fail fast if a value drifts outside the assignment's allowed range.
if (ragConfig.chunk_size > 1024 || ragConfig.chunk_size < 1) {
  throw new Error(`chunk_size must be in 1..1024, got ${ragConfig.chunk_size}`);
}
if (ragConfig.overlap_ratio < 0 || ragConfig.overlap_ratio > 0.3) {
  throw new Error(`overlap_ratio must be in 0..0.3, got ${ragConfig.overlap_ratio}`);
}
if (ragConfig.top_k < 1 || ragConfig.top_k > 30) {
  throw new Error(`top_k must be in 1..30, got ${ragConfig.top_k}`);
}

/** Derived: overlap expressed in tokens. */
export const overlapTokens = Math.round(ragConfig.chunk_size * ragConfig.overlap_ratio);

/**
 * Internal candidate pool size for retrieval. We fetch this many raw chunks from
 * Pinecone, then dedupe to the best chunk per distinct article and keep top_k of
 * them. This guarantees `top_k` DISTINCT articles in context (required for type-2
 * "list N distinct articles"). Not part of /api/stats. Kept <= 30 to respect the
 * assignment's retrieval cap.
 */
export const RETRIEVAL_FETCH_K = 30;

/**
 * Max chunks kept per article in the context. 1 maximizes distinct-article coverage
 * (type-2) but can starve summaries (type-3) of an article's substantive passages.
 * 2 keeps strong distinct coverage while giving the top article(s) enough depth to
 * summarize/justify. Total chunks in context is still capped at top_k.
 */
export const RETRIEVAL_MAX_PER_ARTICLE = 2;
