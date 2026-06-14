/**
 * Core RAG pipeline: embed query -> retrieve from Pinecone -> build prompt ->
 * call the chat model. Used by POST /api/prompt and by validation scripts.
 */
import {
  openai,
  pineconeIndex,
  EMBEDDING_MODEL,
  CHAT_MODEL,
  PINECONE_NAMESPACE,
} from "./clients";
import { ragConfig, RETRIEVAL_FETCH_K, RETRIEVAL_MAX_PER_ARTICLE } from "./config";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export type RetrievedChunk = {
  article_id: string;
  title: string;
  author: string;
  chunk: string;
  score: number;
};

/** Embed one or more texts with the assignment's embedding model. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  // Preserve input order (API returns objects with an `index`).
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

export type RetrieveOptions = { topK?: number; namespace?: string };

/**
 * Embed the question, fetch a candidate pool from Pinecone, then keep up to
 * RETRIEVAL_MAX_PER_ARTICLE chunks per article (best-scoring first), returning
 * top_k chunks total. This spans several DISTINCT articles (type-2) while giving
 * the most relevant article(s) enough depth to summarize/justify (type-3/4).
 */
export async function retrieve(
  question: string,
  opts: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? ragConfig.top_k;
  const namespace = opts.namespace ?? PINECONE_NAMESPACE;
  const fetchK = Math.max(topK, RETRIEVAL_FETCH_K);

  const [vector] = await embedTexts([question]);
  const ns = pineconeIndex().namespace(namespace);
  const res = await ns.query({ topK: fetchK, vector, includeMetadata: true });

  // Matches are sorted by descending score; take chunks in order, capping how many
  // come from any single article so the context stays diverse across articles.
  const perArticle = new Map<string, number>();
  const picked: RetrievedChunk[] = [];
  for (const m of res.matches ?? []) {
    const md = (m.metadata ?? {}) as Record<string, unknown>;
    const article_id = String(md.article_id ?? "");
    const count = perArticle.get(article_id) ?? 0;
    if (count >= RETRIEVAL_MAX_PER_ARTICLE) continue;
    perArticle.set(article_id, count + 1);
    picked.push({
      article_id,
      title: String(md.title ?? ""),
      author: String(md.author ?? ""),
      chunk: String(md.text ?? ""),
      score: typeof m.score === "number" ? m.score : 0,
    });
    if (picked.length >= topK) break;
  }
  return picked;
}

export type PromptResult = {
  response: string;
  context: { article_id: string; title: string; chunk: string; score: number }[];
  Augmented_prompt: { System: string; User: string };
};

/** Full pipeline producing the exact /api/prompt response shape. */
export async function answerQuestion(
  question: string,
  opts: RetrieveOptions = {}
): Promise<PromptResult> {
  const retrieved = await retrieve(question, opts);
  const userPrompt = buildUserPrompt(question, retrieved);

  const completion = await openai().chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  const response = completion.choices[0]?.message?.content?.trim() ?? "";

  return {
    response,
    context: retrieved.map((c) => ({
      article_id: c.article_id,
      title: c.title,
      chunk: c.chunk,
      score: c.score,
    })),
    Augmented_prompt: { System: SYSTEM_PROMPT, User: userPrompt },
  };
}
