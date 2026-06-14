/**
 * Phase 3 — token-based chunking (free, offline).
 *
 * Reads data/articles.jsonl and splits each article's text into overlapping
 * token windows using the same cl100k tokenizer as the embedding model.
 * Window size + overlap come from lib/config.ts (the single source of truth),
 * so changing hyperparameters there changes chunking too.
 *
 * Each chunk carries full article metadata so the API can return title/author
 * (type-1) and dedupe to distinct articles by article_id (type-2).
 *
 * Output: data/chunks.jsonl (gitignored). One JSON object per line:
 *   { id, article_id, chunk_index, title, author, url, tags[], text, token_count }
 * where `id` = `${article_id}#${chunk_index}` (the Pinecone vector id).
 *
 * Run: npx tsx scripts/chunk.ts
 */
import { createReadStream, createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { encode, decode } from "gpt-tokenizer/encoding/cl100k_base";
import { ragConfig } from "../lib/config";

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  if (def !== undefined) return def;
  throw new Error(`missing --${name}`);
}

// Defaults reproduce the production chunking; flags allow re-chunking a subset
// at alternative configs for the hyperparameter comparison.
const IN_PATH = arg("in", "data/articles.jsonl");
const OUT_PATH = arg("out", "data/chunks.jsonl");
const SIZE = parseInt(arg("size", String(ragConfig.chunk_size)), 10);
const OVERLAP = parseFloat(arg("overlap", String(ragConfig.overlap_ratio)));
const ONLY_IDS = arg("only-ids", "");

type Article = {
  article_id: string;
  title: string;
  author: string;
  url: string;
  timestamp: string;
  tags: string[];
  text: string;
};

const STEP = SIZE - Math.round(SIZE * OVERLAP); // tokens advanced per window
const idFilter: Set<string> | null = ONLY_IDS
  ? new Set<string>(JSON.parse(readFileSync(ONLY_IDS, "utf8")))
  : null;

/** Split a token array into overlapping windows of SIZE (step = SIZE - overlap). */
function* windows(tokens: number[]): Generator<number[]> {
  if (tokens.length <= SIZE) {
    yield tokens;
    return;
  }
  for (let start = 0; start < tokens.length; start += STEP) {
    yield tokens.slice(start, start + SIZE);
    if (start + SIZE >= tokens.length) break;
  }
}

async function main() {
  mkdirSync("data", { recursive: true });
  const out = createWriteStream(OUT_PATH, { encoding: "utf8" });
  const rl = createInterface({ input: createReadStream(IN_PATH, "utf8"), crlfDelay: Infinity });

  let articles = 0;
  let chunks = 0;
  let maxTokens = 0;
  let maxChunksPerArticle = 0;
  const perArticle: number[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const a = JSON.parse(line) as Article;
    if (idFilter && !idFilter.has(a.article_id)) continue;
    const tokens = encode(a.text);
    let idx = 0;
    for (const win of windows(tokens)) {
      const text = decode(win).trim();
      if (!text) continue;
      const rec = {
        id: `${a.article_id}#${idx}`,
        article_id: a.article_id,
        chunk_index: idx,
        title: a.title,
        author: a.author,
        url: a.url,
        tags: a.tags,
        text,
        token_count: win.length,
      };
      out.write(JSON.stringify(rec) + "\n");
      maxTokens = Math.max(maxTokens, win.length);
      idx++;
      chunks++;
    }
    perArticle.push(idx);
    maxChunksPerArticle = Math.max(maxChunksPerArticle, idx);
    articles++;
    if (articles % 1000 === 0) process.stderr.write(`  ...chunked ${articles} articles\r`);
  }

  await new Promise<void>((resolve) => out.end(resolve));

  const avg = perArticle.reduce((s, n) => s + n, 0) / Math.max(1, perArticle.length);
  console.log("\n=== CHUNKING ===");
  console.log(`In=${IN_PATH} Out=${OUT_PATH}${idFilter ? ` (only ${idFilter.size} ids)` : ""}`);
  console.log(`Config: chunk_size=${SIZE}, overlap_ratio=${OVERLAP} ` +
    `(=${Math.round(SIZE * OVERLAP)} tokens), step=${STEP}`);
  console.log(`Articles:               ${articles}`);
  console.log(`Chunks:                 ${chunks}`);
  console.log(`Avg chunks/article:     ${avg.toFixed(2)}`);
  console.log(`Max chunks/article:     ${maxChunksPerArticle}`);
  console.log(`Max tokens in a chunk:  ${maxTokens} (must be <= ${SIZE})`);
  if (maxTokens > SIZE) {
    console.error("ERROR: a chunk exceeds chunk_size!");
    process.exit(1);
  }
  console.log(`Output: ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
