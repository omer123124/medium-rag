/**
 * Phase 4 validation: run the four example questions end-to-end against a
 * Pinecone namespace and print retrieved chunks + the model's answer.
 * PAID step (1 embedding + 1 chat call per question — small).
 *
 * Usage: npx tsx scripts/query-test.ts [namespace]   (default namespace: subset)
 */
process.loadEnvFile(".env.local");

import { answerQuestion } from "../lib/rag";

const NAMESPACE = process.argv[2] ?? "subset";

const QUESTIONS = [
  "Find an article that reframes marketing as a conversation with readers, aimed at writers who find self-promotion uncomfortable. Provide the title and author.",
  "List exactly 3 articles about education. Return only the titles.",
  "Find an article that argues past pandemics (such as the bubonic plague) can spur innovation and recovery, and summarise its central argument.",
  "I want practical, beginner-friendly advice on building habits that actually stick. Which article would you recommend, and why?",
];

async function main() {
  console.log(`Namespace: "${NAMESPACE}"\n`);
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`\n${"=".repeat(80)}\nQ${i + 1}: ${q}`);
    const r = await answerQuestion(q, { namespace: NAMESPACE });
    console.log(`\nRetrieved (top ${r.context.length}):`);
    for (const c of r.context) {
      console.log(`  [${c.score.toFixed(4)}] ${c.article_id}  ${c.title}`);
    }
    console.log(`\nANSWER:\n${r.response}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
