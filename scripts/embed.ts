/**
 * Embed chunks and upsert them into Pinecone. PAID step (embeddings).
 *
 * Usage:
 *   npx tsx scripts/embed.ts --input data/subset-chunks.jsonl --namespace subset
 *   npx tsx scripts/embed.ts --input data/chunks.jsonl --namespace ""   # full corpus
 *
 * - Creates the Pinecone index (dim 1536, cosine, serverless) if missing.
 * - Embeds "{title}\n\n{text}" per chunk (title prepended to boost retrieval).
 * - Upserts vectors with metadata {article_id,title,author,url,chunk_index,text,tags}.
 * - Reports token usage + estimated cost.
 */
process.loadEnvFile(".env.local");

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { openai, pinecone, pineconeIndex, EMBEDDING_MODEL, PINECONE_INDEX, EMBED_DIM } from "../lib/clients";

type Chunk = {
  id: string;
  article_id: string;
  chunk_index: number;
  title: string;
  author: string;
  url: string;
  tags: string[];
  text: string;
};

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  if (def !== undefined) return def;
  throw new Error(`missing --${name}`);
}

const INPUT = arg("input");
const NAMESPACE = arg("namespace", "");
const EMBED_BATCH = 96;
const UPSERT_BATCH = 100;
const PRICE_PER_1M = 0.02; // text-embedding-3-small public price, for rough budgeting

async function ensureIndex() {
  const existing = await pinecone().listIndexes();
  if (existing.indexes?.some((ix) => ix.name === PINECONE_INDEX)) {
    console.log(`Index "${PINECONE_INDEX}" already exists.`);
    return;
  }
  console.log(`Creating index "${PINECONE_INDEX}" (dim ${EMBED_DIM}, cosine, serverless)...`);
  await pinecone().createIndex({
    name: PINECONE_INDEX,
    dimension: EMBED_DIM,
    metric: "cosine",
    spec: { serverless: { cloud: "aws", region: "us-east-1" } },
    waitUntilReady: true,
    suppressConflicts: true,
  });
  console.log("Index ready.");
}

async function readChunks(path: string): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) out.push(JSON.parse(line));
  return out;
}

async function main() {
  await ensureIndex();
  const chunks = await readChunks(INPUT);
  console.log(`Loaded ${chunks.length} chunks from ${INPUT} -> namespace "${NAMESPACE}"`);

  const ns = pineconeIndex().namespace(NAMESPACE);
  let totalTokens = 0;
  let upserted = 0;

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const inputs = batch.map((c) => `${c.title}\n\n${c.text}`);
    const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
    totalTokens += res.usage?.total_tokens ?? 0;
    const ordered = [...res.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new Error(`embedding count ${ordered.length} != batch ${batch.length} at i=${i}`);
    }

    const vectors = batch.map((c, j) => {
      const metadata: Record<string, string | number | string[]> = {
        article_id: c.article_id,
        title: c.title,
        author: c.author,
        url: c.url,
        chunk_index: c.chunk_index,
        text: c.text,
      };
      if (c.tags && c.tags.length) metadata.tags = c.tags;
      return { id: c.id, values: ordered[j].embedding as number[], metadata };
    });

    for (let k = 0; k < vectors.length; k += UPSERT_BATCH) {
      await ns.upsert({ records: vectors.slice(k, k + UPSERT_BATCH) });
      upserted += Math.min(UPSERT_BATCH, vectors.length - k);
    }
    process.stderr.write(`  ...embedded+upserted ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}\r`);
  }

  const cost = (totalTokens / 1_000_000) * PRICE_PER_1M;
  console.log("\n=== EMBED DONE ===");
  console.log(`Chunks upserted: ${upserted}`);
  console.log(`Embedding tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Estimated cost @ $${PRICE_PER_1M}/1M: $${cost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
