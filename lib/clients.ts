/**
 * Shared API clients (OpenAI-compatible LLMod.ai + Pinecone).
 * Reads config from env. In Next.js, .env.local is auto-loaded; in standalone
 * scripts call `process.loadEnvFile(".env.local")` before importing this.
 */
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

/** Read an env var and trim stray whitespace (dashboard copy-paste often adds tabs/spaces). */
function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export const EMBEDDING_MODEL = env("EMBEDDING_MODEL", "4UHRUIN-text-embedding-3-small");
export const CHAT_MODEL = env("CHAT_MODEL", "4UHRUIN-gpt-5-mini");
export const PINECONE_INDEX = env("PINECONE_INDEX", "medium-rag");
/** Default query namespace (production full corpus lives in the default ""). */
export const PINECONE_NAMESPACE = env("PINECONE_NAMESPACE", "");
/** Embedding model dimensionality — must match the Pinecone index. */
export const EMBED_DIM = 1536;

let _openai: OpenAI | null = null;
export function openai(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: env("OPENAI_API_KEY"),
      baseURL: env("OPENAI_BASE_URL"), // e.g. https://api.llmod.ai/v1
    });
  }
  return _openai;
}

let _pc: Pinecone | null = null;
export function pinecone(): Pinecone {
  if (!_pc) _pc = new Pinecone({ apiKey: env("PINECONE_API_KEY") });
  return _pc;
}

export function pineconeIndex() {
  return pinecone().index(PINECONE_INDEX);
}
