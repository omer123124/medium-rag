import { ragConfig } from "@/lib/config";

/**
 * GET /api/stats — returns the current RAG hyperparameters.
 * Reads the single source of truth (lib/config.ts) so it always reflects current values.
 * Exact field names required by the assignment: chunk_size, overlap_ratio, top_k.
 */
export async function GET() {
  return Response.json({
    chunk_size: ragConfig.chunk_size,
    overlap_ratio: ragConfig.overlap_ratio,
    top_k: ragConfig.top_k,
  });
}
