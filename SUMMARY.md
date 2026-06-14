# Summary — results & key decisions

A concise companion to the [README](README.md). The README covers how the system works and how to
run it; this file records the dataset facts, the hyperparameter decision, and validation results.

## Deliverables
- **Live URL:** https://medium-rag-eight.vercel.app (landing page + `POST /api/prompt`, `GET /api/stats`).
- **Models:** `4UHRUIN-text-embedding-3-small` (1536-dim) for embeddings, `4UHRUIN-gpt-5-mini` for chat.
- **Vector DB:** Pinecone, index `medium-rag`, dim 1536, cosine, serverless (AWS us-east-1).

## Dataset
- 7,682 raw rows → **7,672 articles** after dropping 10 exact-text duplicates. All columns fully
  populated; `url` is 100% unique (natural key); `authors`/`tags` parsed from Python-list strings.
- Median article ≈ 1,105 tokens; total corpus ≈ 10.5M tokens.
- Stable `article_id` = zero-padded sequential index (CSV order, after dedup).

## Chunking & embedding
- Token-based (cl100k, same family as the embedding model), 512-token windows, 0.15 overlap.
- 7,672 articles → **26,493 chunks** embedded once to the Pinecone default namespace.
- Embedding input prepends the title (`"{title}\n\n{chunk}"`) to boost title/topic retrieval.

## Hyperparameter comparison (subset, retrieval-only)
| Config | Result |
|--------|--------|
| **512 / 0.15 (chosen)** | Best quality-per-cost; strong top-1 precision across question types. |
| 256 / 0.20 | Comparable quality but ~2× the vectors (cost/storage) for no gain. |
| 1024 / 0.10 | Lower similarity scores and weaker top-1 — larger chunks dilute the embedding. |

Final config: `chunk_size=512`, `overlap_ratio=0.15`, `top_k=8`, max 2 chunks/article.

## Validation (four example questions, full corpus)
- **Q1 (fact):** ✓ "A Marketing Guide for Introverts" — Shaunta Grimes.
- **Q2 (list 3):** ✓ three distinct education titles.
- **Q4 (recommend):** ✓ a habits article with a grounded justification.
- **Q3 (summary):** the model returns the mandated refusal. The historical "past pandemics spur
  innovation" article is buried by the COVID-heavy 2020 corpus; the safe refusal is the
  assignment's intended behaviour on weak context (not a hallucination). A future improvement
  would fetch the top candidate's full text for summary-type questions.

## Cost
Full-corpus embed ≈ $0.245 (12.26M tokens). Total spend incl. validation ≈ $0.28 of the $5 budget.
