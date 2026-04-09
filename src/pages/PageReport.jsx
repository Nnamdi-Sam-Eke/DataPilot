import { useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

const SECTIONS = [
  { id: "executive_summary",  label: "Executive Summary",              default: true  },
  { id: "data_quality",       label: "Data Quality Assessment",        default: true  },
  { id: "statistics",         label: "Key Statistics & Distributions", default: true  },
  { id: "correlations",       label: "Correlation Analysis",           default: true  },
  { id: "model_performance",  label: "Model Performance Results",      default: false },
  { id: "feature_importance", label: "Feature Importance",             default: true  },
  { id: "recommendations",    label: "Recommendations",                default: true  },
];

// ===== Export Helpers =====
function buildHTMLReport(report, fileName) {
  const sec = report.sections || {};
  const exec = sec.executive_summary;
  const quality = sec.data_quality;
  const stats = sec.statistics;
  const corrs = sec.correlations?.top_correlations || [];
  const fi = sec.feature_importance || [];
  const recs = sec.recommendations || [];
  const date = new Date(report.generated_at).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  const qualityRows = (quality?.columns || []).map(c => `
    <tr>
      <td>${c.column}</td><td>${c.dtype}</td>
      <td style="color:${c.missing_pct > 0 ? "#e53e3e" : "#38a169"}">${c.missing_pct}%</td>
      <td>${c.unique_values}</td>
    </tr>`).join("");

  const corrRows = corrs.map(c => `
    <tr>
      <td>${c.col_a} ↔ ${c.col_b}</td>
      <td style="font-weight:600;color:${Math.abs(c.correlation) > 0.7 ? "#6c63ff" : "#555"}">${c.correlation}</td>
    </tr>`).join("");

  const fiRows = fi.map((f, i) => `
    <tr>
      <td>${i + 1}. ${f.feature}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${(f.importance/fi[0].importance*100).toFixed(1)}%;background:#6c63ff;border-radius:4px"></div>
          </div>
          <span style="font-size:11px;color:#888;width:40px">${f.importance.toFixed(3)}</span>
        </div>
      </td>
    </tr>`).join("");

  const recItems = recs.map(r => `<li style="margin-bottom:6px">${r}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DataPilot Report — ${fileName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; background: #f8f9fa; padding: 40px 20px; }
  .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #6c63ff, #a78bfa); color: white; padding: 40px; }
  .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
  .header .meta { font-size: 13px; opacity: 0.85; }
  .body { padding: 36px 40px; }
  .section { margin-bottom: 36px; }
  .section-title { font-size: 16px; font-weight: 700; color: #1a1a2e; border-bottom: 2px solid #6c63ff; padding-bottom: 8px; margin-bottom: 16px; }
  .summary-text { font-size: 13.5px; line-height: 1.7; color: #555; }
  .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px; }
  .stat-card { background: #f5f3ff; border-radius: 8px; padding: 14px; text-align: center; }
  .stat-card .value { font-size: 22px; font-weight: 800; color: #6c63ff; }
  .stat-card .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th { background: #f5f3ff; color: #555; font-weight: 600; padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e0ff; }
  td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; color: #444; }
  tr:hover td { background: #fafafa; }
  ul { padding-left: 20px; }
  li { font-size: 13px; color: #555; line-height: 1.6; }
  .footer { background: #f5f3ff; padding: 20px 40px; font-size: 11px; color: #888; text-align: center; }
  @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Analysis Report</h1>
    <div class="meta">${fileName} &nbsp;·&nbsp; Generated ${date} &nbsp;·&nbsp; DataPilot</div>
  </div>
  <div class="body">
    ${exec ? `
    <div class="section">
      <div class="section-title">Executive Summary</div>
      <p class="summary-text">${exec.summary}</p>
      <div class="stats-grid">
        <div class="stat-card"><div class="value">${exec.rows?.toLocaleString()}</div><div class="label">Rows</div></div>
        <div class="stat-card"><div class="value">${exec.columns}</div><div class="label">Columns</div></div>
        <div class="stat-card"><div class="value">${exec.missing_values_pct}%</div><div class="label">Missing</div></div>
        <div class="stat-card"><div class="value">${exec.duplicate_rows}</div><div class="label">Duplicates</div></div>
      </div>
    </div>` : ""}

    ${quality && qualityRows ? `
    <div class="section">
      <div class="section-title">Data Quality Assessment</div>
      <table>
        <thead><tr><th>Column</th><th>Type</th><th>Missing %</th><th>Unique Values</th></tr></thead>
        <tbody>${qualityRows}</tbody>
      </table>
    </div>` : ""}

    ${corrs.length > 0 ? `
    <div class="section">
      <div class="section-title">Top Correlations</div>
      <table>
        <thead><tr><th>Column Pair</th><th>Correlation</th></tr></thead>
        <tbody>${corrRows}</tbody>
      </table>
    </div>` : ""}

    ${fi.length > 0 ? `
    <div class="section">
      <div class="section-title">Feature Importance</div>
      <table>
        <thead><tr><th>Feature</th><th>Importance</th></tr></thead>
        <tbody>${fiRows}</tbody>
      </table>
    </div>` : ""}

    ${recs.length > 0 ? `
    <div class="section">
      <div class="section-title">Recommendations</div>
      <ul>${recItems}</ul>
    </div>` : ""}
  </div>
  <div class="footer">Generated by DataPilot &nbsp;·&nbsp; ${date}</div>
</div>
</body>
</html>`;
}

function buildCSVReport(report) {
  const rows = [["Section", "Key", "Value"]];
  const sec = report.sections || {};

  if (sec.executive_summary) {
    const e = sec.executive_summary;
    rows.push(["Executive Summary", "Rows", e.rows]);
    rows.push(["Executive Summary", "Columns", e.columns]);
    rows.push(["Executive Summary", "Missing %", e.missing_values_pct]);
    rows.push(["Executive Summary", "Duplicates", e.duplicate_rows]);
    rows.push(["Executive Summary", "Summary", `"${e.summary}"`]);
  }
  if (sec.correlations?.top_correlations) {
    sec.correlations.top_correlations.forEach(c => {
      rows.push(["Correlation", `${c.col_a} ↔ ${c.col_b}`, c.correlation]);
    });
  }
  if (sec.feature_importance) {
    sec.feature_importance.forEach(f => {
      rows.push(["Feature Importance", f.feature, f.importance]);
    });
  }
  if (sec.recommendations) {
    sec.recommendations.forEach((r, i) => {
      rows.push(["Recommendation", `#${i+1}`, `"${r}"`]);
    });
  }
  return rows.map(r => r.join(",")).join("\n");
}

function buildJSONReport(report) {
  return JSON.stringify(report, null, 2);
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

export default function PageReport({ setPage }) {
  const { sessionId, fileName, modelId, savedReport, setSavedReport, reportFormat, setReportFormat, reportChecked, setReportChecked, activeSessionExpired } = useDataPilot();

  const DEFAULT_CHECKED = Object.fromEntries(SECTIONS.map(s => [s.id, s.default]));
  const checked    = reportChecked ?? DEFAULT_CHECKED;
  const setChecked = setReportChecked;
  const format     = reportFormat;
  const setFormat  = setReportFormat;
  const report     = savedReport;
  const setReport  = setSavedReport;
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState("");

  const generate = async () => {
  if (!sessionId || activeSessionExpired) return;
  setGenerating(true);
  setError("");
  try {
      const selectedSections = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
      const res = await fetch(`${API_BASE}/report/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, sections: selectedSections, model_id: modelId || undefined, file_name: fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Report generation failed");
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    let content, mime, ext;

    if (format === "HTML") {
      content = buildHTMLReport(report, fileName);
      mime = "text/html"; ext = "html";
    } else if (format === "CSV") {
      content = buildCSVReport(report);
      mime = "text/csv"; ext = "csv";
    } else {
      content = buildJSONReport(report);
      mime = "application/json"; ext = "json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DataPilot_Report_${fileName?.replace(/\.[^.]+$/, "") || "report"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!report) return;
    const html = buildHTMLReport(report, fileName);
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  if (!sessionId || activeSessionExpired) {
    return (
      <div className="page-enter">
        <div className="page-header"><div className="page-title">Report Generator</div></div>
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>{activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "Upload a dataset first to generate a report."}</div>
        </div>
      </div>
    );
  }

  const sec = report?.sections || {};
  const exec = sec.executive_summary;
  const recs = sec.recommendations || [];
  const topCorrs = sec.correlations?.top_correlations || [];
  const fi = sec.feature_importance || [];

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Report Generator</div>
        <div className="page-subtitle">Auto-generate analysis reports from your session</div>
      </div>

      <div className="grid-2 report-layout" style={{ alignItems: "start" }}>
        {/* Config */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-title">Report Contents</div>
            {SECTIONS.map((item, i) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < SECTIONS.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div onClick={() => setChecked({ ...checked, [item.id]: !checked[item.id] })}
                  style={{ width: 15, height: 15, borderRadius: 4, cursor: "pointer", background: checked[item.id] ? "var(--accent)" : "var(--bg3)", border: `1px solid ${checked[item.id] ? "transparent" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {checked[item.id] && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d={Icons.check} /></svg>}
                </div>
                <span style={{ fontSize: 12.5, color: checked[item.id] ? "var(--text)" : "var(--text2)", cursor: "pointer" }}
                  onClick={() => setChecked({ ...checked, [item.id]: !checked[item.id] })}>{item.label}</span>
                {item.id === "model_performance" && !modelId && (
                  <span className="tag tag-amber" style={{ marginLeft: "auto", fontSize: 9 }}>needs model</span>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Export Format</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["HTML", "CSV", "JSON"].map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  style={{ flex: 1, padding: "8px", borderRadius: 7, cursor: "pointer", background: format === f ? "var(--accent-dim)" : "var(--bg3)", border: `1px solid ${format === f ? "rgba(108,99,255,0.3)" : "var(--border)"}`, color: format === f ? "var(--accent2)" : "var(--text2)", fontSize: 12, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text3)" }}>
              {format === "HTML" ? "Full styled report with tables and charts — open in any browser or print to PDF" :
               format === "CSV"  ? "Flat data export — open in Excel or Google Sheets" :
               "Raw JSON — for developers or further processing"}
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, fontSize: 12.5, color: "var(--red)" }}>{error}</div>
          )}

          <button className="btn-primary" style={{ justifyContent: "center" }} onClick={generate} disabled={generating}>
            {generating
              ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Generating…</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.file} /></svg>Generate Report</>
            }
          </button>

          {report && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={downloadReport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
                Download {format}
              </button>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={printReport}>
                🖨️ Print / PDF
              </button>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.eye} /></svg>
              Preview
            </div>
            {report && <span className="tag tag-green">Ready to Export</span>}
          </div>

          {report ? (
            <div className="report-preview" style={{ maxHeight: 540, overflowY: "auto" }}>
              <div style={{ borderBottom: "2px solid #6c63ff", paddingBottom: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#111", fontFamily: "'Syne', sans-serif" }}>Analysis Report</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 3, fontFamily: "'DM Mono', monospace" }}>
                  {fileName} · Generated {new Date(report.generated_at).toLocaleDateString()} · DataPilot
                </div>
              </div>

              {exec && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#222", marginBottom: 6 }}>Executive Summary</div>
                  <div style={{ fontSize: 11, color: "#444", lineHeight: 1.6, marginBottom: 12 }}>{exec.summary}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[["Rows", exec.rows?.toLocaleString()], ["Columns", exec.columns], ["Missing %", exec.missing_values_pct + "%"], ["Duplicates", exec.duplicate_rows]].map(([label, val]) => (
                      <div key={label} style={{ background: "#f5f3ff", borderRadius: 6, padding: "6px 10px" }}>
                        <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#6c63ff" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {topCorrs.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#222", margin: "12px 0 6px" }}>Top Correlations</div>
                  {topCorrs.slice(0, 6).map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", padding: "4px 0", borderBottom: "1px solid #eee" }}>
                      <span>{c.col_a} ↔ {c.col_b}</span>
                      <span style={{ fontWeight: 600, color: Math.abs(c.correlation) > 0.7 ? "#6c63ff" : "#888" }}>{c.correlation}</span>
                    </div>
                  ))}
                </>
              )}

              {fi.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#222", margin: "12px 0 6px" }}>Feature Importance</div>
                  {fi.slice(0, 6).map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, width: 110, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.feature}</span>
                      <div style={{ flex: 1, height: 6, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(f.importance/fi[0].importance)*100}%`, background: "#6c63ff", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, color: "#888", width: 36, textAlign: "right" }}>{f.importance.toFixed(3)}</span>
                    </div>
                  ))}
                </>
              )}

              {recs.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#222", margin: "12px 0 6px" }}>Recommendations</div>
                  {recs.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 11, color: "#555" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6c63ff", marginTop: 4, flexShrink: 0 }} />
                      {r}
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const seed = Math.sin(i * 9301 + 49297); const w = 70 + (seed - Math.floor(seed)) * 30;
                return <div key={i} className="skeleton" style={{ height: 20, opacity: 1 - i * 0.08, width: `${w}%` }} />;
              })}
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", marginTop: 8 }}>Generate a report to preview</div>
            </div>
          )}
        </div>
      </div>
      <NextStepBar label="Export Code" to="/codegen" setPage={setPage} note="Next: export your full pipeline as Python, Jupyter, or Markdown" />
    </div>
  );
}