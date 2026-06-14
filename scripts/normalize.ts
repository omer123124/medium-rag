/**
 * Phase 2 — normalize the raw CSV into a clean JSONL (free, offline).
 *
 * - De-duplicates exact-text rows (keeps first occurrence).
 * - Parses the Python-list-style `authors` and `tags` strings into arrays.
 * - Assigns a stable, deterministic `article_id`: zero-padded sequential index
 *   (CSV order, after dedup). `url` is kept as the durable natural key so ids can
 *   always be re-derived.
 *
 * Output: data/articles.jsonl (gitignored). One JSON object per line:
 *   { article_id, title, author, authors[], url, timestamp, tags[], text }
 *
 * Run: npx tsx scripts/normalize.ts
 */
import { createReadStream, mkdirSync, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "csv-parse";

const CSV_PATH = "medium-english-50mb.csv";
const OUT_DIR = "data";
const OUT_PATH = `${OUT_DIR}/articles.jsonl`;

type Row = {
  title: string;
  text: string;
  url: string;
  authors: string;
  timestamp: string;
  tags: string;
};

/**
 * Parse a Python-repr list of strings like ['A', "B's"] into ["A", "B's"].
 * Tolerant: matches single- or double-quoted items; returns [] for "[]"/empty.
 */
function parsePyList(raw: string): string[] {
  const s = (raw ?? "").trim();
  if (s === "" || s === "[]") return [];
  const items: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const val = (m[1] ?? m[2] ?? "").replace(/\\(['"])/g, "$1").trim();
    if (val) items.push(val);
  }
  return items;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const out = createWriteStream(OUT_PATH, { encoding: "utf8" });

  const seenText = new Set<string>();
  let rows = 0;
  let kept = 0;
  let droppedDup = 0;
  let emptyAuthors = 0;

  const parser = createReadStream(CSV_PATH).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_quotes: true })
  );

  for await (const rec of parser as AsyncIterable<Row>) {
    rows++;
    const text = rec.text ?? "";
    const h = createHash("sha1").update(text).digest("hex");
    if (seenText.has(h)) {
      droppedDup++;
      continue;
    }
    seenText.add(h);

    const authors = parsePyList(rec.authors);
    const tags = parsePyList(rec.tags);
    if (authors.length === 0) emptyAuthors++;

    const article_id = String(kept).padStart(5, "0");
    const obj = {
      article_id,
      title: (rec.title ?? "").trim(),
      author: authors.join(", ") || "Unknown",
      authors,
      url: (rec.url ?? "").trim(),
      timestamp: (rec.timestamp ?? "").trim(),
      tags,
      text,
    };
    out.write(JSON.stringify(obj) + "\n");
    kept++;

    if (rows % 1000 === 0) process.stderr.write(`  ...processed ${rows} rows\r`);
  }

  await new Promise<void>((resolve) => out.end(resolve));

  console.log("\n=== NORMALIZE ===");
  console.log(`Rows read:        ${rows}`);
  console.log(`Exact-text dups:  ${droppedDup} (dropped)`);
  console.log(`Articles written: ${kept}`);
  console.log(`Articles with empty authors (-> "Unknown"): ${emptyAuthors}`);
  console.log(`Output: ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
