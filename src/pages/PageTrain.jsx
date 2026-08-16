import { useState, useEffect, useRef, forwardRef } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import ProGate from "./ProGate.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { id: "rf",  label: "Random Forest",       desc: "Robust, handles mixed types",     color: "var(--accent2)" },
  { id: "lr",  label: "Logistic Regression", desc: "Fast baseline, interpretable",    color: "var(--cyan)"    },
  { id: "xgb", label: "XGBoost",             desc: "High accuracy, gradient boosting",color: "var(--green)"   },
  { id: "svm", label: "SVM",                 desc: "Effective in high-dimensions",    color: "var(--amber)"   },
];

const MODEL_COLORS = { rf: "var(--accent2)", lr: "var(--cyan)", xgb: "var(--green)", svm: "var(--amber)" };
const MODEL_LABELS = { rf: "Random Forest", lr: "Logistic Reg.", xgb: "XGBoost", svm: "SVM" };

// Inline error banner for request-level failures (validation errors, bad
// input, etc). Distinct from ApiFallback, which is reserved for genuine
// backend-connectivity loss (see App.jsx) — this just shows the server's
// actual message next to the control that caused it, with a retry button.
function InlineErrorNotice({ message, onRetry }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "12px 14px", borderRadius: 10,
      background: "rgba(var(--red), 0.08)",
      border: "1px solid rgba(var(--red), 0.25)",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red, #f87171)"
        strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ flex: 1, fontSize: 12.5, color: "var(--text2, #d1d5db)", lineHeight: 1.5 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            fontSize: 11, fontWeight: 600, color: "var(--accent, #6366f1)",
            background: "none", border: "none", cursor: "pointer",
            padding: "2px 4px", flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMetric(key, val) {
  if (typeof val !== "number") return val;
  if (["rmse", "mae", "mse"].includes(key)) return val.toFixed(3);
  if (key === "r2") return val.toFixed(3);
  if (val <= 1 && val >= 0) return (val * 100).toFixed(1) + "%";
  return val.toFixed(3);
}

function primaryMetric(m) {
  if (!m) return null;
  const { metrics, task } = m;
  if (!metrics) return null;
  return task === "classification"
    ? { key: "accuracy", val: metrics.accuracy }
    : { key: "R²", val: metrics.r2 };
}

function bestModelId(trainedModels) {
  if (!trainedModels?.length) return null;
  return trainedModels.reduce((best, m) => {
    const pm = primaryMetric(m);
    const pb = primaryMetric(best);
    if (!pb) return m;
    if (!pm) return best;
    return pm.val > pb.val ? m : best;
  }, trainedModels[0])?.model_id;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NextStepBar({ label, to, setPage, note }) {
  return (
    <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 12, background: "var(--bg3)", border: "1px solid var(--border2)" }}>
      {note && <span style={{ fontSize: 12, color: "var(--text3)" }}>{note}</span>}
      <button className="btn-primary" style={{ marginLeft: "auto" }} onClick={() => setPage(to)}>
        {label}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

// Compact metric badge
function MetricBadge({ value, task }) {
  if (value == null) return null;
  const display = task === "classification"
    ? (value * 100).toFixed(1) + "%"
    : value.toFixed(3);
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, color: "var(--green)", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "2px 7px" }}>
      {display}
    </span>
  );
}

// Comparison table shown when ≥2 models trained
function ComparisonTable({ trainedModels, activeModelId, onSelect, onDelete }) {
  const best = bestModelId(trainedModels);
  const task = trainedModels[0]?.task;
  const isClass = task === "classification";

  const metricKeys = isClass
    ? ["accuracy", "f1", "precision", "recall"]
    : ["rmse", "mae", "r2"];

  // Find best value per metric column (for highlighting)
  const bestPerMetric = {};
  metricKeys.forEach(k => {
    const vals = trainedModels.map(m => m.metrics?.[k]).filter(v => v != null);
    if (!vals.length) return;
    bestPerMetric[k] = k === "rmse" || k === "mae"
      ? Math.min(...vals)
      : Math.max(...vals);
  });

  return (
    <div className="card fade-up" style={{ marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 12 }}>
        Model Comparison
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
          {trainedModels.length} model{trainedModels.length > 1 ? "s" : ""} · {task}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>Model</th>
              {metricKeys.map(k => (
                <th key={k} style={{ textAlign: "right", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>{k}</th>
              ))}
              <th style={{ textAlign: "center", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>Active</th>
              <th style={{ borderBottom: "1px solid var(--border)", width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {trainedModels.map((m, i) => {
              const isBest = m.model_id === best;
              const isActive = m.model_id === activeModelId;
              const color = MODEL_COLORS[m.model_type] || "var(--accent2)";
              return (
                <tr key={m.model_id} style={{ background: isActive ? "rgba(108,99,255,0.06)" : "transparent", transition: "background 0.15s" }}>
                  <td style={{ padding: "8px 10px", borderBottom: i < trainedModels.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, color: "var(--text)" }}>{MODEL_LABELS[m.model_type] || m.model_type}</span>
                      {isBest && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--green)", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Best</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginTop: 2, paddingLeft: 16 }}>
                      {m.train_size?.toLocaleString()} train · {m.test_size?.toLocaleString()} test
                    </div>
                  </td>
                  {metricKeys.map(k => {
                    const val = m.metrics?.[k];
                    const isBestCell = val != null && val === bestPerMetric[k];
                    return (
                      <td key={k} style={{ textAlign: "right", padding: "8px 10px", fontFamily: "'DM Mono', monospace", fontSize: 12, borderBottom: i < trainedModels.length - 1 ? "1px solid var(--border)" : "none", color: isBestCell ? "var(--green)" : "var(--text2)", fontWeight: isBestCell ? 600 : 400 }}>
                        {val != null ? fmtMetric(k, val) : "—"}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", padding: "8px 10px", borderBottom: i < trainedModels.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <button
                      onClick={() => onSelect(m)}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${isActive ? "rgba(108,99,255,0.4)" : "var(--border2)"}`, background: isActive ? "var(--accent-dim)" : "var(--bg3)", color: isActive ? "var(--accent2)" : "var(--text3)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
                    >
                      {isActive ? "Active" : "Use"}
                    </button>
                  </td>
                  <td style={{ padding: "8px 6px", borderBottom: i < trainedModels.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <button
                      onClick={() => onDelete(m.model_id)}
                      title="Remove model"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 5, border: "1px solid transparent", background: "transparent", color: "var(--text3)", cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.08)"; e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text3)"; e.currentTarget.style.borderColor = "transparent"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Horizontal mini metric bar for comparison sparkline
function MiniBar({ val, max, color }) {
  const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0;
  return (
    <div style={{ flex: 1, height: 4, background: "var(--bg3)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
}

// Full result panel for a single model
function ModelResultPanel({ result, isActive, onSetActive, showDownloadTip, isPro }) {
  const metrics = result?.metrics || {};
  const isClass = result?.task === "classification";
  const color = MODEL_COLORS[result?.model_type] || "var(--accent2)";
  const pm = primaryMetric(result);
  const modelTTL = isPro ? 60 : 10;

  return (
    <div className="card fade-up" style={{ border: isActive ? "1px solid rgba(108,99,255,0.35)" : "1px solid var(--border2)", transition: "border-color 0.2s" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <div className="card-title" style={{ margin: 0, flex: 1 }}>
          {MODEL_LABELS[result?.model_type] || result?.model_type}
        </div>
        <span className="tag tag-cyan">{result?.task}</span>
        {isActive
          ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 5, padding: "2px 7px" }}>Active for Predictions</span>
              <span style={{
                fontSize: 10,
                color: "var(--amber)",
                fontFamily: "'DM Mono', monospace"
              }}>Temporary session model (auto-clears)</span>
            </div>
          ) : (
            <button
              onClick={() => onSetActive(result)}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border2)", background: "var(--bg3)", color: "var(--text2)", cursor: "pointer", fontWeight: 500, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(108,99,255,0.4)"; e.currentTarget.style.color = "var(--accent2)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text2)"; }}
            >
              Set Active
            </button>
          )
        }
      </div>

      {/* Metrics grid */}
      <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
        {Object.entries(metrics).map(([key, val]) => (
          <div key={key} className="stat-block" style={{ textAlign: "center" }}>
            <div className="stat-label">{key.toUpperCase()}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--green)" }}>
              {fmtMetric(key, val)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
        Trained on {result?.train_size?.toLocaleString()} rows · Tested on {result?.test_size?.toLocaleString()} rows
      </div>

      {/* Download — Pro only */}
      {isPro ? (
        <a
          href={`${API_BASE}/train/download/${result?.model_id}`}
          download
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 14px", borderRadius: 8, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 12, fontWeight: 500, textDecoration: "none", transition: "all 0.15s", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(108,99,255,0.4)"; e.currentTarget.style.color = "var(--accent2)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text2)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Download .pkl
        </a>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderRadius: 8, background: "var(--bg3)", border: "1px solid var(--border2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text3)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download .pkl
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 4, padding: "2px 7px" }}>PRO</span>
        </div>
      )}

      {/* TTL warning */}
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, textAlign: "center" }}>
        ⚠️ This model lives in memory for {modelTTL} minutes.{isPro ? " It's also saved to your cloud workspace." : " Upgrade to Pro to persist models across sessions."}
      </div>

      {/* Tip shown briefly after training completes */}
      {showDownloadTip && (
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, textAlign: "center" }}>
          💡 Tip: Download your model to keep it permanently.
        </div>
      )}
    </div>
  );
}

// ── Lightweight SVG forecast chart (no extra deps) ────────────────────────────
const ForecastChart = forwardRef(function ForecastChart({ history = [], forecast = [] }, ref) {
  if (!history.length && !forecast.length) return null;

  const allValues = [
    ...history.map(p => p.value),
    ...forecast.flatMap(p => [p.value, p.lower, p.upper]),
  ].filter(v => typeof v === "number" && isFinite(v));

  if (!allValues.length) return null;

  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;
  const pad = range * 0.08;

  const W = 640;
  const H = 260;
  const m = { t: 18, r: 16, b: 36, l: 52 };
  const plotW = W - m.l - m.r;
  const plotH = H - m.t - m.b;

  const totalPts = history.length + forecast.length;
  const xAt = (i) => m.l + (totalPts <= 1 ? plotW / 2 : (i / (totalPts - 1)) * plotW);
  const yAt = (v) => m.t + plotH - ((v - (minV - pad)) / (range + 2 * pad)) * plotH;

  const histPath = history.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.value)}`).join(" ");
  const fcStart = history.length;
  const fcPath = forecast.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(fcStart + i)} ${yAt(p.value)}`).join(" ");

  // Confidence band polygon
  let band = "";
  if (forecast.length) {
    const upper = forecast.map((p, i) => `${xAt(fcStart + i)} ${yAt(p.upper)}`).join(" ");
    const lower = [...forecast].reverse().map((p, i) => {
      const idx = forecast.length - 1 - i;
      return `${xAt(fcStart + idx)} ${yAt(p.lower)}`;
    }).join(" ");
    band = `M ${upper} L ${lower} Z`;
  }

  // Date labels (sparse). Selecting every Nth index can land the forced
  // final label (i === totalPts - 1) just 1-2 indices after the last
  // "regular" one — a few pixels apart while the date text needs ~60-70px,
  // which is exactly what produced the overlapping labels at the right
  // edge on dense series (e.g. weekly frequency, long horizon). Filter by
  // actual pixel spacing after selection, always keeping the final label
  // and dropping its too-close neighbor instead.
  const labelEvery = Math.max(1, Math.floor(totalPts / 6));
  const rawLabels = [];
  [...history, ...forecast].forEach((p, i) => {
    if (i % labelEvery === 0 || i === totalPts - 1) {
      rawLabels.push({ x: xAt(i), text: (p.date || "").slice(0, 10) });
    }
  });
  const MIN_LABEL_GAP_PX = 46;
  const labels = [];
  rawLabels.forEach((label, k) => {
    const isLast = k === rawLabels.length - 1;
    const prev = labels[labels.length - 1];
    if (prev && label.x - prev.x < MIN_LABEL_GAP_PX) {
      if (isLast) labels.pop();
      else return;
    }
    labels.push(label);
  });

  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", fontFamily: "'DM Mono', monospace" }}>
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map(t => {
          const y = m.t + plotH * (1 - t);
          const val = minV - pad + (range + 2 * pad) * t;
          return (
            <g key={t}>
              <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={m.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{val.toFixed(val >= 100 ? 0 : 1)}</text>
            </g>
          );
        })}

        {/* confidence band */}
        {band && <path d={band} fill="rgba(108,99,255,0.12)" stroke="none" />}

        {/* history line */}
        {histPath && <path d={histPath} fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

        {/* forecast line */}
        {fcPath && <path d={fcPath} fill="none" stroke="var(--accent2)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="0" />}

        {/* vertical divider at forecast start */}
        {history.length > 0 && forecast.length > 0 && (
          <line
            x1={xAt(history.length - 0.5)}
            y1={m.t}
            x2={xAt(history.length - 0.5)}
            y2={m.t + plotH}
            stroke="var(--border2)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        )}

        {/* x labels */}
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--text3)">{l.text}</text>
        ))}

        {/* legend */}
        <g transform={`translate(${m.l}, ${m.t - 4})`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke="var(--text2)" strokeWidth="2" />
          <text x="18" y="3" fontSize="10" fill="var(--text3)">History</text>
          <line x1="80" y1="0" x2="94" y2="0" stroke="var(--accent2)" strokeWidth="2.5" />
          <text x="98" y="3" fontSize="10" fill="var(--text3)">Forecast</text>
          <rect x="160" y="-5" width="12" height="10" fill="rgba(108,99,255,0.18)" />
          <text x="176" y="3" fontSize="10" fill="var(--text3)">95% band</text>
        </g>
      </svg>
    </div>
  );
});

// Builds a CSV of history + forecast rows and triggers a browser download.
// Kept as a plain function (not tied to any component) so it can be called
// from both the compact card header and the expanded lightbox.
function downloadForecastCSV(forecastResult) {
  if (!forecastResult) return;
  const { history = [], forecast = [], date_column, target_column } = forecastResult;

  const dateLabel = date_column || "date";
  const valueLabel = target_column || "value";
  const rows = [["type", dateLabel, valueLabel, "lower", "upper"]];

  history.forEach(p => {
    rows.push(["history", (p.date || "").slice(0, 10), p.value ?? "", "", ""]);
  });
  forecast.forEach(p => {
    rows.push(["forecast", (p.date || "").slice(0, 10), p.value ?? "", p.lower ?? "", p.upper ?? ""]);
  });

  const csv = rows
    .map(r => r.map(cell => {
      const s = String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `forecast_${valueLabel}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Rasterizes a live <svg> DOM node to a PNG data URL at `scale`x its own
// pixel size, for embedding in the PDF. The chart is plain inline SVG (no
// canvas already backing it), so this is the simplest reliable path —
// serialize -> blob -> Image -> canvas -> dataURL — without pulling in a
// full DOM-to-canvas library just for one chart.
function svgNodeToPngDataUrl(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    if (!svgEl) { reject(new Error("Chart not ready")); return; }
    const [, , vbW, vbH] = (svgEl.getAttribute("viewBox") || "0 0 640 260").split(" ").map(Number);
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("width", vbW);
    clone.setAttribute("height", vbH);
    // Inline the CSS custom properties the chart relies on (var(--text2) etc)
    // — a cloned SVG serialized outside the DOM tree loses access to the
    // page's CSS custom properties, so bake in computed values first.
    const computed = getComputedStyle(document.documentElement);
    const cssVarNames = [
      "--border", "--text3", "--text2", "--accent2", "--border2",
    ];
    let styleOverrides = ":root{";
    cssVarNames.forEach(name => {
      const val = computed.getPropertyValue(name).trim();
      if (val) styleOverrides += `${name}:${val};`;
    });
    styleOverrides += "}";
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = styleOverrides;
    clone.insertBefore(styleEl, clone.firstChild);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = vbW * scale;
      canvas.height = vbH * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#111214"; // matches --bg2, so the PNG isn't transparent-black in the PDF
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: vbW, height: vbH });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not render chart image")); };
    img.src = url;
  });
}

// Builds a one-page-plus-table PDF: title/meta, the rasterized chart, the
// caveats/notes list, then a paginated forecast-values table. jspdf is
// dynamically imported so it's only pulled into the bundle when someone
// actually exports, not on every page load.
async function downloadForecastPDF(forecastResult, svgEl) {
  if (!forecastResult) return;
  const { jsPDF } = await import("jspdf");
  const { history = [], forecast = [], notes = [], date_column, target_column, frequency, method } = forecastResult;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 48;

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Forecast Report", marginX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  const metaLine = `${target_column || "value"} over ${date_column || "date"}  ·  ` +
    `${method === "holt_winters_seasonal" ? "Seasonal" : "Trend only"}  ·  ` +
    `frequency: ${frequency || "—"}  ·  generated ${new Date().toLocaleDateString()}`;
  doc.text(metaLine, marginX, y);
  y += 22;
  doc.setTextColor(0);

  // ── Chart image ──
  try {
    const { dataUrl, width, height } = await svgNodeToPngDataUrl(svgEl, 2);
    const imgW = pageW - marginX * 2;
    const imgH = imgW * (height / width);
    doc.addImage(dataUrl, "PNG", marginX, y, imgW, imgH);
    y += imgH + 20;
  } catch {
    doc.setFontSize(10);
    doc.setTextColor(180, 60, 60);
    doc.text("(chart preview unavailable)", marginX, y);
    doc.setTextColor(0);
    y += 20;
  }

  // ── Notes ──
  if (notes.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notes", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const usableW = pageW - marginX * 2 - 14;
    notes.forEach(note => {
      const lines = doc.splitTextToSize(`•  ${note}`, usableW);
      lines.forEach(line => {
        if (y > pageH - 50) { doc.addPage(); y = 48; }
        doc.text(line, marginX, y);
        y += 13;
      });
      y += 3;
    });
    y += 10;
  }

  // ── Forecast values table ──
  if (forecast.length) {
    if (y > pageH - 120) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Forecast values", marginX, y);
    y += 18;

    const cols = [
      { label: "Date", x: marginX, w: 100, align: "left" },
      { label: "Point", x: marginX + 110, w: 90, align: "right" },
      { label: "Lower", x: marginX + 210, w: 90, align: "right" },
      { label: "Upper", x: marginX + 310, w: 90, align: "right" },
    ];
    const rowH = 15;

    const drawTableHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(110);
      cols.forEach(c => doc.text(c.label, c.align === "right" ? c.x + c.w : c.x, y, { align: c.align }));
      y += 6;
      doc.setDrawColor(210);
      doc.line(marginX, y, marginX + 400, y);
      y += 12;
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    };

    drawTableHeader();
    forecast.forEach(p => {
      if (y > pageH - 40) {
        doc.addPage();
        y = 48;
        drawTableHeader();
      }
      const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : "—");
      doc.text((p.date || "").slice(0, 10), cols[0].x, y);
      doc.text(fmt(p.value), cols[1].x + cols[1].w, y, { align: "right" });
      doc.text(fmt(p.lower), cols[2].x + cols[2].w, y, { align: "right" });
      doc.text(fmt(p.upper), cols[3].x + cols[3].w, y, { align: "right" });
      y += rowH;
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`forecast_${target_column || "value"}_${stamp}.pdf`);
}

// Full-screen preview for the forecast chart — same click-to-close backdrop
// pattern as PageVisualization.jsx's Lightbox, sized for a much bigger
// ForecastChart render plus the same CSV export.
function ForecastLightbox({ forecastResult, onClose, chartRef }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 980, maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -36, right: 0, background: "none", border: "none", color: "white", fontSize: 28, cursor: "pointer", lineHeight: 1 }}>×</button>

        <div style={{ background: "var(--bg2, #111214)", borderRadius: 14, padding: 24, border: "1px solid var(--border-bright, rgba(255,255,255,0.08))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", flex: 1 }}>Forecast preview</div>
            <span className="tag tag-cyan" style={{ textTransform: "none" }}>
              {forecastResult.method === "holt_winters_seasonal" ? "Seasonal" : "Trend only"}
            </span>
            <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
              {forecastResult.frequency} · h={forecastResult.horizon}
            </span>
          </div>

          <ForecastChart ref={chartRef} history={forecastResult.history || []} forecast={forecastResult.forecast || []} />

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => downloadForecastCSV(forecastResult)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(108,99,255,0.8)", color: "white", borderRadius: 7, fontSize: 12, border: "none", cursor: "pointer" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
              Download CSV
            </button>
            <button
              onClick={() => downloadForecastPDF(forecastResult, chartRef.current?.querySelector("svg"))}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12, cursor: "pointer" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.file} /></svg>
              Download PDF report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PageTrain({ setPage }) {
  const {
    sessionId, columns, activeSessionExpired,
    modelId, setModelId,
    modelMeta, setModelMeta,
    trainResults, setTrainResults,
    trainedModels, setTrainedModels,
    trainConfig, setTrainConfig,
    userProfile, user,
  } = useDataPilot();

  const plan  = (userProfile?.plan || "free").toLowerCase();
  const isPro = plan === "pro";

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("ml"); // "ml" | "forecast"

  // ── Supervised ML state ──────────────────────────────────────────────────
  const [training, setTraining] = useState(false);
  const [error, setError] = useState("");
  const [planLimitHit, setPlanLimitHit] = useState(false);
  const [detailModelId, setDetailModelId] = useState(null);
  const [showDownloadTip, setShowDownloadTip] = useState(false);
  const tipTimerRef = useRef(null);

  const selectedModel = trainConfig.selectedModel;
  const targetCol     = trainConfig.targetCol;
  const testSize      = trainConfig.testSize;
  const set = (key, val) => setTrainConfig({ ...trainConfig, [key]: val });

  const displayResult = detailModelId
    ? (trainedModels.find(m => m.model_id === detailModelId) || trainResults)
    : trainResults;

  // ── Forecast state ───────────────────────────────────────────────────────
  const [fcDateCol, setFcDateCol] = useState("");
  const [fcTargetCol, setFcTargetCol] = useState("");
  const [fcHorizon, setFcHorizon] = useState(12);
  const [fcFrequency, setFcFrequency] = useState(""); // "" = auto-detect
  const [forecasting, setForecasting] = useState(false);
  const [forecastResult, setForecastResult] = useState(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastPlanGate, setForecastPlanGate] = useState(false);
  const [forecastExpanded, setForecastExpanded] = useState(false);
  const forecastCardChartRef = useRef(null);
  const forecastLightboxChartRef = useRef(null);
  // True once fcDateCol and fcTargetCol are the same column — a forecast
  // needs two distinct columns; catching this in the UI gives a clear
  // inline message instead of a confusing backend validation error.
  const fcSameColumn = !!fcDateCol && fcDateCol === fcTargetCol;

  // ── Train (supervised) ───────────────────────────────────────────────────
  const startTrain = async () => {
    if (!sessionId || !targetCol || activeSessionExpired) return;
    setTraining(true);
    setError("");
    setPlanLimitHit(false);

    try {
      const headers = { "Content-Type": "application/json" };
      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const res = await fetch(`${API_BASE}/train/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ session_id: sessionId, target_column: targetCol, model_type: selectedModel, test_size: testSize, plan }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setPlanLimitHit(true);
        return;
      }

      if (!res.ok) throw new Error(data.detail || "Training failed");

      const entry = {
        model_id:         data.model_id,
        model_type:       data.model_type,
        task:             data.task,
        metrics:          data.metrics,
        confusion_matrix: data.confusion_matrix,
        feature_importance: data.feature_importance,
        train_size:       data.train_size,
        test_size:        data.test_size,
        target_column:    targetCol,
      };

      setTrainedModels(prev => {
        const idx = prev.findIndex(m => m.model_type === data.model_type);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = entry;
          return updated;
        }
        return [...prev, entry];
      });

      setModelId(data.model_id);
      setModelMeta({ type: data.model_type, task: data.task, metrics: data.metrics, featureImportance: data.feature_importance });
      setTrainResults(entry);
      setDetailModelId(data.model_id);

      setShowDownloadTip(true);
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
      tipTimerRef.current = setTimeout(() => setShowDownloadTip(false), 8000);

    } catch (e) {
      setError(e.message || "Training failed");
    } finally {
      setTraining(false);
    }
  };

  useEffect(() => {
    return () => { if (tipTimerRef.current) clearTimeout(tipTimerRef.current); };
  }, []);

  // ── Forecast runner ──────────────────────────────────────────────────────
  const startForecast = async () => {
    if (!sessionId || !fcDateCol || !fcTargetCol || fcSameColumn || activeSessionExpired) return;
    setForecasting(true);
    setForecastError("");
    setForecastPlanGate(false);
    setForecastResult(null);

    try {
      const headers = { "Content-Type": "application/json" };
      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const res = await fetch(`${API_BASE}/forecast/${sessionId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          date_column: fcDateCol,
          target_column: fcTargetCol,
          horizon: fcHorizon,
          frequency: fcFrequency || undefined,
        }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setForecastPlanGate(true);
        return;
      }

      if (!res.ok) throw new Error(data.detail || "Forecast failed");

      setForecastResult(data);
    } catch (e) {
      setForecastError(e.message || "Forecast failed");
    } finally {
      setForecasting(false);
    }
  };

  // ── Set active model for predictions ───────────────────────────────────
  const handleSetActive = (m) => {
    setModelId(m.model_id);
    setModelMeta({ type: m.model_type, task: m.task, metrics: m.metrics, featureImportance: m.feature_importance });
    setTrainResults(m);
    setDetailModelId(m.model_id);
  };

  // ── Delete a trained model from the list ───────────────────────────────
  const handleDelete = (modelIdToRemove) => {
    setPlanLimitHit(false);
    setTrainedModels(prev => {
      const remaining = prev.filter(m => m.model_id !== modelIdToRemove);

      if (modelIdToRemove === modelId) {
        if (remaining.length > 0) {
          const fallback = remaining[remaining.length - 1];
          setModelId(fallback.model_id);
          setModelMeta({ type: fallback.model_type, task: fallback.task, metrics: fallback.metrics, featureImportance: fallback.feature_importance });
          setTrainResults(fallback);
          setDetailModelId(fallback.model_id);
        } else {
          setModelId(null);
          setModelMeta(null);
          setTrainResults(null);
          setDetailModelId(null);
        }
      } else if (modelIdToRemove === detailModelId) {
        setDetailModelId(modelId);
      }

      return remaining;
    });
  };

  // ── Empty / expired states ─────────────────────────────────────────────
  if (!sessionId || activeSessionExpired) return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Train Model</div>
        <div className="page-subtitle">{activeSessionExpired ? "Session expired — re-upload your dataset to continue" : "Upload a dataset first to train a model"}</div>
      </div>
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>{activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}</div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>{activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "No dataset loaded. Please upload a file first."}</div>
      </div>
    </div>
  );

  const hasModels = trainedModels.length > 0;
  const hasComparison = trainedModels.length >= 2;
  const trainedTypes = new Set(trainedModels.map(m => m.model_type));
  const activeEntry = trainedModels.find(m => m.model_id === modelId);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Train Model</div>
        <div className="page-subtitle">
          {activeTab === "ml"
            ? (hasModels
                ? `${trainedModels.length} model${trainedModels.length > 1 ? "s" : ""} trained · ${activeEntry ? `${MODEL_LABELS[activeEntry.model_type]} active for predictions` : "select an active model below"}`
                : "Configure and train machine learning models on your dataset")
            : "Forecast future values from a column's own history (Holt-Winters)"}
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          { id: "ml", label: "Supervised ML" },
          { id: "forecast", label: "Time-Series Forecast", pro: true },
        ].map(t => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid ${active ? "rgba(108,99,255,0.4)" : "var(--border)"}`,
                background: active ? "var(--accent-dim)" : "var(--bg3)",
                color: active ? "var(--accent2)" : "var(--text2)",
                fontSize: 13, fontWeight: active ? 600 : 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {t.label}
              {t.pro && (
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>PRO</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════ SUPERVISED ML TAB ═══════════════════════ */}
      {activeTab === "ml" && (
        <>
          <div className="grid-2 train-layout" style={{ alignItems: "start" }}>

            {/* ── Left: config ───────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="card">
                <div className="card-title">Configuration</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Target column */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Target Column</div>
                    <select className="input-field" value={targetCol} onChange={e => set("targetCol", e.target.value)} style={{ cursor: "pointer" }}>
                      <option value="">— Select target —</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Test split */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Test Split: {Math.round(testSize * 100)}%</div>
                    <input type="range" min="0.1" max="0.4" step="0.05" value={testSize} onChange={e => set("testSize", parseFloat(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
                  </div>

                  {/* Algorithm picker */}
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Algorithm</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {MODEL_OPTIONS.map(m => {
                        const trained   = trainedTypes.has(m.id);
                        const isSelected = selectedModel === m.id;
                        const isProOnly  = ["xgb", "svm"].includes(m.id);
                        const locked     = isProOnly && !isPro;
                        const thisEntry  = trainedModels.find(tm => tm.model_type === m.id);
                        const pm = primaryMetric(thisEntry);
                        return (
                          <div
                            key={m.id}
                            onClick={() => !locked && set("selectedModel", m.id)}
                            title={locked ? "Upgrade to Pro to unlock this algorithm" : undefined}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 12px", borderRadius: 8,
                              background: locked ? "var(--bg3)" : isSelected ? "var(--accent-dim)" : "var(--bg3)",
                              border: `1px solid ${locked ? "var(--border)" : isSelected ? "rgba(108,99,255,0.3)" : "var(--border)"}`,
                              cursor: locked ? "not-allowed" : "pointer",
                              opacity: locked ? 0.55 : 1,
                              transition: "all 0.15s",
                            }}
                          >
                            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${locked ? "var(--text3)" : isSelected ? "var(--accent2)" : "var(--text3)"}`, background: !locked && isSelected ? "var(--accent)" : "transparent", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                                {m.label}
                                {locked && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>PRO</span>
                                )}
                                {!locked && trained && (
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0, display: "inline-block" }} title="Already trained" />
                                )}
                              </div>
                              <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 1 }}>
                                {locked ? "Pro plan required" : m.desc}
                              </div>
                            </div>
                            {!locked && trained && pm && (
                              <MetricBadge value={pm.val} task={thisEntry?.task} />
                            )}
                            {!locked && trained && isSelected && (
                              <span style={{ fontSize: 9, color: "var(--amber)", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>retrain</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {planLimitHit && !isPro && (
                <ProGate
                  compact
                  icon="🤖"
                  feature="1 model per session on Free"
                  description="Delete your current model to retrain, or upgrade to Pro to train and compare all 4 algorithms side by side."
                  onUpgrade={() => setPage("/settings", { state: { highlightSection: "manage-subscription" } })}
                />
              )}

              {error && (
                <InlineErrorNotice message={error} onRetry={startTrain} />
              )}

              <button className="btn-primary" style={{ justifyContent: "center" }} onClick={startTrain} disabled={training || !targetCol}>
                {training
                  ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Training…</>
                  : <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.cpu} /></svg>
                      {trainedTypes.has(selectedModel) ? `Retrain ${MODEL_LABELS[selectedModel]}` : `Train ${MODEL_LABELS[selectedModel] || "Model"}`}
                    </>
                }
              </button>

              {hasModels && trainedModels.length < MODEL_OPTIONS.length && (
                <div style={{ padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text3)" }}>
                  💡 Train the remaining {MODEL_OPTIONS.length - trainedModels.length} algorithm{MODEL_OPTIONS.length - trainedModels.length > 1 ? "s" : ""} to unlock the full comparison view
                </div>
              )}
            </div>

            {/* ── Right: results ──────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {hasComparison && (
                <ComparisonTable
                  trainedModels={trainedModels}
                  activeModelId={modelId}
                  onSelect={handleSetActive}
                  onDelete={handleDelete}
                />
              )}

              {displayResult ? (
                <>
                  <ModelResultPanel
                    result={displayResult}
                    isActive={displayResult.model_id === modelId}
                    onSetActive={handleSetActive}
                    showDownloadTip={showDownloadTip}
                    isPro={isPro}
                  />

                  {displayResult.feature_importance?.length > 0 && (
                    <div className="card fade-up fade-up-1">
                      <div className="card-title">Feature Importance</div>
                      {displayResult.feature_importance.map((f, i) => (
                        <div key={i} className="fi-row">
                          <div className="fi-label">{f.feature}</div>
                          <div className="fi-track">
                            <div className="fi-fill" style={{ width: `${(f.importance / displayResult.feature_importance[0].importance) * 100}%`, background: MODEL_COLORS[displayResult.model_type] || "var(--accent2)" }} />
                          </div>
                          <div className="fi-val">{f.importance.toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {displayResult.confusion_matrix?.length > 0 && (
                    <div className="card fade-up fade-up-2">
                      <div className="card-title">Confusion Matrix</div>
                      <div style={{ overflowX: "auto" }}>
                        {displayResult.confusion_matrix.map((row, ri) => (
                          <div key={ri} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                            {row.map((v, ci) => {
                              const maxVal = Math.max(...displayResult.confusion_matrix.flat());
                              return (
                                <div key={ci} style={{ flex: 1, padding: "10px 4px", borderRadius: 5, textAlign: "center", background: ri === ci ? `rgba(52,211,153,${0.15 + (v / maxVal) * 0.6})` : `rgba(248,113,113,${0.05 + (v / maxVal) * 0.3})`, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, color: ri === ci ? "var(--green)" : "var(--text3)" }}>
                                  {v}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasModels && trainedModels.length > 1 && (
                    <div className="card" style={{ padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>View details for</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {trainedModels.map(m => {
                          const isViewing = (detailModelId || trainResults?.model_id) === m.model_id;
                          const color = MODEL_COLORS[m.model_type] || "var(--accent2)";
                          return (
                            <button
                              key={m.model_id}
                              onClick={() => setDetailModelId(m.model_id)}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, border: `1px solid ${isViewing ? color.replace("var(--", "rgba(").replace(")", ", 0.4)") : "var(--border)"}`, background: isViewing ? "var(--bg3)" : "transparent", color: isViewing ? "var(--text)" : "var(--text3)", fontSize: 11, fontWeight: isViewing ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}
                            >
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                              {MODEL_LABELS[m.model_type]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.cpu} /></svg>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text2)", textAlign: "center" }}>
                    Configure and train a model<br />to see performance results
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                    Train up to 4 algorithms and compare them side by side
                  </div>
                </div>
              )}
            </div>
          </div>

          <NextStepBar
            label={activeEntry?.task === "regression" ? "Predict Values" : "Run Predictions"}
            to="/predictions"
            setPage={setPage}
            note={
              modelId
                ? activeEntry?.task === "regression"
                  ? `Active model: ${MODEL_LABELS[activeEntry?.model_type] || "—"} · predicts numeric values`
                  : `Active model: ${MODEL_LABELS[activeEntry?.model_type] || "—"} · switch anytime from the comparison table`
                : "Train a model first to run predictions"
            }
          />
        </>
      )}

      {/* ═══════════════════════ FORECAST TAB ══════════════════════════════ */}
      {activeTab === "forecast" && (
        <div className="grid-2 train-layout" style={{ alignItems: "start" }}>

          {/* Left: config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <div className="card-title">Forecast Configuration</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Date / Period Column</div>
                  <select className="input-field" value={fcDateCol} onChange={e => setFcDateCol(e.target.value)} style={{ cursor: "pointer" }}>
                    <option value="">— Select date column —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                    Needs roughly regular intervals (daily, weekly, monthly…).
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Target Column (numeric)</div>
                  <select className="input-field" value={fcTargetCol} onChange={e => setFcTargetCol(e.target.value)} style={{ cursor: "pointer" }}>
                    <option value="">— Select target —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                    Univariate only — forecasts this column from its own history.
                  </div>
                  {fcSameColumn && (
                    <div style={{ fontSize: 11, color: "var(--red)", marginTop: 5 }}>
                      Date and target must be different columns.
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Horizon: {fcHorizon} period{fcHorizon !== 1 ? "s" : ""}
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="60"
                    step="1"
                    value={fcHorizon}
                    onChange={e => setFcHorizon(parseInt(e.target.value, 10))}
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                    <span>1</span>
                    <span>12</span>
                    <span>24</span>
                    <span>60</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Frequency</div>
                  <select className="input-field" value={fcFrequency} onChange={e => setFcFrequency(e.target.value)} style={{ cursor: "pointer" }}>
                    <option value="">Auto-detect from dates</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                    Override when auto-detect is wrong (e.g. multiple transactions per month).
                  </div>
                </div>
              </div>
            </div>

            {!isPro && (
              <ProGate
                compact
                icon="📈"
                feature="Time-series forecasting is Pro"
                description="Upgrade to unlock Holt-Winters forecasting with automatic seasonality detection, confidence bands, and honest diagnostics."
                onUpgrade={() => setPage("/settings", { state: { highlightSection: "manage-subscription" } })}
              />
            )}

            {forecastPlanGate && (
              <ProGate
                compact
                icon="📈"
                feature="Time-series forecasting is Pro"
                description="Your current plan does not include forecasting. Upgrade to Pro to continue."
                onUpgrade={() => setPage("/settings", { state: { highlightSection: "manage-subscription" } })}
              />
            )}

            {forecastError && (
              <InlineErrorNotice message={forecastError} onRetry={startForecast} />
            )}

            <button
              className="btn-primary"
              style={{ justifyContent: "center" }}
              onClick={startForecast}
              disabled={forecasting || !fcDateCol || !fcTargetCol || fcSameColumn || !isPro}
            >
              {forecasting
                ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Forecasting…</>
                : <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                    Run Forecast
                  </>
              }
            </button>

            <div style={{ padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text3)", lineHeight: 1.45 }}>
              <strong style={{ color: "var(--text2)" }}>What this does</strong><br />
              Holt-Winters exponential smoothing on a single numeric column. Detects seasonality when there is enough history (≥24 periods, ≥2 full cycles); otherwise falls back to trend-only. Does <em>not</em> use other columns as features — that remains supervised ML.
            </div>
          </div>

          {/* Right: results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {forecastResult ? (
              <>
                <div className="card fade-up">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <div className="card-title" style={{ margin: 0, flex: 1 }}>Forecast</div>
                    <span className="tag tag-cyan" style={{ textTransform: "none" }}>
                      {forecastResult.method === "holt_winters_seasonal" ? "Seasonal" : "Trend only"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                      {forecastResult.frequency} · h={forecastResult.horizon}
                    </span>
                    <button
                      onClick={() => setForecastExpanded(true)}
                      title="Expand preview"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text3)", cursor: "pointer" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.expand} /></svg>
                    </button>
                    <button
                      onClick={() => downloadForecastCSV(forecastResult)}
                      title="Download forecast as CSV"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text3)", cursor: "pointer" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
                    </button>
                    <button
                      onClick={() => downloadForecastPDF(forecastResult, forecastCardChartRef.current?.querySelector("svg"))}
                      title="Download PDF report (chart + notes + values)"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text3)", cursor: "pointer" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.file} /></svg>
                    </button>
                  </div>

                  <ForecastChart
                    ref={forecastCardChartRef}
                    history={forecastResult.history || []}
                    forecast={forecastResult.forecast || []}
                  />

                  {forecastResult.diagnostics && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                      <span>{forecastResult.diagnostics.history_points} periods</span>
                      {forecastResult.diagnostics.frequency_source === "explicit" && (
                        <span>frequency set explicitly</span>
                      )}
                      {forecastResult.diagnostics.frequency_source === "auto_low_confidence" && (
                        <span style={{ color: "var(--amber)" }}>frequency: best-effort guess</span>
                      )}
                      {forecastResult.diagnostics.gaps_interpolated > 0 && (
                        <span>{forecastResult.diagnostics.gaps_interpolated} gaps filled</span>
                      )}
                      {forecastResult.diagnostics.periods_aggregated && (
                        <span>duplicates summed</span>
                      )}
                      {forecastResult.diagnostics.rows_dropped_missing > 0 && (
                        <span>{forecastResult.diagnostics.rows_dropped_missing} rows dropped</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes / caveats */}
                {forecastResult.notes?.length > 0 && (
                  <div className="card fade-up">
                    <div className="card-title">Notes</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text2)", lineHeight: 1.55 }}>
                      {forecastResult.notes.map((n, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Forecast table (compact) */}
                <div className="card fade-up">
                  <div className="card-title">Forecast values</div>
                  <div style={{ overflowX: "auto", maxHeight: 220 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Date</th>
                          <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Point</th>
                          <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Lower</th>
                          <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text3)", fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>Upper</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(forecastResult.forecast || []).map((p, i) => (
                          <tr key={i}>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{(p.date || "").slice(0, 10)}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--accent2)", fontWeight: 600 }}>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--text3)" }}>{typeof p.lower === "number" ? p.lower.toFixed(2) : "—"}</td>
                            <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--text3)" }}>{typeof p.upper === "number" ? p.upper.toFixed(2) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ height: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)", textAlign: "center" }}>
                  Select a date column and numeric target<br />to generate a forecast
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", maxWidth: 260 }}>
                  Works best with regular daily, weekly, monthly or quarterly series that have at least 6–24 periods of history.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {forecastExpanded && forecastResult && (
        <ForecastLightbox forecastResult={forecastResult} onClose={() => setForecastExpanded(false)} chartRef={forecastLightboxChartRef} />
      )}
    </div>
  );
}