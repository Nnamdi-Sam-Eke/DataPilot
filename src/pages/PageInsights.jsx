import { useState, useEffect, useRef } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

const SUGGESTIONS = [
  "What are the key patterns in this dataset?",
  "Are there any data quality issues?",
  "What's the best model for this data?",
  "Summarize key statistics",
  "Which columns are most correlated?",
];

function RichText({ text }) {
  return (
    <>{text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
      p.startsWith("**")
        ? <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>
        : p
    )}</>
  );
}

export default function PageInsights() {
  const { sessionId, fileName, columns, rowCount, chatMessages, setChatMessages, groqKey,
    activeSessionExpired,
  } = useDataPilot();

  const greeting = sessionId && !activeSessionExpired
    ? `Hey! I've analyzed your **${fileName}** (${rowCount?.toLocaleString()} rows, ${columns.length} columns). Ask me anything about your data — patterns, correlations, anomalies, or next steps.`
    : activeSessionExpired
      ? "Session expired. Please re-upload your dataset to continue asking questions."
      : "No dataset loaded. Please upload a dataset first, then come back to ask questions.";

  // Use persisted messages if they exist, otherwise start with greeting
  const [messages, setMessages] = useState(chatMessages || [{ role: "ai", text: greeting }]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef(null);

  // Sync local messages → context on every change
  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  // Reset chat when session changes
  useEffect(() => {
    setMessages([{ role: "ai", text: greeting }]);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || !sessionId || activeSessionExpired) return;
    setMessages(m => [...m, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/insights/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(groqKey ? { "x-groq-key": groqKey } : {}),
        },
        body: JSON.stringify({ prompt: msg, session_ids: [sessionId] }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "ai", text: data.error ? `⚠️ ${data.error}` : data.response }]);
    } catch {
      setMessages(m => [...m, { role: "ai", text: "⚠️ Network error — is the backend running?" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter" style={{ minHeight: "calc(100vh - var(--header-h) - 56px)", display: "flex", flexDirection: "column" }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div className="page-title">Ask DataPilot</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {messages.length > 1 && (
              <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 11 }}
                onClick={() => setMessages([{ role: "ai", text: greeting }])}>
                Clear chat
              </button>
            )}
            <span className={`tag ${sessionId && !activeSessionExpired ? "tag-green" : "tag-amber"}`}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: sessionId && !activeSessionExpired ? "var(--green)" : "var(--amber)", animation: "pulse 2s infinite" }} />
              {sessionId && !activeSessionExpired ? "AI Ready" : activeSessionExpired ? "Expired" : "No Dataset"}
            </span>
          </div>
        </div>
        <div className="page-subtitle">Ask natural language questions about your data</div>
      </div>

      <div className="insights-wrap" style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 11, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div className={`chat-avatar ${m.role}`}>{m.role === "ai" ? "✦" : "U"}</div>
                  <div className={`chat-bubble ${m.role}`}>
                    <div style={{ whiteSpace: "pre-line" }}><RichText text={m.text} /></div>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: 11 }}>
                  <div className="chat-avatar ai">✦</div>
                  <div className="chat-bubble ai">
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[0, 0.2, 0.4].map((d, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent2)", animation: `pulse 1.2s ${d}s infinite` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            {sessionId && !activeSessionExpired && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => handleSend(s)}
                    style={{ padding: "5px 10px", borderRadius: 6, background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 11.5, cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif" }}
                    onMouseEnter={e => { e.target.style.borderColor = "rgba(108,99,255,0.4)"; e.target.style.color = "var(--accent2)"; }}
                    onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text2)"; }}
                  >{s}</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input-field"
                placeholder={sessionId && !activeSessionExpired ? "Ask anything about your dataset..." : activeSessionExpired ? "Session expired — re-upload to continue…" : "Upload a dataset first…"}
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                disabled={!sessionId || activeSessionExpired} />
              <button className="btn-primary" onClick={() => handleSend()} disabled={!sessionId || activeSessionExpired || loading} style={{ flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.sparkle} /></svg>
                Ask
              </button>
            </div>
          </div>
        </div>

        <div className="insights-panel" style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="card-title">Active Dataset</div>
            {sessionId && !activeSessionExpired ? (
              <>
                <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, marginBottom: 4 }}>{fileName}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono',monospace" }}>
                  {rowCount?.toLocaleString()} rows · {columns.length} cols
                </div>
              </>
            ) : activeSessionExpired ? (
              <div style={{ fontSize: 11, color: "var(--red)" }}>Session expired — re-upload to continue</div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text3)" }}>No dataset loaded</div>
            )}
          </div>
          {columns.length > 0 && !activeSessionExpired && (
            <div className="card">
              <div className="card-title">Columns</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {columns.map((col, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--text2)", fontFamily: "'DM Mono',monospace", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>{col}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}