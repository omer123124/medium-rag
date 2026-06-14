"use client";

import { useEffect, useState } from "react";

type ContextItem = { article_id: string; title: string; chunk: string; score: number };
type PromptResult = {
  response: string;
  context: ContextItem[];
  Augmented_prompt: { System: string; User: string };
};

export default function Home() {
  const [stats, setStats] = useState<{ chunk_size: number; overlap_ratio: number; top_k: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PromptResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      setResult(data as PromptResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={S.h1}>Medium Article RAG Assistant</h1>
          <p style={S.sub}>
            Answers questions <strong>strictly</strong> from a corpus of ~7,600 English Medium
            articles — never from outside knowledge. If the corpus doesn&apos;t contain the answer,
            it says so.
          </p>
          <div style={S.statsRow}>
            {stats ? (
              <>
                <span style={S.pill}>chunk_size: {stats.chunk_size}</span>
                <span style={S.pill}>overlap_ratio: {stats.overlap_ratio}</span>
                <span style={S.pill}>top_k: {stats.top_k}</span>
              </>
            ) : (
              <span style={S.pill}>loading config…</span>
            )}
            <a style={S.link} href="/api/stats" target="_blank" rel="noreferrer">
              /api/stats ↗
            </a>
          </div>
        </header>

        <section>
          <textarea
            style={S.textarea}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the Medium article corpus… e.g. “List exactly 3 articles about education.”"
            rows={3}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(question); }}
          />
          <button style={{ ...S.askBtn, opacity: loading ? 0.6 : 1 }} onClick={() => ask(question)} disabled={loading}>
            {loading ? "Thinking…" : "Ask  (⌘/Ctrl + Enter)"}
          </button>
        </section>

        {error && <div style={S.error}>Error: {error}</div>}

        {result && (
          <section style={{ marginTop: 24 }}>
            <h2 style={S.h2}>Answer</h2>
            <div style={S.answer}>{result.response}</div>

            <h2 style={S.h2}>Retrieved context ({result.context.length})</h2>
            <div>
              {result.context.map((c, i) => (
                <div key={i} style={S.ctx}>
                  <div style={S.ctxHead}>
                    <span style={S.ctxTitle}>{c.title}</span>
                    <span style={S.ctxMeta}>id {c.article_id} · score {c.score.toFixed(3)}</span>
                  </div>
                  <div style={S.ctxChunk}>{c.chunk.slice(0, 320)}{c.chunk.length > 320 ? "…" : ""}</div>
                </div>
              ))}
            </div>

            <button style={S.toggle} onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? "▾" : "▸"} Augmented prompt sent to the model
            </button>
            {showPrompt && (
              <div style={S.promptBox}>
                <div style={S.promptLabel}>System</div>
                <pre style={S.pre}>{result.Augmented_prompt.System}</pre>
                <div style={S.promptLabel}>User</div>
                <pre style={S.pre}>{result.Augmented_prompt.User}</pre>
              </div>
            )}
          </section>
        )}

        <footer style={S.footer}>
          <a style={S.link} href="https://github.com/omer123124/medium-rag" target="_blank" rel="noreferrer">
            GitHub repo ↗
          </a>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ opacity: 0.6 }}>API: POST /api/prompt · GET /api/stats</span>
        </footer>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0b0c10", color: "#e7e9ee", padding: "48px 20px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  wrap: { maxWidth: 760, margin: "0 auto" },
  h1: { fontSize: 30, fontWeight: 700, margin: "0 0 8px" },
  sub: { fontSize: 15, lineHeight: 1.6, color: "#aab0bd", margin: 0 },
  statsRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 },
  pill: { fontSize: 12, fontFamily: "ui-monospace, monospace", background: "#171a21", border: "1px solid #262b36", borderRadius: 6, padding: "4px 8px", color: "#cdd2dc" },
  link: { fontSize: 13, color: "#7aa2ff", textDecoration: "none" },
  textarea: { width: "100%", boxSizing: "border-box", background: "#0f1116", border: "1px solid #2b3140", borderRadius: 8, color: "#e7e9ee", padding: 12, fontSize: 14, resize: "vertical" },
  askBtn: { marginTop: 10, background: "#3b5bff", color: "white", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  error: { marginTop: 16, background: "#2a1416", border: "1px solid #5b2630", color: "#ffb4bd", borderRadius: 8, padding: 12, fontSize: 13, fontFamily: "ui-monospace, monospace" },
  h2: { fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b92a3", margin: "20px 0 10px" },
  answer: { background: "#0f1116", border: "1px solid #262b36", borderRadius: 8, padding: 16, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  ctx: { background: "#0f1116", border: "1px solid #1f242e", borderRadius: 8, padding: 12, marginBottom: 8 },
  ctxHead: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" },
  ctxTitle: { fontSize: 13, fontWeight: 600, color: "#dfe3ea" },
  ctxMeta: { fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#7c8499" },
  ctxChunk: { fontSize: 12, lineHeight: 1.5, color: "#9aa1b1", whiteSpace: "pre-wrap" },
  toggle: { marginTop: 12, background: "transparent", border: "none", color: "#7aa2ff", fontSize: 13, cursor: "pointer", padding: 0 },
  promptBox: { marginTop: 10, background: "#0f1116", border: "1px solid #262b36", borderRadius: 8, padding: 12 },
  promptLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b92a3", margin: "6px 0 4px" },
  pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#c2c8d4", margin: 0 },
  footer: { marginTop: 40, paddingTop: 16, borderTop: "1px solid #1c212b", display: "flex", gap: 10, alignItems: "center", fontSize: 13 },
};
