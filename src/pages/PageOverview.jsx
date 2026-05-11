import React, { useState, useMemo, useEffect } from "react";
import { SparkBar } from "../shared/charts.jsx";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";   // ← Fixed import

// DataPilot "Aura" palette — dark-first, matches the purple-accent design system.
//   +1.0  →  rgb(210,  50,  50)  deep crimson (strong positive)
//    0    →  rgb(50,  55,  88)   dark blue-purple (visible but recedes into the theme)
//   -1.0  →  rgb(78, 108, 228)   royal/periwinkle blue (strong negative)
const HEAT_BASE = { r: 50,  g: 55,  b: 88  };
const HEAT_POS  = { r: 210, g: 50,  b: 50  };
const HEAT_NEG  = { r: 78,  g: 108, b: 228 };

function heatColor(v) {
  if (v === null || v === undefined || isNaN(v)) return "var(--bg3)";
  const value = Math.max(-1, Math.min(1, v));
  const lerp  = (a, b, t) => Math.round(a + (b - a) * t);
  const hi    = value >= 0 ? HEAT_POS : HEAT_NEG;
  const t     = Math.abs(value);
  return `rgb(${lerp(HEAT_BASE.r,hi.r,t)},${lerp(HEAT_BASE.g,hi.g,t)},${lerp(HEAT_BASE.b,hi.b,t)})`;
}
// All anchors are dark — white text is always readable
function getTextColor() { return "#ffffff"; }

function parseNum(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}


// Build sparkbar values from a column's summary (min/mean/max → fake distribution shape)
function summaryToSparkValues(s, len = 12) {
  const min  = parseNum(s?.min)  ?? 0;
  const max  = parseNum(s?.max)  ?? 100;
  const mean = parseNum(s?.mean) ?? (min + max) / 2;
  const std  = parseNum(s?.std) || (max - min) / 6 || 1;
  const range = max - min || 1;
  return Array.from({ length: len }, (_, i) => {
    const x = min + (i / (len - 1)) * range;
    const bell = Math.exp(-0.5 * ((x - mean) / std) ** 2);
    return Math.max(3, Math.round(bell * 100));
  });
}

// Build donut segments for a boolean/binary column
function getBinaryDistribution(summary) {
  // tries to detect churn-like boolean column
  if (!summary) return null;
  const cols = Object.keys(summary);
  for (const col of cols) {
    const s = summary[col];
    if (s?.unique === 2 || s?.unique === "2") {
      const count = parseNum(s?.count);
      const freq  = parseNum(s?.freq);  // most common value count
      if (count && freq) {
        const pctMajor = (freq / count) * 100;
        const pctMinor = 100 - pctMajor;
        return { col, pctMajor: pctMajor.toFixed(1), pctMinor: pctMinor.toFixed(1), count, freq };
      }
    }
  }
  return null;
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

export default function PageOverview({ setPage }) {
  const { summary, columns, fileName, rowCount, sessionId, activeSessionExpired } = useDataPilot();
  const [correlationMatrix, setCorrelationMatrix] = useState(null);
 
  // ── Fetch Real Correlation Matrix ─────────────────────────────────────
  useEffect(() => {
    if (!sessionId || activeSessionExpired) return;

    fetch(`${API_BASE}/clean/${sessionId}/correlation`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !data.error) {
          setCorrelationMatrix(data.matrix);
        }
      })
      .catch(() => {});
  }, [sessionId, activeSessionExpired]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const numericCols = useMemo(() =>
    columns.filter(c => summary?.[c]?.mean !== undefined), [summary, columns]);

  const categoricalCols = useMemo(() =>
    columns.filter(c => summary?.[c]?.top !== undefined), [summary, columns]);
  
  const heatCols = correlationMatrix
    ? Object.keys(correlationMatrix).slice(0, 12)
    : numericCols.slice(0, 12);
  const { totalMissing, missingPct } = useMemo(() => {
    if (!summary || !rowCount || !columns.length) return { totalMissing: 0, missingPct: "0%" };
    let missing = 0;
    columns.forEach(col => {
      const count = parseNum(summary[col]?.count);
      if (count !== null) missing += rowCount - count;
    });
    return {
      totalMissing: missing,
      missingPct: ((missing / (rowCount * columns.length)) * 100).toFixed(1) + "%",
    };
  }, [summary, columns, rowCount]);

  const duplicates = useMemo(() => summary?.__meta__?.duplicates ?? 0, [summary]);

  // ── Column metadata for table ──────────────────────────────────────────────
  const columnMeta = useMemo(() => {
    if (!summary || !columns.length) return [];
    return columns.map(col => {
      const s = summary[col] || {};
      const count   = parseNum(s.count);
      const missing = count !== null ? rowCount - count : 0;
      const missPct = rowCount > 0 ? ((missing / rowCount) * 100).toFixed(1) + "%" : "0%";
      const isNum   = s.mean !== undefined;
      const isCat   = s.top  !== undefined;
      return {
        name:    col,
        type:    isNum ? (Number.isInteger(parseNum(s.mean)) ? "int" : "float") : isCat ? "cat" : "str",
        missing: missPct,
        unique:  s.unique !== undefined ? String(Math.round(s.unique)) : "—",
        mean:    s.mean   !== undefined ? (parseNum(s.mean)?.toFixed(2) ?? "—") : "—",
        std:     s.std    !== undefined ? (parseNum(s.std)?.toFixed(2)  ?? "—") : "—",
      };
    });
  }, [summary, columns, rowCount]);

  // ── First numeric column → sparkbar chart ─────────────────────────────────
  const firstNumericCol = numericCols[0];
  const firstNumericSummary = firstNumericCol ? summary[firstNumericCol] : null;
  const sparkValues = firstNumericSummary ? summaryToSparkValues(firstNumericSummary) : null;
  const sparkMin  = parseNum(firstNumericSummary?.min);
  const sparkMax  = parseNum(firstNumericSummary?.max);

  // ── Binary column → donut ─────────────────────────────────────────────────
  const binaryDist = useMemo(() => getBinaryDistribution(summary), [summary]);

 

  // ── Stats cards ───────────────────────────────────────────────────────────
  const statCards = [
    { label: "Total Rows",     value: rowCount ? rowCount.toLocaleString() : "—", sub: "100% ingested",                                  color: "var(--green)"   },
    { label: "Columns",        value: columns.length || "—",                        sub: `${numericCols.length} numeric · ${categoricalCols.length} categorical`, color: "var(--accent2)" },
    { label: "Missing Values", value: missingPct,                                   sub: `${totalMissing.toLocaleString()} cells`,         color: "var(--amber)"   },
    { label: "Duplicates", value: duplicates, 
  sub: rowCount > 0 && duplicates > 0 ? `${((duplicates / rowCount) * 100).toFixed(1)}% of dataset` : "0% of dataset",
  color: "var(--red)" },  ];

  if (!sessionId || activeSessionExpired) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <div className="page-title">Data Overview</div>
          <div className="page-subtitle">
            {activeSessionExpired
              ? "Session expired — re-upload your dataset to continue"
              : "No dataset loaded — upload a file first"}
          </div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: activeSessionExpired ? "rgba(248,113,113,0.08)" : "var(--accent-dim)", border: `1px solid ${activeSessionExpired ? "rgba(248,113,113,0.2)" : "rgba(108,99,255,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={activeSessionExpired ? "var(--red)" : "var(--accent2)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {activeSessionExpired
                ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                : <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />}
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>
            {activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {activeSessionExpired
              ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue."
              : "Upload a dataset to see your data overview."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div className="page-title">Data Overview</div>
          <span className="tag tag-blue">{fileName}</span>
        </div>
        <div className="page-subtitle">
          Automated exploratory analysis · {rowCount?.toLocaleString()} rows · {columns.length} columns
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid-4 mb-5 fade-up">
        {statCards.map((s, i) => (
          <div key={i} className="stat-block">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 20, color: s.color,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Distribution + Donut row ── */}
      <div className="grid-2 mb-5 fade-up fade-up-1">

        {/* Bar chart — first numeric column */}
        <div className="card">
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.chart} /></svg>
            {firstNumericCol ? `${firstNumericCol} Distribution` : "Distribution"}
          </div>
          {sparkValues ? (
            <>
              <div style={{ height: 120 }}>
                <SparkBar values={sparkValues} color="#6c63ff" height={120} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                {[sparkMin, "", "", "", "", "", "", "", "", "", "", sparkMax].map((l, i) => (
                  <span key={i} style={{ fontSize: 9, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                    {l !== "" && l !== null ? (typeof l === "number" ? l.toFixed(0) : l) : ""}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>No numeric columns</span>
            </div>
          )}
        </div>

        {/* Donut — binary/boolean column */}
        <div className="card">
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.predict} /></svg>
            {binaryDist ? `${binaryDist.col} Distribution` : "Class Distribution"}
          </div>

          {binaryDist ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", height: 120 }}>
              {/* Donut SVG */}
              <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" width="100" height="100">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg3)" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--accent)"
                    strokeWidth="3.5"
                    strokeDasharray={`${binaryDist.pctMinor} ${100 - parseFloat(binaryDist.pctMinor)}`}
                    strokeDashoffset="25" strokeLinecap="round" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--green)"
                    strokeWidth="3.5"
                    strokeDasharray={`${binaryDist.pctMajor} ${100 - parseFloat(binaryDist.pctMajor)}`}
                    strokeDashoffset={`-${parseFloat(binaryDist.pctMinor) - 1}`}
                    strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{binaryDist.pctMinor}%</div>
                  <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>{binaryDist.col.toLowerCase()}</div>
                </div>
              </div>
              {/* Legend */}
              <div style={{ flex: 1 }}>
                {[
                  { label: "Majority", val: binaryDist.pctMajor + "%", count: (binaryDist.count - binaryDist.freq).toLocaleString(), color: "var(--green)" },
                  { label: "Minority", val: binaryDist.pctMinor + "%", count: binaryDist.freq?.toLocaleString(), color: "var(--accent)" },
                ].map((r, i) => (
                  <div key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                        <span style={{ fontSize: 12, color: "var(--text)" }}>{r.label}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: r.color }}>{r.val}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: r.val, background: r.color }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 3 }}>{r.count} records</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Fallback: show top categorical col value counts */
            <div style={{ height: 120, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              {categoricalCols.slice(0, 3).map(col => {
                const s = summary[col] || {};
                return (
                  <div key={col} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text2)", width: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</div>
                    <div className="progress-track" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: "60%", background: "var(--accent)" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                      {s.unique !== undefined ? `${Math.round(s.unique)} unique` : ""}
                    </div>
                  </div>
                );
              })}
              {categoricalCols.length === 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: "var(--text3)" }}>No binary column detected</div>
              )}
            </div>
          )}
        </div>
      </div>


           {/* REAL CORRELATION HEATMAP - Compact Image-like Style */}
      {heatCols.length >= 2 && correlationMatrix && (
        <div className="card mb-5 fade-up fade-up-2">
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={Icons.grid} />
            </svg>
            Correlation Heatmap
            <span className="tag tag-blue" style={{ marginLeft: "auto" }}>Numeric Columns Only</span>
          </div>

          {/* overflow-x: auto WITHOUT justify-content: center avoids the left-clip trap.
              margin: 0 auto on the inner grid centers when there's room, scrolls from
              the left edge when it needs to. */}
          <div style={{ overflowX: "auto", padding: "8px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "flex-start", margin: "0 auto" }}>
            <div style={{
              display: "inline-grid",
              gridTemplateColumns: `56px repeat(${heatCols.length}, 28px)`,
              gap: "1px",
            }}>
              {/* Top-left spacer */}
              <div />

              {/* Column headers — rotated */}
              {heatCols.map(col => (
                <div key={`h-${col}`} style={{
                  width: "28px",
                  height: "64px",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  paddingBottom: "4px",
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  fontSize: "9.5px",
                  fontWeight: 600,
                  color: "var(--text2)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}>
                  {col.length > 10 ? col.slice(0, 9) + "…" : col}
                </div>
              ))}

              {/* Rows */}
              {heatCols.map(rowCol => (
                <React.Fragment key={rowCol}>
                  {/* Row label */}
                  <div style={{
                    width: "56px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: "6px",
                    fontWeight: 600,
                    fontSize: "9.5px",
                    color: "var(--text)",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}>
                    {rowCol.length > 8 ? rowCol.slice(0, 7) + "…" : rowCol}
                  </div>

                  {/* Cells */}
                  {heatCols.map(colCol => {
                    const raw   = correlationMatrix?.[rowCol]?.[colCol];
                    const value = typeof raw === "number" ? raw : (rowCol === colCol ? 1.0 : 0.0);
                    return (
                      <div
                        key={`${rowCol}-${colCol}`}
                        style={{
                          width: "28px",
                          height: "28px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: heatColor(value),
                          color: "#fff",
                          fontSize: "7.5px",
                          fontFamily: "'DM Mono', monospace",
                          fontWeight: 700,
                          borderRadius: "2px",
                          cursor: "pointer",
                          transition: "transform 0.1s ease",
                          letterSpacing: "-0.3px",
                        }}
                        title={`${rowCol} ↔ ${colCol}: ${value.toFixed(3)}`}
                        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.25)"}
                        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                      >
                        {value.toFixed(2)}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
              </div>

              {/* ── Colorbar ── */}
              <div style={{ paddingTop: "64px", paddingLeft: "10px", flexShrink: 0 }}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <div style={{
                    width: "12px",
                    height: `${heatCols.length * 29 - 1}px`,
                    borderRadius: "6px",
                    background: `linear-gradient(to bottom,
                      rgb(${HEAT_POS.r},${HEAT_POS.g},${HEAT_POS.b}),
                      rgb(${HEAT_BASE.r},${HEAT_BASE.g},${HEAT_BASE.b}),
                      rgb(${HEAT_NEG.r},${HEAT_NEG.g},${HEAT_NEG.b}))`,
                  }} />
                  {[
                    { label: "+1.0", pos: 0    },
                    { label: "+0.5", pos: 0.25 },
                    { label:  "0.0", pos: 0.5  },
                    { label: "\u22120.5", pos: 0.75 },
                    { label: "\u22121.0", pos: 1.0  },
                  ].map(({ label, pos }) => (
                    <div key={label} style={{
                      position: "absolute",
                      top: `${pos * (heatCols.length * 29 - 1)}px`,
                      left: "14px",
                      transform: "translateY(-50%)",
                      display: "flex", alignItems: "center", gap: "3px",
                    }}>
                      <div style={{ width: "4px", height: "1px", background: "var(--text3)" }} />
                      <span style={{
                        fontSize: "8px", fontFamily: "'DM Mono', monospace",
                        color: "var(--text3)", whiteSpace: "nowrap", lineHeight: 1,
                      }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
      {/* ── Correlation Heatmap (inline — based on column names, values from summary) ── */}
      {heatCols.length >= 2 && (
        <div className="card mb-5 fade-up fade-up-2">
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.grid} /></svg>
            Numeric Columns — Value Ranges
            <span className="tag tag-blue" style={{ marginLeft: "auto" }}>Use Visualizations → Heatmap for full correlation matrix</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {heatCols.map(col => {
              const s = summary[col] || {};
              const min  = parseNum(s.min);
              const max  = parseNum(s.max);
              const mean = parseNum(s.mean);
              const range = (max !== null && min !== null) ? (max - min) || 1 : 1;
              const pct  = (mean !== null && min !== null) ? Math.min(((mean - min) / range) * 100, 100) : 50;
              return (
                <div key={col}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{col}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                      mean: {mean?.toFixed(2) ?? "—"}{" · "}std: {parseNum(s.std)?.toFixed(2) ?? "—"}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--accent2))" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>min: {min?.toFixed(1) ?? "—"}</span>
                    <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>max: {max?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Column Summary Table ── */}
      <div className="card fade-up fade-up-3">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.file} /></svg>
          Column Summary
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Unique</th><th>Mean</th><th>Std Dev</th></tr></thead>
            <tbody>
              {columnMeta.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td><span className={`tag ${c.type === "cat" || c.type === "str" ? "tag-cyan" : c.type === "bool" ? "tag-amber" : "tag-blue"}`}>{c.type}</span></td>
                  <td style={{ color: parseFloat(c.missing) > 0 ? "var(--amber)" : "var(--green)" }}>{c.missing}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{c.unique}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{c.mean}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{c.std}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <NextStepBar label="Clean Your Data" to="/cleaning" setPage={setPage} note="Next: fix missing values, drop duplicates, cast types" />
    </div>
  );
}