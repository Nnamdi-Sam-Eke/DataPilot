// PageInsights.jsx
import { useState, useEffect, useRef, useCallback } from "react";
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
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          p
        )
      )}
    </>
  );
}

// ── Download chat as a formatted HTML report ─────────────────────────────────
function buildChatHTML(messages, fileName, rowCount, columns) {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // Pair up messages into Q&A exchanges — skip the opening greeting (index 0)
  const exchanges = [];
  const rest = messages.slice(1);
  for (let i = 0; i < rest.length; i += 2) {
    const q = rest[i];
    const a = rest[i + 1];
    if (q?.role === "user") {
      exchanges.push({ q: q.text, a: a?.text || "" });
    }
  }

  const sanitize = (t) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
     .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
     .replace(/\n/g, "<br>");

  const qaBlocks = exchanges.map((ex, i) => `
    <div class="qa-block">
      <div class="q-row">
        <span class="q-label">Q${i + 1}</span>
        <span class="q-text">${sanitize(ex.q)}</span>
      </div>
      <div class="a-row">
        <span class="a-label">A</span>
        <div class="a-text">${sanitize(ex.a)}</div>
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DataPilot Insights — ${fileName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; background: #f0f0f8; padding: 40px 20px; color: #333; }
  .container { max-width: 820px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(108,99,255,0.12); }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2b55 60%, #6c63ff 100%); color: white; padding: 40px 48px 36px; position: relative; overflow: hidden; }
  .header::before { content:""; position:absolute; top:-50px; right:-50px; width:180px; height:180px; border-radius:50%; background:rgba(167,139,250,0.1); }
  .header-logo { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
  .header-logo-icon { width:34px; height:34px; background:rgba(255,255,255,0.15); border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:17px; }
  .header-logo-text { font-size:12px; font-weight:600; opacity:0.65; letter-spacing:0.1em; text-transform:uppercase; }
  .header h1 { font-size:26px; font-weight:800; margin-bottom:6px; letter-spacing:-0.02em; }
  .header .meta { font-size:12px; opacity:0.6; }
  .header .badges { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .badge { display:inline-block; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); border-radius:20px; padding:3px 12px; font-size:11px; font-family:monospace; color:rgba(255,255,255,0.85); }
  .body { padding: 36px 48px; }
  .section-label { font-size:11px; font-weight:700; color:#6c63ff; text-transform:uppercase; letter-spacing:0.1em; border-bottom:2px solid #e8e6ff; padding-bottom:8px; margin-bottom:24px; }
  .qa-block { margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid #f0f0f8; }
  .qa-block:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .q-row { display:flex; align-items:baseline; gap:14px; margin-bottom:12px; }
  .q-label { font-size:10px; font-weight:800; color:#6c63ff; text-transform:uppercase; letter-spacing:0.1em; background:#eeecff; border-radius:5px; padding:3px 7px; flex-shrink:0; }
  .q-text { font-size:14px; font-weight:600; color:#1a1a2e; line-height:1.5; }
  .a-row { display:flex; align-items:baseline; gap:14px; }
  .a-label { font-size:10px; font-weight:800; color:#888; text-transform:uppercase; letter-spacing:0.1em; background:#f5f5f5; border-radius:5px; padding:3px 9px; flex-shrink:0; }
  .a-text { font-size:13px; color:#444; line-height:1.8; }
  .footer { background:#f5f3ff; border-top:1px solid #e2e0ff; padding:18px 48px; display:flex; align-items:center; justify-content:space-between; }
  .footer-left { font-size:10.5px; color:#999; }
  .footer-brand { font-size:11.5px; font-weight:700; color:#6c63ff; letter-spacing:0.06em; }
  @media print { body { background:white; padding:0; } .container { box-shadow:none; border-radius:0; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-logo">
      <div class="header-logo-icon">📊</div>
      <div class="header-logo-text">DataPilot · AI Insights</div>
    </div>
    <h1>Analysis Q&amp;A Results</h1>
    <div class="meta">Exported ${date} at ${time}</div>
    <div class="badges">
      <span class="badge">📄 ${fileName}</span>
      ${rowCount ? `<span class="badge">${Number(rowCount).toLocaleString()} rows</span>` : ""}
      ${columns?.length ? `<span class="badge">${columns.length} columns</span>` : ""}
      ${exchanges.length > 0 ? `<span class="badge">${exchanges.length} question${exchanges.length !== 1 ? "s" : ""}</span>` : ""}
    </div>
  </div>
  <div class="body">
    <div class="section-label">Questions &amp; answers</div>
    ${qaBlocks || '<p style="color:#999;font-size:13px">No exchanges to export.</p>'}
  </div>
  <div class="footer">
    <div class="footer-left">Generated by DataPilot · ${date}</div>
    <div class="footer-brand">DATAPILOT</div>
  </div>
</div>
</body>
</html>`;
}

function NextStepBar({ label, to, setPage, note }) {
  return (
    <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 12, background: "var(--bg3)", border: "1px solid var(--border2)" }}>
      {note && <span style={{ fontSize: 12, color: "var(--text3)" }}>{note}</span>}
      <button className="btn-primary" style={{ marginLeft: "auto" }} onClick={() => setPage(to)}>
        {label}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  );
}

export default function PageInsights({ setPage }) {
  const {
    sessionId,
    fileName,
    columns,
    rowCount,
    chatMessages,
    setChatMessages,
    activeSessionExpired,
  } = useDataPilot();

  const greeting =
    sessionId && !activeSessionExpired
      ? `Hey! I've analyzed your **${fileName}** (${rowCount?.toLocaleString()} rows, ${columns.length} columns). Ask me anything about your data — patterns, correlations, anomalies, or next steps.`
      : activeSessionExpired
        ? "Session expired. Please re-upload your dataset to continue asking questions."
        : "No dataset loaded. Please upload a dataset first, then come back to ask questions.";

  // Init from persisted context first — context already survives refresh via datapilot_state
  const [messages, setMessages] = useState(
    chatMessages?.length ? chatMessages : [{ role: "ai", text: greeting }]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  // Track previous sessionId so we only reset when the dataset actually changes
  const prevSessionRef = useRef(sessionId);

  // Sync messages back to context (which persists to localStorage via datapilot_state)
  useEffect(() => {
    setChatMessages(messages);
  }, [messages, setChatMessages]);

  // Only reset when sessionId genuinely switches to a different dataset — NOT on every mount
  useEffect(() => {
    if (prevSessionRef.current === sessionId) return;
    prevSessionRef.current = sessionId;
    // Context will have null chatMessages after a session switch (removeSession/switchSession clears it)
    setMessages([{ role: "ai", text: greeting }]);
  // greeting intentionally omitted — only sessionId/expired switching should trigger a reset
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, activeSessionExpired]);

  const downloadChat = useCallback(() => {
    const html = buildChatHTML(messages, fileName, rowCount, columns);
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `datapilot-chat-${(fileName || "session").replace(/\.[^.]+$/, "")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, fileName, rowCount, columns]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || !sessionId || activeSessionExpired || loading) return;

    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/insights/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: msg,
          session_ids: [sessionId],
        }),
      });

      const data = await res.json();

      setMessages((m) => [
        ...m,
        { role: "ai", text: data.error ? `⚠️ ${data.error}` : data.response },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "ai", text: "⚠️ Network error — is the backend running?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="page-enter"
      style={{
        minHeight: "calc(100vh - var(--header-h) - 56px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 4 }}
        >
          <div className="page-title">Ask DataPilot</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {messages.length > 1 && (
              <>
                <button
                  className="btn-secondary"
                  style={{ padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
                  onClick={downloadChat}
                  title="Download chat as formatted HTML"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: "5px 10px", fontSize: 11 }}
                  onClick={() => setMessages([{ role: "ai", text: greeting }])}
                >
                  Clear chat
                </button>
              </>
            )}
            <span
              className={`tag ${sessionId && !activeSessionExpired ? "tag-green" : "tag-amber"}`}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background:
                    sessionId && !activeSessionExpired
                      ? "var(--green)"
                      : "var(--amber)",
                  animation: "pulse 2s infinite",
                }}
              />
              {sessionId && !activeSessionExpired
                ? "AI Ready"
                : activeSessionExpired
                  ? "Expired"
                  : "No Dataset"}
            </span>
          </div>
        </div>
        <div className="page-subtitle">
          Ask natural language questions about your data
        </div>
      </div>

      <div
        className="insights-wrap"
        style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}
      >
        <div
          className="card"
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          <div ref={messagesRef} style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginBottom: 16, maxHeight: "min(680px, calc(100vh - var(--header-h) - 180px))" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 11,
                    flexDirection: m.role === "user" ? "row-reverse" : "row",
                  }}
                >
                  <div className={`chat-avatar ${m.role}`}>
                    {m.role === "ai" ? "✦" : "U"}
                  </div>
                  <div className={`chat-bubble ${m.role}`}>
                    <div style={{ whiteSpace: "pre-line" }}>
                      <RichText text={m.text} />
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", gap: 11 }}>
                  <div className="chat-avatar ai">✦</div>
                  <div className="chat-bubble ai">
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[0, 0.2, 0.4].map((d, i) => (
                        <div
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--accent2)",
                            animation: `pulse 1.2s ${d}s infinite`,
                          }}
                        />
                      ))}
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
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      background: "var(--bg3)",
                      border: "1px solid var(--border)",
                      color: "var(--text2)",
                      fontSize: 11.5,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.borderColor = "rgba(108,99,255,0.4)";
                      e.target.style.color = "var(--accent2)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.borderColor = "var(--border)";
                      e.target.style.color = "var(--text2)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input-field"
                placeholder={
                  sessionId && !activeSessionExpired
                    ? "Ask anything about your dataset..."
                    : activeSessionExpired
                      ? "Session expired — re-upload to continue…"
                      : "Upload a dataset first…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={!sessionId || activeSessionExpired || loading}
              />
              <button
                className="btn-primary"
                onClick={() => handleSend()}
                disabled={!sessionId || activeSessionExpired || loading}
                style={{ flexShrink: 0 }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={Icons.sparkle} />
                </svg>
                Ask
              </button>
            </div>
          </div>
        </div>

        <div
          className="insights-panel"
          style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="card">
            <div className="card-title">Active Dataset</div>
            {sessionId && !activeSessionExpired ? (
              <>
                <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, marginBottom: 4 }}>
                  {fileName}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono',monospace" }}>
                  {rowCount?.toLocaleString()} rows · {columns.length} cols
                </div>
              </>
            ) : activeSessionExpired ? (
              <div style={{ fontSize: 11, color: "var(--red)" }}>
                Session expired — re-upload to continue
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text3)" }}>No dataset loaded</div>
            )}
          </div>

          {columns.length > 0 && !activeSessionExpired && (
            <div className="card">
              <div className="card-title">Columns</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {columns.map((col, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      color: "var(--text2)",
                      fontFamily: "'DM Mono',monospace",
                      padding: "3px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {col}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <NextStepBar label="Visualize Data" to="/visualization" setPage={setPage} note="Next: generate charts and explore your data visually" />
    </div>
  );
}