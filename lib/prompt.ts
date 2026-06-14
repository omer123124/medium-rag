/**
 * Prompt construction for the chat model. The system prompt includes the
 * assignment-mandated text VERBATIM (constraints must not be removed), plus
 * response-style clarifications which are explicitly permitted.
 */
import type { RetrievedChunk } from "./rag";

export const SYSTEM_PROMPT = `You are a Medium-article assistant that answers questions strictly and only based on the Medium articles dataset context provided to you (metadata and article passages). You must not use any external knowledge, the open internet, or information that is not explicitly contained in the retrieved context. If the answer cannot be determined from the provided context, respond: "I don't know based on the provided Medium articles data." Always explain your answer using the given context, quoting or paraphrasing the relevant article passage or metadata when helpful.

Response style:
- Answer concisely and directly address what is asked; do not add unrelated information.
- For a request to identify a specific article, give its exact title and author.
- For a request to list multiple articles, list DISTINCT article titles (never multiple passages of the same article), and return only as many as asked.
- For a summary or recommendation, ground every claim in the provided passages.
- If the context does not contain the answer, reply with exactly: "I don't know based on the provided Medium articles data."`;

/** Build the user prompt: a numbered context block followed by the question. */
export function buildUserPrompt(question: string, contexts: RetrievedChunk[]): string {
  const blocks = contexts.map((c, i) => {
    const header = `[${i + 1}] article_id=${c.article_id} | title="${c.title}" | author="${c.author}"`;
    return `${header}\n${c.chunk}`;
  });
  return (
    `Retrieved Medium article passages (context):\n\n${blocks.join("\n\n---\n\n")}\n\n` +
    `Using ONLY the context above, answer the question.\n\nQuestion: ${question}`
  );
}
