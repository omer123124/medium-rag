# Medium Article RAG Assistant

A Retrieval-Augmented Generation assistant that answers questions **only** from a dataset of
~7,600 English Medium articles — never from outside knowledge. If the answer isn't in the
retrieved context, it replies: *"I don't know based on the provided Medium articles data."*

**Live demo:** https://medium-rag-eight.vercel.app
**Stack:** Next.js 16 (App Router, TypeScript) · Pinecone · OpenAI-compatible course models · Vercel

## Question types supported
1. **Precise fact retrieval** — locate one specific article from a semantic description; return title + author.
2. **Multi-result topic listing** — return up to 3 **distinct** article titles on a theme.
3. **Key-idea summary** — find a relevant article and summarise its central argument.
4. **Recommendation with justification** — pick one article and justify it from the retrieved text.

## Project structure
```text
medium-rag/
├── app/
│   ├── api/prompt/route.ts   # POST /api/prompt
│   ├── api/stats/route.ts    # GET  /api/stats
│   ├── page.tsx              # landing page + in-browser demo
│   └── layout.tsx, globals.css
├── lib/
│   ├── config.ts             # single source of truth for hyperparameters (served by /api/stats)
│   ├── clients.ts            # OpenAI-compatible + Pinecone clients (env-driven)
│   ├── rag.ts                # embed → retrieve → augment → chat pipeline
│   └── prompt.ts             # required system prompt + user-prompt builder
├── scripts/                  # offline data pipeline (token-based, reproducible)
│   ├── normalize.ts          # CSV → clean JSONL (dedup, parse authors/tags, stable article_id)
│   ├── chunk.ts              # token-based chunker (size/overlap from lib/config.ts)
│   ├── embed.ts              # embed chunks → upsert to Pinecone
│   └── query-test.ts         # run example questions end-to-end
├── data/.gitkeep             # dataset + derived JSONL live here (gitignored)
├── .env.example
└── package.json, tsconfig.json, next.config.ts, ...
```

## Setup
```bash
npm install
cp .env.example .env.local   # fill in real keys (never commit them)
```
Put the dataset at `data/medium-english-50mb.csv` (gitignored). Then run the dev server:
```bash
npm run dev   # http://localhost:3000
```

### Environment variables
| Var | Value |
|-----|-------|
| `OPENAI_API_KEY` | course API key (LLMod.ai) |
| `OPENAI_BASE_URL` | `https://api.llmod.ai/v1` |
| `EMBEDDING_MODEL` | `4UHRUIN-text-embedding-3-small` |
| `CHAT_MODEL` | `4UHRUIN-gpt-5-mini` |
| `PINECONE_API_KEY` | Pinecone key |
| `PINECONE_INDEX` | `medium-rag` |

In production these are set in the Vercel dashboard, not committed.

## Data pipeline (offline, run once)
Start with a small subset to control cost, validate, then scale to the full corpus.
```bash
npx tsx scripts/normalize.ts                                   # CSV → data/articles.jsonl
npx tsx scripts/chunk.ts                                       # → data/chunks.jsonl
npx tsx scripts/embed.ts --input data/chunks.jsonl --namespace ""   # embed full corpus → Pinecone
npx tsx scripts/query-test.ts ""                               # verify the 4 example questions
```
The Pinecone index is serverless, **dimension 1536** (matching the embedding model), cosine metric.
Vector ids are deterministic (`article_id#chunk_index`) so re-runs don't duplicate vectors.

## Hyperparameters (and why)
Read from one source, `lib/config.ts`, and served verbatim by `GET /api/stats`.

| Param | Value | Limit | Rationale |
|-------|-------|-------|-----------|
| `chunk_size` | 512 tokens | ≤1024 | Keeps a chunk ≈ one idea — good precision for fact/summary — while staying cheap. A comparison vs 256 and 1024 confirmed 512 as the best quality-per-cost (1024 dilutes embeddings; 256 doubles vector count for no quality gain). |
| `overlap_ratio` | 0.15 | ≤0.3 | ~77-token overlap preserves continuity across boundaries without redundant cost. |
| `top_k` | 8 | ≤30 | Enough to cover multi-article (type-2) and summary (type-3) needs while keeping context small. |

Retrieval keeps up to **2 chunks per article** (best-scoring first) out of a fetch-30 candidate
pool, so the context spans several **distinct** articles (type-2) while giving the most relevant
article enough depth to summarise/justify (types 3–4).

## API
### `POST /api/prompt`
```bash
curl -X POST https://medium-rag-eight.vercel.app/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"question":"List exactly 3 articles about education. Return only the titles."}'
```
Response:
```json
{
  "response": "Final natural language answer from the model.",
  "context": [
    { "article_id": "1234", "title": "Sample article title", "chunk": "article chunk retrieved", "score": 0.1234 }
  ],
  "Augmented_prompt": { "System": "system prompt used", "User": "user prompt used" }
}
```

### `GET /api/stats`
```bash
curl https://medium-rag-eight.vercel.app/api/stats
# {"chunk_size":512,"overlap_ratio":0.15,"top_k":8}
```

## Required system prompt
The chat model is called with this prompt verbatim (plus response-style clarifications):
> You are a Medium-article assistant that answers questions strictly and only based on the Medium
> articles dataset context provided to you (metadata and article passages). You must not use any
> external knowledge, the open internet, or information that is not explicitly contained in the
> retrieved context. If the answer cannot be determined from the provided context, respond: "I
> don't know based on the provided Medium articles data." Always explain your answer using the
> given context, quoting or paraphrasing the relevant article passage or metadata when helpful.

## Deployment
Standard Next.js app on Vercel (no `vercel.json` needed). Connect the repo, set the 6 env vars
above, and deploy. `POST /api/prompt` sets `maxDuration = 60` and the Node runtime so the chat +
embedding + Pinecone round-trip fits the serverless timeout.
