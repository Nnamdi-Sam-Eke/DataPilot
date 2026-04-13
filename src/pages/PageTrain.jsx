import { useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { id: "rf",  label: "Random Forest",       desc: "Robust, handles mixed types",     color: "var(--accent2)" },
  { id: "lr",  label: "Logistic Regression", desc: "Fast baseline, interpretable",    color: "var(--cyan)"    },
  { id: "xgb", label: "XGBoost",             desc: "High accuracy, gradient boosting",color: "var(--green)"   },
  { id: "svm", label: "SVM",                 desc: "Effective in high-dimensions",    color: "var(--amber)"   },
];

const MODEL_COLORS = { rf: "var(--accent2)", lr: "var(--cyan)", xgb: "var(--green)", svm: "var(--amber)" };
const MODEL_LABELS = { rf: "Random Forest", lr: "Logistic Reg.", xgb: "XGBoost", svm: "SVM" };

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
function ModelResultPanel({ result, isActive, onSetActive }) {
  const metrics = result?.metrics || {};
  const isClass = result?.task === "classification";
  const color = MODEL_COLORS[result?.model_type] || "var(--accent2)";
  const pm = primaryMetric(result);

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
          ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 5, padding: "2px 7px" }}>Active for Predictions</span>
          : (
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

      {/* Download */}
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
  } = useDataPilot();

  const [training, setTraining] = useState(false);
  const [error, setError] = useState("");
  // Which result to show in the detail panel (defaults to most recent)
  const [detailModelId, setDetailModelId] = useState(null);

  const selectedModel = trainConfig.selectedModel;
  const targetCol     = trainConfig.targetCol;
  const testSize      = trainConfig.testSize;
  const set = (key, val) => setTrainConfig({ ...trainConfig, [key]: val });

  // The result shown in the detail panel
  const displayResult = detailModelId
    ? (trainedModels.find(m => m.model_id === detailModelId) || trainResults)
    : trainResults;

  // ── Train ───────────────────────────────────────────────────────────────
  const startTrain = async () => {
    if (!sessionId || !targetCol || activeSessionExpired) return;
    setTraining(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/train/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, target_column: targetCol, model_type: selectedModel, test_size: testSize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Training failed");

      // Build a stored model entry
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

      // Upsert by model_type — retrain replaces the same algorithm slot
      setTrainedModels(prev => {
        const idx = prev.findIndex(m => m.model_type === data.model_type);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = entry;
          return updated;
        }
        return [...prev, entry];
      });

      // Always make the freshly trained model active
      setModelId(data.model_id);
      setModelMeta({ type: data.model_type, task: data.task, metrics: data.metrics, featureImportance: data.feature_importance });
      setTrainResults(entry);
      setDetailModelId(data.model_id);

    } catch (e) {
      setError(e.message || "Training failed");
    } finally {
      setTraining(false);
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
    setTrainedModels(prev => prev.filter(m => m.model_id !== modelIdToRemove));
    // If deleted model was active, fall back to most recent remaining
    if (modelIdToRemove === modelId) {
      setTrainedModels(prev => {
        const remaining = prev.filter(m => m.model_id !== modelIdToRemove);
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
        return remaining;
      });
    } else if (modelIdToRemove === detailModelId) {
      setDetailModelId(modelId);
    }
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

  // Algorithm already trained?
  const trainedTypes = new Set(trainedModels.map(m => m.model_type));
  const activeEntry = trainedModels.find(m => m.model_id === modelId);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Train Model</div>
        <div className="page-subtitle">
          {hasModels
            ? `${trainedModels.length} model${trainedModels.length > 1 ? "s" : ""} trained · ${activeEntry ? `${MODEL_LABELS[activeEntry.model_type]} active for predictions` : "select an active model below"}`
            : "Configure and train machine learning models on your dataset"
          }
        </div>
      </div>

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
                    const trained = trainedTypes.has(m.id);
                    const isSelected = selectedModel === m.id;
                    const thisEntry = trainedModels.find(tm => tm.model_type === m.id);
                    const pm = primaryMetric(thisEntry);
                    return (
                      <div
                        key={m.id}
                        onClick={() => set("selectedModel", m.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: isSelected ? "var(--accent-dim)" : "var(--bg3)", border: `1px solid ${isSelected ? "rgba(108,99,255,0.3)" : "var(--border)"}`, cursor: "pointer", transition: "all 0.15s" }}
                      >
                        <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${isSelected ? "var(--accent2)" : "var(--text3)"}`, background: isSelected ? "var(--accent)" : "transparent", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                            {m.label}
                            {trained && (
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0, display: "inline-block" }} title="Already trained" />
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 1 }}>{m.desc}</div>
                        </div>
                        {/* Show metric badge if trained */}
                        {trained && pm && (
                          <MetricBadge
                            value={pm.val}
                            task={thisEntry?.task}
                          />
                        )}
                        {/* Retrain indicator */}
                        {trained && isSelected && (
                          <span style={{ fontSize: 9, color: "var(--amber)", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>retrain</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, fontSize: 12.5, color: "var(--red)" }}>
              {error}
            </div>
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

          {/* Nudge to train all 4 when some remain */}
          {hasModels && trainedModels.length < MODEL_OPTIONS.length && (
            <div style={{ padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text3)" }}>
              💡 Train the remaining {MODEL_OPTIONS.length - trainedModels.length} algorithm{MODEL_OPTIONS.length - trainedModels.length > 1 ? "s" : ""} to unlock the full comparison view
            </div>
          )}
        </div>

        {/* ── Right: results ──────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Comparison table — shown when ≥2 models */}
          {hasComparison && (
            <ComparisonTable
              trainedModels={trainedModels}
              activeModelId={modelId}
              onSelect={handleSetActive}
              onDelete={handleDelete}
            />
          )}

          {/* Detail panel — most recently trained or selected model */}
          {displayResult ? (
            <>
              <ModelResultPanel
                result={displayResult}
                isActive={displayResult.model_id === modelId}
                onSetActive={handleSetActive}
              />

              {/* Feature importance */}
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

              {/* Confusion matrix */}
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

              {/* Model switcher tabs — only when multiple models trained */}
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
        label="Run Predictions"
        to="/predictions"
        setPage={setPage}
        note={modelId ? `Active model: ${MODEL_LABELS[activeEntry?.model_type] || "—"} · switch anytime from the comparison table` : "Train a model first to run predictions"}
      />
    </div>
  );
}