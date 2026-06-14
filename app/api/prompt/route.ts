import { answerQuestion } from "@/lib/rag";

// The chat model (gpt-5-mini "thinking") plus embedding + Pinecone can exceed the
// default serverless timeout, so allow up to 60s. Node runtime is required by the
// OpenAI/Pinecone SDKs. Never cache — every question is dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/prompt
 * Input:  { "question": "..." }
 * Output: { response, context[], Augmented_prompt:{System,User} }  (exact casing required)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = (body as { question?: unknown })?.question;
  if (typeof question !== "string" || question.trim() === "") {
    return Response.json(
      { error: 'Body must include a non-empty "question" string.' },
      { status: 400 }
    );
  }

  try {
    const result = await answerQuestion(question);
    return Response.json(result);
  } catch (err) {
    console.error("[/api/prompt] error:", err);
    return Response.json(
      { error: "Failed to generate an answer.", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
