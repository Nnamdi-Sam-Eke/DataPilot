import { useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

const PLOT_TYPES = [
  { id: "hist",       label: "Histogram",          group: "Distribution",  needsX: true,  needsY: false },
  { id: "density",    label: "Density / KDE",       group: "Distribution",  needsX: true,  needsY: false },
  { id: "box",        label: "Box Plot",            group: "Distribution",  needsX: true,  needsY: false },
  { id: "violin",     label: "Violin",              group: "Distribution",  needsX: true,  needsY: false },
  { id: "count",      label: "Count Plot",          group: "Distribution",  needsX: true,  needsY: false },
  { id: "scatter",    label: "Scatter",             group: "Relational",    needsX: true,  needsY: true  },
  { id: "line",       label: "Line",                group: "Relational",    needsX: true,  needsY: true  },
  { id: "regression", label: "Regression",          group: "Relational",    needsX: true,  needsY: true  },
  { id: "bubble",     label: "Bubble",              group: "Relational",    needsX: true,  needsY: true  },
  { id: "area",       label: "Area",                group: "Relational",    needsX: true,  needsY: true  },
  { id: "moving_avg", label: "Moving Average",      group: "Relational",    needsX: true,  needsY: true  },
  { id: "bar",        label: "Bar Chart",           group: "Categorical",   needsX: true,  needsY: true  },
  { id: "strip",      label: "Strip Plot",          group: "Categorical",   needsX: true,  needsY: false },
  { id: "pie",        label: "Pie Chart",           group: "Part-of-Whole", needsX: true,  needsY: false },
  { id: "donut",      label: "Donut Chart",         group: "Part-of-Whole", needsX: true,  needsY: false },
  { id: "heatmap",    label: "Correlation Heatmap", group: "Matrix",        needsX: false, needsY: false },
  { id: "pairplot",   label: "Pair Plot",           group: "Matrix",        needsX: false, needsY: false },
];

const GROUPS = [...new Set(PLOT_TYPES.map((p) => p.group))];

const COLOR_SCHEMES = [
  { id: "deep",     label: "Deep"     },
  { id: "muted",    label: "Muted"    },
  { id: "pastel",   label: "Pastel"   },
  { id: "viridis",  label: "Viridis"  },
  { id: "plasma",   label: "Plasma"   },
  { id: "coolwarm", label: "Coolwarm" },
  { id: "magma",    label: "Magma"    },
];

function Lightbox({ src, title, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position:"relative", maxWidth:"90vw", maxHeight:"90vh" }}>
        <button onClick={onClose} style={{ position:"absolute", top:-36, right:0, background:"none", border:"none", color:"white", fontSize:28, cursor:"pointer" }}>×</button>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginBottom:8, fontFamily:"'DM Mono',monospace" }}>{title}</div>
        <img src={src} alt={title} style={{ maxWidth:"100%", maxHeight:"80vh", borderRadius:10, display:"block" }} />
        <a href={src} download={`${title || "chart"}.png`} style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:12, padding:"7px 14px", background:"rgba(108,99,255,0.8)", color:"white", borderRadius:7, fontSize:12, textDecoration:"none" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
          Download PNG
        </a>
      </div>
    </div>
  );
}

function PlotCard({ plot, onRemove, onExpand }) {
  return (
    <div className="card" style={{ position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", fontFamily:"'Syne',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          {plot.title || plot.type}
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          {plot.image && (
            <button onClick={() => onExpand(plot)} style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:6, cursor:"pointer", color:"var(--text2)", padding:"4px 8px", fontSize:11 }}>
              ⤢ Expand
            </button>
          )}
          <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", fontSize:18, padding:"0 4px", lineHeight:1 }}>×</button>
        </div>
      </div>
      {plot.loading && (
        <div style={{ height:200, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
          <span style={{ fontSize:12, color:"var(--text3)" }}>Generating…</span>
        </div>
      )}
      {plot.error && (
        <div style={{ padding:"12px 14px", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, fontSize:12, color:"var(--red)" }}>{plot.error}</div>
      )}
      {plot.image && (
        <img src={`data:image/png;base64,${plot.image}`} alt={plot.title} onClick={() => onExpand(plot)} style={{ width:"100%", borderRadius:8, cursor:"zoom-in", display:"block" }} />
      )}
    </div>
  );
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

export default function PageVisualization({ setPage }) {
  const { sessionId, columns, savedPlots, setSavedPlots, activeSessionExpired, sessions, userProfile, user } = useDataPilot();
  const plan  = (userProfile?.plan || "free").toLowerCase();
  const isPro = plan === "pro";
  const [plotType,    setPlotType]    = useState("hist");
  const [xCol,        setXCol]        = useState("");
  const [yCol,        setYCol]        = useState("");
  const [hueCol,      setHueCol]      = useState("");
  const [colorScheme, setColorScheme] = useState("deep");
  const [bins,        setBins]        = useState(30);
  const [building,    setBuilding]    = useState(false);
  const [lightbox,    setLightbox]    = useState(null);
  const [activeGroup, setActiveGroup] = useState("Distribution");

  // Compare mode
  const [compareMode,    setCompareMode]    = useState(false);
  const [compareSession, setCompareSession] = useState("");  // second session id to compare against
  const [showProNudge,   setShowProNudge]   = useState(false);
  const selectedType = PLOT_TYPES.find((p) => p.id === plotType);

  const downloadAll = async () => {
    const completed = savedPlots.filter(p => p.image && !p.error);
    if (!completed.length) return;

    const COLS    = 2;
    const CELL_W  = 460;
    const IMG_H   = 340;
    const TITLE_H = 36;
    const GAP     = 16;
    const PAD     = 32;
    const HEADER  = 48;
    const cardH   = TITLE_H + IMG_H;

    const rrect = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y,         x + r, y);
      ctx.closePath();
    };

    const rows    = Math.ceil(completed.length / COLS);
    const canvasW = PAD + COLS * CELL_W + (COLS - 1) * GAP + PAD;
    const canvasH = HEADER + PAD + rows * cardH + (rows - 1) * GAP + PAD;

    const canvas  = document.createElement("canvas");
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx     = canvas.getContext("2d");

    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = "#0c0f18";
    ctx.fillRect(0, 0, canvasW, HEADER);
    ctx.fillStyle = "#6c63ff";
    ctx.fillRect(0, 0, 4, HEADER);
    ctx.fillStyle = "#e8eaf0";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText("DataPilot — Visualization Export", PAD + 8, 30);
    ctx.fillStyle = "#8b90a0";
    ctx.font = "10px monospace";
    const meta = `${completed.length} chart${completed.length !== 1 ? "s" : ""} · ${new Date().toLocaleDateString()}`;
    ctx.fillText(meta, canvasW - PAD - ctx.measureText(meta).width, 30);

    for (let i = 0; i < completed.length; i++) {
      const plot    = completed[i];
      const col     = i % COLS;
      const row     = Math.floor(i / COLS);
      const isAlone = completed.length % 2 !== 0 && i === completed.length - 1;
      const cellW   = isAlone ? COLS * CELL_W + GAP : CELL_W;
      const cellX   = PAD + col * (CELL_W + GAP);
      const cellY   = HEADER + PAD + row * (cardH + GAP);

      ctx.fillStyle = "#0c0f18";
      rrect(ctx, cellX, cellY, cellW, cardH, 8);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      rrect(ctx, cellX, cellY, cellW, cardH, 8);
      ctx.stroke();

      ctx.fillStyle = "rgba(108,99,255,0.18)";
      rrect(ctx, cellX + 8, cellY + 8, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#a78bfa";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), cellX + 18, cellY + 22);
      ctx.textAlign = "left";

      ctx.fillStyle = "#e8eaf0";
      ctx.font = "bold 11px Arial, sans-serif";
      let title = plot.title || plot.type || "Chart";
      const maxW = cellW - 80;
      while (ctx.measureText(title).width > maxW && title.length > 4) title = title.slice(0, -1);
      if (title.length < (plot.title || "").length) title += "…";
      ctx.fillText(title, cellX + 34, cellY + 22);

      ctx.fillStyle = "#4a4f62";
      ctx.font = "9px monospace";
      ctx.fillText((plot.type || "").toUpperCase(), cellX + cellW - 52, cellY + 22);

      await new Promise((resolve) => {
        const img   = new Image();
        img.onload  = () => { ctx.drawImage(img, cellX + 4, cellY + TITLE_H, cellW - 8, IMG_H - 4); resolve(); };
        img.onerror = () => resolve();
        img.src     = `data:image/png;base64,${plot.image}`;
      });
    }

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `datapilot_charts_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const generatePlot = async () => {
    if (!sessionId || activeSessionExpired) return;
    const plotConfig = {
      type: plotType,
      x: xCol || undefined,
      y: yCol || undefined,
      hue: hueCol || undefined,
      title: `${selectedType?.label}${xCol ? ` — ${xCol}` : ""}${yCol ? ` vs ${yCol}` : ""}${compareMode && compareSession ? " (Compare)" : ""}`,
      customizations: { color_scheme: colorScheme, bins, grid: true, legend: true },
    };
    const tempId = Date.now();
    setSavedPlots((p) => [{ id: tempId, ...plotConfig, loading: true }, ...p]);
    setBuilding(true);
    try {
      // Backend derives plan (and the compare-mode Pro gate) from the
      // verified auth token, so every /plots/ call needs it or it 401s.
      const plotHeaders = { "Content-Type": "application/json" };
      if (user) {
        plotHeaders.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      if (compareMode && compareSession && isPro) {
        // Compare mode: fetch data for both sessions, send together
        const [res1, res2] = await Promise.all([
          fetch(`${API_BASE}/data/${sessionId}?limit=5000`),
          fetch(`${API_BASE}/data/${compareSession}?limit=5000`),
        ]);
        if (!res1.ok || !res2.ok) throw new Error("Failed to fetch session data");
        const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
        const s1 = sessions.find(s => s.sessionId === sessionId);
        const s2 = sessions.find(s => s.sessionId === compareSession);
        const res = await fetch(`${API_BASE}/plots/`, {
          method: "POST",
          headers: plotHeaders,
          body: JSON.stringify({
            compareMode: true,
            plan,
            compareData: [
              { data: d1.data, name: s1?.fileName || "Dataset 1" },
              { data: d2.data, name: s2?.fileName || "Dataset 2" },
            ],
            plots: [plotConfig],
            session_id: sessionId,
          }),
        });
        const result     = await res.json();
        const plotResult = result.plots?.[0];
        setSavedPlots((p) => p.map((pl) => (pl.id === tempId ? { ...pl, loading: false, image: plotResult?.image, error: plotResult?.error } : pl)));
      } else {
        // Single dataset mode
        const dataRes = await fetch(`${API_BASE}/data/${sessionId}?limit=5000`);
        if (!dataRes.ok) throw new Error("Failed to fetch session data");
        const dataJson = await dataRes.json();
        const res = await fetch(`${API_BASE}/plots/`, {
          method: "POST",
          headers: plotHeaders,
          body: JSON.stringify({ data: dataJson.data, plots: [plotConfig], plan, session_id: sessionId }),
        });
        const result    = await res.json();
        const plotResult = result.plots?.[0];
        setSavedPlots((p) => p.map((pl) => (pl.id === tempId ? { ...pl, loading: false, image: plotResult?.image, error: plotResult?.error } : pl)));
      }
    } catch (e) {
      setSavedPlots((p) => p.map((pl) => (pl.id === tempId ? { ...pl, loading: false, error: e.message } : pl)));
    } finally {
      setBuilding(false);
    }
  };

  if (!sessionId || activeSessionExpired) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <div className="page-title">Visualizations</div>
          <div className="page-subtitle">
            {activeSessionExpired ? "Session expired — re-upload your dataset to continue" : "Upload a dataset to start generating charts"}
          </div>
        </div>
        <div className="card" style={{ textAlign:"center", padding:"60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div style={{ fontSize:14, fontWeight: 500, color:"var(--text)", marginBottom: 6 }}>
            {activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}
          </div>
          <div style={{ fontSize:12, color:"var(--text3)" }}>
            {activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "No dataset loaded. Please upload a file first."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      {lightbox && <Lightbox src={`data:image/png;base64,${lightbox.image}`} title={lightbox.title} onClose={() => setLightbox(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="page-title">Visualizations</div>
          <div className="page-subtitle">Explore patterns and relationships in your data</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {savedPlots.filter(p => p.image).length > 1 && (
            <button className="btn-secondary" onClick={downloadAll}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
              Download All
            </button>
          )}
          {savedPlots.length > 0 && (
            <button className="btn-secondary" onClick={() => setSavedPlots([])}>
              Clear All
            </button>
          )}
        </div>
      </div>

      <div className="card mb-5 fade-up">
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.plus} /></svg>
          Chart Builder
        </div>

        {/* Compare mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 12px", borderRadius: 9, background: "var(--bg3)", border: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
              Compare Mode
              {!isPro && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 4, padding: "1px 5px" }}>PRO</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              {isPro ? "Overlay charts from two datasets side by side" : "Upgrade to Pro to compare multiple datasets"}
            </div>
          </div>
          <button
            onClick={() => {
              if (!isPro) { setShowProNudge(v => !v); return; }
              setCompareMode(v => !v);
              setCompareSession("");
            }}
            style={{
              flexShrink: 0, width: 40, height: 22, borderRadius: 11,
              border: "none", cursor: isPro ? "pointer" : "not-allowed",
              background: compareMode && isPro ? "var(--accent)" : "var(--border2)",
              position: "relative", transition: "background 0.2s",
              opacity: isPro ? 1 : 0.6,
            }}
          >
            <div style={{
              position: "absolute", top: 3,
              left: compareMode && isPro ? 21 : 3,
              width: 16, height: 16, borderRadius: "50%",
              background: "white", transition: "left 0.2s",
            }} />
          </button>
        </div>

        {/* Pro nudge for compare mode */}
        {showProNudge && !isPro && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "rgba(108,99,255,0.07)", border: "1px solid rgba(108,99,255,0.2)", fontSize: 12, color: "var(--text2)" }}>
            🔒 <strong>Compare Mode</strong> is a Pro feature. Upgrade to overlay charts from multiple datasets and spot differences instantly.
          </div>
        )}

        {/* Compare session picker — shown when compare mode is on */}
        {compareMode && isPro && (() => {
          const otherSessions = sessions.filter(s => s.sessionId !== sessionId && !s.expired);
          const selectedCompare = otherSessions.find(s => s.sessionId === compareSession);
          const currentCols = new Set(columns);
          const incompatibleCols = selectedCompare
            ? (selectedCompare.columns || []).filter(c => !currentCols.has(c))
            : [];
          const missingFromCompare = selectedCompare
            ? columns.filter(c => !(selectedCompare.columns || []).includes(c))
            : [];

          return (
            <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 9, background: "rgba(108,99,255,0.07)", border: "1px solid rgba(108,99,255,0.2)" }}>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Compare against
              </div>
              <select
                className="input-field"
                value={compareSession}
                onChange={e => setCompareSession(e.target.value)}
                style={{ cursor: "pointer", fontSize: 13 }}
              >
                <option value="">— Select second dataset —</option>
                {otherSessions.map(s => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.fileName} · {s.rowCount?.toLocaleString()} rows
                  </option>
                ))}
              </select>
              {otherSessions.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 6 }}>
                  ⚠ Upload a second dataset to enable comparison
                </div>
              )}
              {selectedCompare && missingFromCompare.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 6, lineHeight: 1.5 }}>
                  ⚠ Column mismatch: <strong>{missingFromCompare.slice(0, 3).join(", ")}{missingFromCompare.length > 3 ? ` +${missingFromCompare.length - 3} more` : ""}</strong> exist in the primary dataset but not in the comparison dataset. Charts using these columns will error.
                </div>
              )}
              {selectedCompare && missingFromCompare.length === 0 && incompatibleCols.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--green)", marginTop: 6 }}>
                  ✓ Column schemas match — comparison is ready
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
          <div style={{ display:"flex", gap:6, minWidth: "max-content" }}>
          {GROUPS.map((g) => (
            <button key={g} onClick={() => setActiveGroup(g)}
              style={{ padding:"5px 12px", borderRadius:6, cursor:"pointer", fontSize:11.5, fontWeight:500,
                background: activeGroup === g ? "var(--accent)" : "var(--bg3)",
                color: activeGroup === g ? "white" : "var(--text2)",
                border: `1px solid ${activeGroup === g ? "transparent" : "var(--border)"}`,
                transition:"all 0.15s", whiteSpace: "nowrap" }}>
              {g}
            </button>
          ))}
          </div>
        </div>

        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          {PLOT_TYPES.filter((p) => p.group === activeGroup).map((p) => (
            <button key={p.id} onClick={() => setPlotType(p.id)}
              style={{ padding:"6px 12px", borderRadius:7, cursor:"pointer", fontSize:12,
                background: plotType === p.id ? "var(--accent-dim)" : "var(--bg3)",
                color: plotType === p.id ? "var(--accent2)" : "var(--text2)",
                border: `1px solid ${plotType === p.id ? "rgba(108,99,255,0.3)" : "var(--border)"}`,
                transition:"all 0.15s" }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="viz-controls-horizontal"
          style={{ display:"flex", flexDirection:"row", flexWrap:"nowrap", gap:12, alignItems:"flex-end", overflowX:"auto", paddingBottom:6, marginBottom:12, scrollbarWidth:"thin", msOverflowStyle:"none" }}>
          {[
            { label:"X Column",     val:xCol,        set:setXCol,        dis:!selectedType?.needsX },
            { label:"Y Column",     val:yCol,        set:setYCol,        dis:!selectedType?.needsY },
            { label:"Hue/Color By", val:hueCol,      set:setHueCol,      dis:false, none:true },
            { label:"Color Scheme", val:colorScheme, set:setColorScheme, dis:false, opts:COLOR_SCHEMES },
          ].map((c, i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column", gap:5, minWidth:140, flexShrink:0 }}>
              <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>{c.label}</div>
              <select className="input-field viz-select" value={c.val} onChange={(e) => c.set(e.target.value)}
                style={{ cursor:c.dis ? "not-allowed" : "pointer", opacity:c.dis ? 0.4 : 1, minWidth:0, fontSize:13 }}
                disabled={c.dis}>
                <option value="">{c.none ? "— None —" : "— Select —"}</option>
                {c.opts
                  ? c.opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)
                  : columns.map((col) => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>
          ))}
          <button className="btn-primary" onClick={generatePlot}
            disabled={building || (selectedType?.needsX && !xCol) || (compareMode && isPro && !compareSession)}
            style={{ whiteSpace:"nowrap", height:38, flexShrink:0, marginLeft:"auto", minWidth:110 }}>
            {building
              ? <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.sparkle} /></svg>}
            Generate
          </button>
        </div>

        {plotType === "hist" && (
          <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace" }}>Bins: {bins}</span>
            <input type="range" min="5" max="100" step="5" value={bins} onChange={(e) => setBins(Number(e.target.value))}
              style={{ flex:1, maxWidth:160, accentColor:"var(--accent)" }} />
          </div>
        )}
      </div>

      {savedPlots.length === 0 ? (
        <div className="card" style={{ textAlign:"center", padding:"50px 20px" }}>
          <div style={{ fontSize:13, color:"var(--text3)" }}>Select a chart type and columns above, then click Generate.</div>
        </div>
      ) : (
        <div className="grid-2">
          {savedPlots.map((plot) => (
            <PlotCard key={plot.id} plot={plot}
              onRemove={() => setSavedPlots((p) => p.filter((pl) => pl.id !== plot.id))}
              onExpand={(p) => setLightbox(p)} />
          ))}
        </div>
      )}
      <NextStepBar label="Train a Model" to="/train" setPage={setPage} note="Next: select a target column and train an ML model" />
    </div>
  );
}