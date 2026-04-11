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

// ── Correlation heatmap SVG builder ────────────────────────────────────────────
function buildCorrelationHeatmapSVG(matrix, cols) {
  if (!matrix || cols.length < 2) return "";
  const N      = cols.length;
  const CELL   = Math.min(52, Math.floor(420 / N));
  const LABEL  = 90;
  const PAD    = 16;
  const W      = LABEL + N * CELL + PAD;
  const H      = LABEL + N * CELL + PAD;

  const colorFor = (v) => {
    if (v === null || v === undefined) return "#e8e8e8";
    const abs = Math.abs(v);
    if (v > 0) {
      const r = Math.round(108 + (1 - abs) * (240 - 108));
      const g = Math.round(99  + (1 - abs) * (240 - 99));
      const b = Math.round(255);
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(255);
      const g = Math.round(99  + (1 - abs) * (240 - 99));
      const b = Math.round(99  + (1 - abs) * (240 - 99));
      return `rgb(${r},${g},${b})`;
    }
  };

  let cells = "";
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const val = matrix[cols[i]]?.[cols[j]];
      const x   = LABEL + j * CELL;
      const y   = LABEL + i * CELL;
      const txt = val !== null && val !== undefined ? val.toFixed(2) : "—";
      const fg  = Math.abs(val ?? 0) > 0.5 ? "#fff" : "#333";
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${colorFor(val)}" stroke="#fff" stroke-width="1.5"/>`;
      if (CELL >= 36) {
        cells += `<text x="${x + CELL / 2}" y="${y + CELL / 2 + 4}" text-anchor="middle" font-size="9" fill="${fg}" font-family="monospace">${txt}</text>`;
      }
    }
  }

  let colLabels = "";
  let rowLabels = "";
  cols.forEach((col, i) => {
    const short = col.length > 10 ? col.slice(0, 9) + "…" : col;
    colLabels += `<text x="${LABEL + i * CELL + CELL / 2}" y="${LABEL - 6}" text-anchor="middle" font-size="9" fill="#555" font-family="sans-serif" transform="rotate(-35 ${LABEL + i * CELL + CELL / 2} ${LABEL - 6})">${short}</text>`;
    rowLabels += `<text x="${LABEL - 6}" y="${LABEL + i * CELL + CELL / 2 + 4}" text-anchor="end" font-size="9" fill="#555" font-family="sans-serif">${short}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#fafafa" rx="8"/>
    ${colLabels}${rowLabels}${cells}
  </svg>`;
}

// ── HTML report builder ────────────────────────────────────────────────────────
function buildHTMLReport(report, fileName, savedPlots = [], aiNarrative = "") {
  const sec      = report.sections || {};
  const exec     = sec.executive_summary;
  const quality  = sec.data_quality;
  const stats    = sec.statistics || {};
  const corrs    = sec.correlations?.top_correlations || [];
  const corrMatrix = sec.correlations?.matrix;
  const corrCols   = sec.correlations?.numeric_columns || [];
  const fi       = sec.feature_importance || [];
  const recs     = sec.recommendations || [];
  const modelPerf = sec.model_performance;
  const date     = new Date(report.generated_at).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  // ── Quality table rows
  const qualityRows = (quality?.columns || []).map(c => `
    <tr>
      <td>${c.column}</td>
      <td><span class="badge badge-type">${c.dtype}</span></td>
      <td><span class="badge ${c.missing_pct > 0 ? "badge-warn" : "badge-ok"}">${c.missing_pct}%</span></td>
      <td>${c.unique_values.toLocaleString()}</td>
    </tr>`).join("");

  // ── Correlation rows
  const corrRows = corrs.slice(0, 15).map(c => {
    const abs = Math.abs(c.correlation);
    const strength = abs >= 0.7 ? "Strong" : abs >= 0.4 ? "Moderate" : "Weak";
    const cls = abs >= 0.7 ? "badge-strong" : abs >= 0.4 ? "badge-mod" : "badge-weak";
    return `<tr>
      <td>${c.col_a} ↔ ${c.col_b}</td>
      <td style="font-weight:600;color:${c.correlation >= 0 ? "#6c63ff" : "#e53e3e"}">${c.correlation}</td>
      <td><span class="badge ${cls}">${strength}</span></td>
    </tr>`;
  }).join("");

  // ── Heatmap SVG
  const heatmapSVG = corrCols.length >= 2
    ? buildCorrelationHeatmapSVG(corrMatrix, corrCols.slice(0, 12))
    : "";

  // ── Statistics table rows
  const statsSection = Object.entries(stats).map(([col, s]) => `
    <tr>
      <td style="font-weight:500">${col}</td>
      <td>${s.mean !== null && s.mean !== undefined ? Number(s.mean).toFixed(3) : "—"}</td>
      <td>${s.std  !== null && s.std  !== undefined ? Number(s.std ).toFixed(3) : "—"}</td>
      <td>${s.min  !== null && s.min  !== undefined ? Number(s.min ).toFixed(3) : "—"}</td>
      <td>${s["25%"] !== null && s["25%"] !== undefined ? Number(s["25%"]).toFixed(3) : "—"}</td>
      <td>${s["50%"] !== null && s["50%"] !== undefined ? Number(s["50%"]).toFixed(3) : "—"}</td>
      <td>${s["75%"] !== null && s["75%"] !== undefined ? Number(s["75%"]).toFixed(3) : "—"}</td>
      <td>${s.max  !== null && s.max  !== undefined ? Number(s.max ).toFixed(3) : "—"}</td>
    </tr>`).join("");

  // ── Feature importance rows
  const fiRows = fi.map((f, i) => `
    <tr>
      <td>${i + 1}. ${f.feature}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden;max-width:180px">
            <div style="height:100%;width:${(f.importance / fi[0].importance * 100).toFixed(1)}%;background:linear-gradient(90deg,#6c63ff,#a78bfa);border-radius:4px"></div>
          </div>
          <span style="font-size:11px;color:#888;width:44px">${f.importance.toFixed(4)}</span>
        </div>
      </td>
    </tr>`).join("");

  // ── Model performance block
  const modelBlock = modelPerf ? `
    <div class="section">
      <div class="section-title">Model Performance</div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="value">${modelPerf.model_type?.toUpperCase() || "—"}</div><div class="label">Algorithm</div></div>
        <div class="stat-card"><div class="value">${modelPerf.task || "—"}</div><div class="label">Task Type</div></div>
        ${Object.entries(modelPerf.metrics || {}).map(([k, v]) => `
          <div class="stat-card">
            <div class="value" style="color:#38a169">${typeof v === "number" ? (["rmse","mae","mse"].includes(k) ? v.toFixed(3) : k === "r2" ? v.toFixed(3) : v < 1 && v > -1 ? (v * 100).toFixed(1) + "%" : v.toFixed(3)) : v}</div>
            <div class="label">${k.toUpperCase()}</div>
          </div>`).join("")}
      </div>
    </div>` : "";

  // ── Saved charts section
  const completedPlots = (savedPlots || []).filter(p => p.image && !p.error);
  const chartsSection = completedPlots.length > 0 ? `
    <div class="section">
      <div class="section-title">Generated Charts</div>
      <p style="font-size:12.5px;color:#666;margin-bottom:18px">${completedPlots.length} chart${completedPlots.length > 1 ? "s" : ""} generated during this analysis session.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px">
        ${completedPlots.map(p => `
          <div style="border:1px solid #e8e8f0;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
            <div style="padding:10px 14px;background:#f5f3ff;border-bottom:1px solid #e8e8f0;font-size:11.5px;font-weight:600;color:#4a4580">${p.title || p.type || "Chart"}</div>
            <img src="data:image/png;base64,${p.image}" alt="${p.title || "chart"}" style="width:100%;display:block"/>
          </div>`).join("")}
      </div>
    </div>` : "";

  // ── Recommendations
  const recItems = recs.map((r, i) => `
    <li style="margin-bottom:10px;padding:10px 14px;background:#f9f9ff;border-left:3px solid #6c63ff;border-radius:0 6px 6px 0;font-size:12.5px;color:#444;line-height:1.6">
      <strong style="color:#6c63ff">#${i + 1}</strong> &nbsp;${r}
    </li>`).join("");

  // ── AI narrative block
  const narrativeBlock = aiNarrative ? `
    <div class="section" style="background:linear-gradient(135deg,#f5f3ff,#faf9ff);border:1px solid #e2e0ff;border-radius:12px;padding:24px 28px;margin-bottom:36px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:28px;height:28px;background:linear-gradient(135deg,#6c63ff,#a78bfa);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">✦</div>
        <div style="font-size:14px;font-weight:700;color:#1a1a2e">Analyst Summary</div>
        <span style="font-size:10px;background:#6c63ff;color:white;padding:2px 8px;border-radius:12px;margin-left:auto">AI Generated</span>
      </div>
      <p style="font-size:13.5px;line-height:1.8;color:#444;font-style:italic">${aiNarrative}</p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DataPilot Report — ${fileName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #333; background: #f0f0f8; padding: 40px 20px; }
  .container { max-width: 960px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(108,99,255,0.12); }

  /* Header */
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2b55 60%, #6c63ff 100%); color: white; padding: 48px 48px 40px; position: relative; overflow: hidden; }
  .header::before { content: ""; position: absolute; top: -60px; right: -60px; width: 220px; height: 220px; border-radius: 50%; background: rgba(167,139,250,0.12); }
  .header::after  { content: ""; position: absolute; bottom: -40px; right: 80px; width: 140px; height: 140px; border-radius: 50%; background: rgba(108,99,255,0.15); }
  .header-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
  .header-logo-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .header-logo-text { font-size: 13px; font-weight: 600; opacity: 0.7; letter-spacing: 0.1em; text-transform: uppercase; }
  .header h1 { font-size: 30px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
  .header .meta { font-size: 12.5px; opacity: 0.65; letter-spacing: 0.02em; }
  .header .file-badge { display: inline-block; margin-top: 14px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 14px; font-size: 11.5px; font-family: monospace; }

  /* Body */
  .body { padding: 44px 48px; }
  .section { margin-bottom: 40px; }
  .section-title { font-size: 15px; font-weight: 700; color: #1a1a2e; border-bottom: 2px solid #6c63ff; padding-bottom: 10px; margin-bottom: 18px; display: flex; align-items: center; gap: 8px; }
  .section-title::before { content: ""; display: inline-block; width: 4px; height: 16px; background: linear-gradient(180deg, #6c63ff, #a78bfa); border-radius: 2px; }
  .summary-text { font-size: 13.5px; line-height: 1.8; color: #555; }

  /* Stats grid */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
  .stat-card { background: linear-gradient(135deg, #f5f3ff, #faf9ff); border: 1px solid #e2e0ff; border-radius: 10px; padding: 16px; text-align: center; }
  .stat-card .value { font-size: 24px; font-weight: 800; color: #6c63ff; font-family: 'Segoe UI', system-ui; }
  .stat-card .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 5px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th { background: #f5f3ff; color: #4a4580; font-weight: 600; padding: 10px 14px; text-align: left; border-bottom: 2px solid #e2e0ff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  td { padding: 9px 14px; border-bottom: 1px solid #f0f0f8; color: #444; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #faf9ff; }

  /* Badges */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10.5px; font-weight: 600; }
  .badge-ok      { background: #f0fff4; color: #38a169; border: 1px solid #c6f6d5; }
  .badge-warn    { background: #fff5f5; color: #e53e3e; border: 1px solid #fed7d7; }
  .badge-type    { background: #ebf8ff; color: #2b6cb0; border: 1px solid #bee3f8; font-family: monospace; }
  .badge-strong  { background: #f5f3ff; color: #6c63ff; border: 1px solid #e2e0ff; }
  .badge-mod     { background: #fffbeb; color: #d69e2e; border: 1px solid #faf089; }
  .badge-weak    { background: #f7fafc; color: #718096; border: 1px solid #e2e8f0; }

  /* Heatmap */
  .heatmap-wrap { overflow-x: auto; margin-top: 12px; padding: 16px; background: #fafafa; border-radius: 10px; border: 1px solid #eee; }

  /* Recs */
  ul.recs { list-style: none; padding: 0; margin-top: 4px; }

  /* Footer */
  .footer { background: linear-gradient(135deg, #1a1a2e, #2d2b55); padding: 22px 48px; display: flex; align-items: center; justify-content: space-between; }
  .footer-left { font-size: 11px; color: rgba(255,255,255,0.5); }
  .footer-brand { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.06em; }

  /* Print */
  @media print {
    body { background: white; padding: 0; }
    .container { box-shadow: none; border-radius: 0; }
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .stat-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-logo">
      <div class="header-logo-icon">📊</div>
      <div class="header-logo-text">DataPilot</div>
    </div>
    <h1>Analysis Report</h1>
    <div class="meta">Generated ${date} &nbsp;·&nbsp; Automated Data Analysis</div>
    <div class="file-badge">${fileName}</div>
  </div>

  <div class="body">

    ${narrativeBlock}

    ${exec ? `
    <div class="section">
      <div class="section-title">Executive Summary</div>
      <p class="summary-text">${exec.summary}</p>
      <div class="stats-grid">
        <div class="stat-card"><div class="value">${exec.rows?.toLocaleString()}</div><div class="label">Total Rows</div></div>
        <div class="stat-card"><div class="value">${exec.columns}</div><div class="label">Columns</div></div>
        <div class="stat-card"><div class="value">${exec.missing_values_pct}%</div><div class="label">Missing Data</div></div>
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

    ${statsSection ? `
    <div class="section">
      <div class="section-title">Key Statistics</div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Column</th><th>Mean</th><th>Std Dev</th><th>Min</th><th>25%</th><th>Median</th><th>75%</th><th>Max</th></tr></thead>
          <tbody>${statsSection}</tbody>
        </table>
      </div>
    </div>` : ""}

    ${corrs.length > 0 ? `
    <div class="section">
      <div class="section-title">Correlation Analysis</div>
      <table>
        <thead><tr><th>Column Pair</th><th>Coefficient</th><th>Strength</th></tr></thead>
        <tbody>${corrRows}</tbody>
      </table>
      ${heatmapSVG ? `<div class="heatmap-wrap"><div style="font-size:11px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Correlation Matrix</div>${heatmapSVG}</div>` : ""}
    </div>` : ""}

    ${modelBlock}

    ${fi.length > 0 ? `
    <div class="section">
      <div class="section-title">Feature Importance</div>
      <table>
        <thead><tr><th>Feature</th><th>Importance Score</th></tr></thead>
        <tbody>${fiRows}</tbody>
      </table>
    </div>` : ""}

    ${chartsSection}

    ${recs.length > 0 ? `
    <div class="section">
      <div class="section-title">Recommendations</div>
      <ul class="recs">${recItems}</ul>
    </div>` : ""}

  </div>

  <div class="footer">
    <div class="footer-left">Confidential · For internal use only</div>
    <div class="footer-brand">DataPilot &nbsp;·&nbsp; ${date}</div>
  </div>

</div>
</body>
</html>`;
}

// ── CSV builder ────────────────────────────────────────────────────────────────
function buildCSVReport(report) {
  const rows = [["Section", "Key", "Value"]];
  const sec  = report.sections || {};

  if (sec.executive_summary) {
    const e = sec.executive_summary;
    rows.push(["Executive Summary", "Rows", e.rows]);
    rows.push(["Executive Summary", "Columns", e.columns]);
    rows.push(["Executive Summary", "Missing %", e.missing_values_pct]);
    rows.push(["Executive Summary", "Duplicates", e.duplicate_rows]);
    rows.push(["Executive Summary", "Summary", `"${e.summary}"`]);
  }
  if (sec.statistics) {
    Object.entries(sec.statistics).forEach(([col, s]) => {
      rows.push(["Statistics", `${col} — mean`, s.mean]);
      rows.push(["Statistics", `${col} — std`,  s.std]);
      rows.push(["Statistics", `${col} — min`,  s.min]);
      rows.push(["Statistics", `${col} — max`,  s.max]);
    });
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
      rows.push(["Recommendation", `#${i + 1}`, `"${r}"`]);
    });
  }
  return rows.map(r => r.join(",")).join("\n");
}

function buildJSONReport(report) {
  return JSON.stringify(report, null, 2);
}

// ── NextStepBar ────────────────────────────────────────────────────────────────
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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function PageReport({ setPage }) {
  const {
    sessionId, fileName, modelId,
    savedReport, setSavedReport,
    reportFormat, setReportFormat,
    reportChecked, setReportChecked,
    savedPlots,
    groqKey,
    activeSessionExpired,
  } = useDataPilot();

  const DEFAULT_CHECKED = Object.fromEntries(SECTIONS.map(s => [s.id, s.default]));
  const checked    = reportChecked ?? DEFAULT_CHECKED;
  const setChecked = setReportChecked;
  const format     = reportFormat;
  const setFormat  = setReportFormat;
  const report     = savedReport;
  const setReport  = setSavedReport;

  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState("");

  // Charts from the visualization session
  const completedPlots = (savedPlots || []).filter(p => p.image && !p.error);

  const generate = async () => {
    if (!sessionId || activeSessionExpired) return;
    setGenerating(true);
    setError("");
    try {
      const selectedSections = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
      const res = await fetch(`${API_BASE}/report/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          sections:   selectedSections,
          model_id:   modelId || undefined,
          file_name:  fileName,
          groq_key:   groqKey || undefined,
        }),
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
      content = buildHTMLReport(report, fileName, completedPlots, report.ai_narrative || "");
      mime = "text/html"; ext = "html";
    } else if (format === "CSV") {
      content = buildCSVReport(report);
      mime = "text/csv"; ext = "csv";
    } else {
      content = buildJSONReport(report);
      mime = "application/json"; ext = "json";
    }
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `DataPilot_Report_${fileName?.replace(/\.[^.]+$/, "") || "report"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!report) return;
    const html = buildHTMLReport(report, fileName, completedPlots, report.ai_narrative || "");
    const win  = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  if (!sessionId || activeSessionExpired) {
    return (
      <div className="page-enter">
        <div className="page-header"><div className="page-title">Report Generator</div></div>
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>
            {activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "Upload a dataset first to generate a report."}
          </div>
        </div>
      </div>
    );
  }

  const sec        = report?.sections || {};
  const exec       = sec.executive_summary;
  const recs       = sec.recommendations || [];
  const topCorrs   = sec.correlations?.top_correlations || [];
  const fi         = sec.feature_importance || [];
  const stats      = sec.statistics || {};
  const corrCols   = sec.correlations?.numeric_columns || [];
  const corrMatrix = sec.correlations?.matrix;
  const modelPerf  = sec.model_performance;
  const aiNarrative = report?.ai_narrative || "";

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Report Generator</div>
        <div className="page-subtitle">Auto-generate professional analysis reports from your session</div>
      </div>

      <div className="grid-2 report-layout" style={{ alignItems: "start" }}>

        {/* ── Left: config panel */}
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
                  onClick={() => setChecked({ ...checked, [item.id]: !checked[item.id] })}>
                  {item.label}
                </span>
                {item.id === "model_performance" && !modelId && (
                  <span className="tag tag-amber" style={{ marginLeft: "auto", fontSize: 9 }}>needs model</span>
                )}
              </div>
            ))}

            {/* Charts toggle */}
            {completedPlots.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", marginTop: 4 }}>
                <div style={{ width: 15, height: 15, borderRadius: 4, background: "var(--accent)", border: "1px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d={Icons.check} /></svg>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text)" }}>Generated Charts</span>
                <span className="tag tag-green" style={{ marginLeft: "auto", fontSize: 9 }}>{completedPlots.length} chart{completedPlots.length > 1 ? "s" : ""}</span>
              </div>
            )}
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
              {format === "HTML" ? "Full styled report with tables, heatmap & embedded charts — open in browser or print to PDF" :
               format === "CSV"  ? "Flat data export — open in Excel or Google Sheets" :
               "Raw JSON — for developers or further processing"}
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, fontSize: 12.5, color: "var(--red)" }}>
              {error}
            </div>
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

        {/* ── Right: preview panel */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.eye} /></svg>
              Preview
            </div>
            {report && <span className="tag tag-green">Ready to Export</span>}
          </div>

          {report ? (
            <div className="report-preview" style={{ maxHeight: 620, overflowY: "auto" }}>

              {/* Header strip */}
              <div style={{ background: "linear-gradient(135deg, #1a1a2e, #6c63ff)", borderRadius: 10, padding: "18px 20px", marginBottom: 18, color: "white" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>Analysis Report</div>
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {fileName} · {new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · DataPilot
                </div>
              </div>

              {/* AI Narrative */}
              {aiNarrative && (
                <div style={{ marginBottom: 18, padding: "14px 16px", background: "linear-gradient(135deg, #f5f3ff, #faf9ff)", border: "1px solid #e2e0ff", borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, background: "linear-gradient(135deg,#6c63ff,#a78bfa)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, flexShrink: 0 }}>✦</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#4a4580", textTransform: "uppercase", letterSpacing: "0.08em" }}>Analyst Summary</span>
                    <span style={{ marginLeft: "auto", fontSize: 9, background: "#6c63ff", color: "white", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>AI</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#444", lineHeight: 1.75, fontStyle: "italic" }}>{aiNarrative}</div>
                </div>
              )}

              {/* Generating hint — shown before first report is generated */}
              {!aiNarrative && !report && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(108,99,255,0.06)", border: "1px dashed rgba(108,99,255,0.3)", borderRadius: 8, fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>✦</span>
                  <span>An AI-generated analyst narrative will be included automatically when you generate the report.</span>
                </div>
              )}

              {/* Executive summary */}
              {exec && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Executive Summary</div>
                  <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7, marginBottom: 12 }}>{exec.summary}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    {[["Rows", exec.rows?.toLocaleString()], ["Columns", exec.columns], ["Missing", exec.missing_values_pct + "%"], ["Dupes", exec.duplicate_rows]].map(([label, val]) => (
                      <div key={label} style={{ background: "#f5f3ff", border: "1px solid #e2e0ff", borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#6c63ff", marginTop: 2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Statistics */}
              {Object.keys(stats).length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Key Statistics</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                      <thead>
                        <tr style={{ background: "#f5f3ff" }}>
                          {["Column", "Mean", "Std", "Min", "Median", "Max"].map(h => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#4a4580", fontWeight: 600, borderBottom: "1px solid #e2e0ff", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(stats).map(([col, s]) => (
                          <tr key={col} style={{ borderBottom: "1px solid #f0f0f8" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 500, color: "#333", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</td>
                            <td style={{ padding: "5px 8px", fontFamily: "'DM Mono', monospace", color: "#555" }}>{s.mean !== null ? Number(s.mean).toFixed(2) : "—"}</td>
                            <td style={{ padding: "5px 8px", fontFamily: "'DM Mono', monospace", color: "#555" }}>{s.std  !== null ? Number(s.std ).toFixed(2) : "—"}</td>
                            <td style={{ padding: "5px 8px", fontFamily: "'DM Mono', monospace", color: "#555" }}>{s.min  !== null ? Number(s.min ).toFixed(2) : "—"}</td>
                            <td style={{ padding: "5px 8px", fontFamily: "'DM Mono', monospace", color: "#555" }}>{s["50%"] !== null ? Number(s["50%"]).toFixed(2) : "—"}</td>
                            <td style={{ padding: "5px 8px", fontFamily: "'DM Mono', monospace", color: "#555" }}>{s.max  !== null ? Number(s.max ).toFixed(2) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top Correlations */}
              {topCorrs.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Correlations</div>
                  {topCorrs.slice(0, 6).map((c, i) => {
                    const abs = Math.abs(c.correlation);
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#555", padding: "5px 0", borderBottom: "1px solid #f0f0f8" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{c.col_a} ↔ {c.col_b}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 60, height: 4, background: "#eee", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${abs * 100}%`, background: c.correlation >= 0 ? "#6c63ff" : "#e53e3e", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontWeight: 600, color: c.correlation >= 0 ? "#6c63ff" : "#e53e3e", fontFamily: "'DM Mono', monospace", fontSize: 10.5 }}>{c.correlation}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Inline heatmap preview */}
                  {corrCols.length >= 2 && corrMatrix && (
                    <div style={{ marginTop: 12, overflowX: "auto", fontSize: 10, color: "#888" }}>
                      <div style={{ marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Correlation Heatmap</div>
                      <div dangerouslySetInnerHTML={{ __html: buildCorrelationHeatmapSVG(corrMatrix, corrCols.slice(0, 8)) }} />
                    </div>
                  )}
                </div>
              )}

              {/* Feature Importance */}
              {fi.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Feature Importance</div>
                  {fi.slice(0, 7).map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 10, width: 120, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Mono', monospace" }}>{f.feature}</span>
                      <div style={{ flex: 1, height: 6, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(f.importance / fi[0].importance) * 100}%`, background: "linear-gradient(90deg, #6c63ff, #a78bfa)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, color: "#888", width: 40, textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{f.importance.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Model Performance */}
              {modelPerf && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Model Performance</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                    <div style={{ background: "#f5f3ff", border: "1px solid #e2e0ff", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Algorithm</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#6c63ff", marginTop: 2 }}>{modelPerf.model_type?.toUpperCase()}</div>
                    </div>
                    <div style={{ background: "#f5f3ff", border: "1px solid #e2e0ff", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Task</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#6c63ff", marginTop: 2 }}>{modelPerf.task}</div>
                    </div>
                  </div>
                  {modelPerf.metrics && Object.keys(modelPerf.metrics).length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 6 }}>
                      {Object.entries(modelPerf.metrics).map(([k, v]) => (
                        <div key={k} style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--green)", marginTop: 2 }}>
                            {typeof v === "number" ? (["rmse","mae","mse"].includes(k) ? v.toFixed(3) : k === "r2" ? v.toFixed(3) : v < 1 && v > -1 ? (v * 100).toFixed(1) + "%" : v.toFixed(3)) : v}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(modelPerf.train_size || modelPerf.test_size) && (
                    <div style={{ marginTop: 8, fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                      Trained on {modelPerf.train_size?.toLocaleString()} rows · Tested on {modelPerf.test_size?.toLocaleString()} rows
                    </div>
                  )}
                </div>
              )}

              {/* Charts thumbnails */}
              {completedPlots.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Generated Charts
                    <span style={{ marginLeft: 8, fontSize: 9, background: "#6c63ff", color: "white", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{completedPlots.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {completedPlots.slice(0, 4).map((p, i) => (
                      <div key={i} style={{ border: "1px solid #e2e0ff", borderRadius: 7, overflow: "hidden" }}>
                        <div style={{ padding: "5px 8px", background: "#f5f3ff", fontSize: 9.5, fontWeight: 600, color: "#4a4580", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || p.type || "Chart"}</div>
                        <img src={`data:image/png;base64,${p.image}`} alt={p.title} style={{ width: "100%", display: "block" }} />
                      </div>
                    ))}
                  </div>
                  {completedPlots.length > 4 && (
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>+{completedPlots.length - 4} more charts included in export</div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {recs.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", borderBottom: "2px solid #6c63ff", paddingBottom: 6, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommendations</div>
                  {recs.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, padding: "8px 12px", background: "#f9f9ff", borderLeft: "3px solid #6c63ff", borderRadius: "0 6px 6px 0", fontSize: 11, color: "#555", lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: "#6c63ff", flexShrink: 0 }}>#{i + 1}</span>
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const seed = Math.sin(i * 9301 + 49297);
                const w    = 70 + (seed - Math.floor(seed)) * 30;
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