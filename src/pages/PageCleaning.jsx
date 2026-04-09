import { useState, useEffect, useRef } from "react";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import { Icons } from "../shared/icons.jsx";

// ── icons ────────────────────────────────────────────────────────────────────
const IcoWand   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2m0 14v-2M8 9H2m14 0h-2M4.22 4.22l1.42 1.42M17.36 17.36l1.42 1.42M17.36 6.64l1.42-1.42M4.22 19.78l1.42-1.42"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoRename = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoType   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
const IcoFill   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
const IcoDupe   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
const IcoCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoUndo   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>;
const IcoDown   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
const IcoEncode = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h10M4 12h6M4 17h10" />
    <path d="M17 7l3 3-3 3" />
    <path d="M17 17l3-3-3-3" />
  </svg>
);

const ENCODE_OPTIONS = [
  { value: "label",  label: "Label Encode" },
  { value: "onehot", label: "One-Hot Encode" },
];
const FILL_OPTIONS = [
  { value: "mean",   label: "Mean"          },
  { value: "median", label: "Median"        },
  { value: "mode",   label: "Mode"          },
  { value: "zero",   label: "Zero / Empty"  },
  { value: "ffill",  label: "Forward fill"  },
  { value: "bfill",  label: "Backward fill" },
  { value: "drop",   label: "Drop rows"     },
];

const DTYPE_OPTIONS = [
  { value: "int",      label: "Integer"  },
  { value: "float",    label: "Float"    },
  { value: "str",      label: "String"   },
  { value: "datetime", label: "Datetime" },
  { value: "bool",     label: "Boolean"  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function missingPct(col, summary, rowCount) {
  const s = summary?.[col];
  if (!s || !rowCount) return null;
  const count = parseFloat(s.count);   // non-null count — same as pandas describe()
  if (isNaN(count)) return null;
  const missing = rowCount - count;
  if (missing <= 0) return "0.0";
  return ((missing / rowCount) * 100).toFixed(1);
}

function missingColor(pct) {
  const n = parseFloat(pct);
  if (n === 0)   return "var(--green)";
  if (n < 5)     return "var(--amber)";
  return "var(--red)";
}

function isNumeric(col, summary) {
  return summary?.[col]?.mean !== undefined;
}

// ── operation log item ───────────────────────────────────────────────────────
function LogItem({ op, onUndo }) {
  const icons = {
  fill: <IcoFill />,
  drop_col: <IcoTrash />,
  drop_dupes: <IcoDupe />,
  rename: <IcoRename />,
  cast: <IcoType />,
  encode: <IcoEncode />,
};
return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"var(--bg3)", borderRadius:8, border:"1px solid var(--border)" }}>
      <div style={{ width:24, height:24, borderRadius:6, background:"var(--accent-dim)", border:"1px solid rgba(108,99,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--accent2)", flexShrink:0 }}>
        {icons[op.type] ?? <IcoWand />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:"var(--text)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{op.label}</div>
        <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"'DM Mono',monospace" }}>{op.time}</div>
      </div>
      <button onClick={onUndo} title="Undo" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4, display:"flex", alignItems:"center" }}
        onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
        onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}
      ><IcoUndo /></button>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
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

export default function PageCleaning({ setPage }) {
  const {
    sessionId, columns, summary, fileName, rowCount,
    setColumns, setSummary, setRowCount,
    sessions, activeIdx, setSessions: setSessionsRaw, addSession,
    cleanOpLog,          setCleanOpLog,
    cleanFillStrategies, setCleanFillStrategies,
    cleanRenameMap,      setCleanRenameMap,
    cleanCastMap,        setCleanCastMap,
    cleanEncodeMap,      setCleanEncodeMap,
    cleanPreview,        setCleanPreview,
    cleanPromoted,       setCleanPromoted,
    activeSessionExpired,
  } = useDataPilot();

  // Transient UI state — not persisted
  const [activeTab,   setActiveTab]   = useState("missing");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [downloading, setDownloading] = useState(false);
  const [promoting,   setPromoting]   = useState(false);

  // Tab drag-scroll
  const tabBarRef = useRef(null);
  const tabDrag   = useRef(null);

  // Persisted state — aliases from context
  const opLog            = cleanOpLog;
  const setOpLog         = setCleanOpLog;
  const fillStrategies   = cleanFillStrategies;
  const setFillStrategies= setCleanFillStrategies;
  const renameMap        = cleanRenameMap;
  const setRenameMap     = setCleanRenameMap;
  const castMap          = cleanCastMap;
  const setCastMap       = setCleanCastMap;
  const preview          = cleanPreview;
  const setPreview       = setCleanPreview;
  const promoted         = cleanPromoted;
  const setPromoted      = setCleanPromoted;

  // ── fetch preview on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || activeSessionExpired) return;
    fetch(`${API_BASE}/data/${sessionId}?limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.data && columns?.length ? setPreview({ columns, rows: d.data }) : null)
      .catch(() => null);
  }, [sessionId]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const now = () => new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  const refreshSummary = async (sid) => {
    try {
      const r = await fetch(`${API_BASE}/clean/${sid}/summary`);
      if (!r.ok) return;
      const d = await r.json();
      setSummary(d.summary);
      setColumns(d.columns);
      setRowCount(d.row_count);
      // update sessions list too
      if (setSessionsRaw && activeIdx !== null) {
        setSessionsRaw(prev => {
          const updated = [...prev];
          updated[activeIdx] = { ...updated[activeIdx], summary: d.summary, columns: d.columns, rowCount: d.row_count };
          return updated;
        });
      }
      // refresh preview
      const pr = await fetch(`${API_BASE}/data/${sid}?limit=8`);
      if (pr.ok) {
        const pd = await pr.json();
        if (pd?.data) setPreview({ columns: d.columns, rows: pd.data });
      }
    } catch {}
  };

  const doOp = async (endpoint, body, logEntry) => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const r = await fetch(`${API_BASE}/clean/${sessionId}/${endpoint}`, {
        method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Operation failed");
      setOpLog(prev => [{ ...logEntry, time: now() }, ...prev]);
      setSuccess(d.message || "Done");
      await refreshSummary(sessionId);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async (idx) => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/clean/${sessionId}/undo`, { method:"POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Undo failed");
      setOpLog(prev => prev.filter((_, i) => i !== idx));
      await refreshSummary(sessionId);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };


  const handlePromote = async () => {
    setPromoting(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/clean/${sessionId}/promote`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Promote failed");
      addSession({
        sessionId: d.new_session_id,
        fileName:  fileName.replace(/\.[^.]+$/, "") + "_cleaned" + (fileName.match(/\.[^.]+$/) || [""])[0],
        rowCount:  d.row_count,
        columns:   d.columns,
        summary:   d.summary,
        preview:   null,
      });
      setPromoted(true);
      setSuccess("Cleaned data is now the active dataset across all pages.");
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) {
      setError(e.message);
    } finally {
      setPromoting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const r = await fetch(`${API_BASE}/clean/${sessionId}/export`);
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.[^.]+$/, "") + "_cleaned.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
    finally { setDownloading(false); }
  };

  // ── derived ───────────────────────────────────────────────────────────────
 const safeColumns = Array.isArray(columns) ? columns : [];
const safePreviewColumns = Array.isArray(preview?.columns) ? preview.columns : [];
const safePreviewRows = Array.isArray(preview?.rows) ? preview.rows : [];

const colsWithMissing = safeColumns.filter(
  (c) => parseFloat(missingPct(c, summary, rowCount) ?? 0) > 0
);

const totalMissing = colsWithMissing.length;
const dupCount = summary?.__meta__?.duplicates ?? 0;

const categoricalCols = safeColumns.filter((c) => {
  const s = summary?.[c];
  return s?.top !== undefined || s?.dtype === "object" || s?.dtype === "category";
});

  // ── no session guard ──────────────────────────────────────────────────────
  if (!sessionId || activeSessionExpired) return (
    <div className="page-enter">
      <div className="page-header"><div className="page-title">Data Cleaning</div></div>
      <div className="card" style={{ textAlign:"center", padding:"60px 20px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{ fontSize:14, fontWeight: 500, color:"var(--text)", marginBottom: 6 }}>
          {activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}
        </div>
        <div style={{ fontSize:12, color:"var(--text3)" }}>
          {activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "Upload a dataset first to start cleaning."}
        </div>
      </div>
    </div>
  );

  // ── tabs ──────────────────────────────────────────────────────────────────
 const TABS = [
  { id:"missing",    label:"Missing Values", badge: totalMissing || null },
  { id:"columns",    label:"Columns" },
  { id:"duplicates", label:"Duplicates", badge: dupCount || null },
  { id:"cast",       label:"Data Types" },
  { id:"encoding",   label:"Encoding", badge: categoricalCols.length || null },
];

  return (
    <div className="page-enter" style={{ overflow:"hidden" }}>
      {/* ── header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="page-title">Data Cleaning</div>
          <div className="page-subtitle">Fix quality issues in <strong style={{ color:"var(--text)" }}>{fileName}</strong></div>
        </div>
        <div className="clean-header-btns">
          {opLog.length > 0 && !promoted && (
            <button className="btn-primary" onClick={handlePromote} disabled={promoting}>
              {promoting
                ? <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
              Use Cleaned Data
            </button>
          )}
          {promoted && (
            <span className="tag tag-green" style={{ padding:"7px 12px", fontSize:11 }}>
              ✓ Active Dataset Updated
            </span>
          )}
          {opLog.length > 0 && (
            <button className="btn-secondary" onClick={handleDownload} disabled={downloading}>
              {downloading
                ? <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                : <IcoDown />}
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ── stat strip ── */}
      <div className="grid-4 mb-5 fade-up">
        {[
          { label:"Total Rows",      value: rowCount?.toLocaleString(),   color:"var(--accent2)" },
          { label:"Columns",         value: safeColumns.length,               color:"var(--cyan)"    },
          { label:"Cols w/ Missing", value: totalMissing,                 color: totalMissing > 0 ? "var(--amber)" : "var(--green)" },
          { label:"Duplicate Rows",  value: dupCount?.toLocaleString?.() ?? dupCount, color: dupCount > 0 ? "var(--red)" : "var(--green)" },
        ].map((s, i) => (
          <div key={i} className="stat-block">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize:20, color:s.color }}>{s.value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16, alignItems:"start", minWidth:0, overflow:"hidden" }} className="cleaning-layout">

        {/* ── left: operations panel ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14, minWidth:0, overflow:"hidden" }}>

          {/* feedback */}
          {error && (
            <div style={{ padding:"10px 14px", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:10, fontSize:12.5, color:"var(--red)" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding:"10px 14px", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, fontSize:12.5, color:"var(--green)", display:"flex", alignItems:"center", gap:8 }}>
              <IcoCheck /> {success}
            </div>
          )}

          {/* tab bar */}
          <div className="card" style={{ padding:0, overflow:"hidden", minWidth:0 }}>
            <div
              className="codegen-tabs"
              style={{ borderBottom:"1px solid var(--border)", background:"var(--bg2)", cursor:"grab" }}
              ref={tabBarRef}
              onMouseDown={e => {
                tabDrag.current = { active:true, startX: e.pageX - tabBarRef.current.offsetLeft, scrollLeft: tabBarRef.current.scrollLeft };
                tabBarRef.current.style.cursor = "grabbing";
              }}
              onMouseLeave={() => { if (tabDrag.current?.active) { tabDrag.current.active = false; tabBarRef.current.style.cursor = "grab"; } }}
              onMouseUp={()    => { if (tabDrag.current)         { tabDrag.current.active = false; tabBarRef.current.style.cursor = "grab"; } }}
              onMouseMove={e  => {
                if (!tabDrag.current?.active) return;
                e.preventDefault();
                tabBarRef.current.scrollLeft = tabDrag.current.scrollLeft - (e.pageX - tabBarRef.current.offsetLeft - tabDrag.current.startX);
              }}
            >
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{
                    flexShrink:0, padding:"12px 16px", background:"none", border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:500, whiteSpace:"nowrap",
                    color: activeTab===t.id ? "var(--text)" : "var(--text3)",
                    borderBottom: activeTab===t.id ? "2px solid var(--accent)" : "2px solid transparent",
                    transition:"all 0.15s", display:"flex", alignItems:"center", gap:5,
                    fontFamily:"'DM Sans',sans-serif",
                  }}>
                  {t.label}
                  {t.badge != null && t.badge > 0 && (
                    <span style={{ background:"rgba(248,113,113,0.15)", color:"var(--red)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:10, fontSize:9, padding:"1px 5px", fontFamily:"'DM Mono',monospace" }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding:20 }}>

              {/* ── MISSING VALUES ── */}
              {activeTab === "missing" && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {colsWithMissing.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"30px 0", color:"var(--green)", fontSize:13 }}>
                      <IcoCheck /> &nbsp;No missing values detected
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>
                        Set a fill strategy per column, then apply individually or all at once.
                      </div>
                      {colsWithMissing.map(col => {
                        const pct     = missingPct(col, summary, rowCount);
                        const numeric = isNumeric(col, summary);
                        const opts    = numeric
                          ? FILL_OPTIONS
                          : FILL_OPTIONS.filter(o => !["mean","median"].includes(o.value));
                        const strategy = fillStrategies[col] ?? (numeric ? "mean" : "mode");
                        return (
                          <div key={col} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border)" }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12.5, fontWeight:500, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col}</div>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                                <div style={{ height:3, width:60, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:`${pct}%`, background:missingColor(pct), borderRadius:3 }} />
                                </div>
                                <span style={{ fontSize:10, color:missingColor(pct), fontFamily:"'DM Mono',monospace" }}>{pct}% missing</span>
                              </div>
                            </div>
                            <select className="input-field" value={strategy}
                              onChange={e => setFillStrategies(p => ({ ...p, [col]: e.target.value }))}
                              style={{ width:130, padding:"6px 8px", fontSize:11.5, cursor:"pointer", flexShrink:0 }}>
                              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button className="btn-primary" disabled={busy}
                              onClick={() => doOp("fill_missing", { column: col, strategy }, { type:"fill", label:`Fill "${col}" with ${strategy}` })}
                              style={{ padding:"6px 12px", fontSize:12, flexShrink:0 }}>
                              Apply
                            </button>
                          </div>
                        );
                      })}
                      <button className="btn-secondary" disabled={busy}
                        style={{ justifyContent:"center" }}
                        onClick={() => {
                          const strategies = Object.fromEntries(
                            colsWithMissing.map(c => [c, fillStrategies[c] ?? (isNumeric(c,summary) ? "mean" : "mode")])
                          );
                          doOp("fill_all_missing", { strategies }, { type:"fill", label:`Fill all ${colsWithMissing.length} columns` });
                        }}>
                        <IcoWand /> Apply All Strategies
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── COLUMNS ── */}
              {activeTab === "columns" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>Rename or drop individual columns.</div>
                  {safeColumns.map(col => {
                    const pct = missingPct(col, summary, rowCount);
                    return (
                      <div key={col} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border)" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, color:"var(--text2)", fontFamily:"'DM Mono',monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col}</div>
                          {pct !== null && <div style={{ fontSize:10, color:"var(--text3)" }}>{pct}% missing</div>}
                        </div>
                        <input
                          className="input-field"
                          placeholder="New name…"
                          value={renameMap[col] ?? ""}
                          onChange={e => setRenameMap(p => ({ ...p, [col]: e.target.value }))}
                          style={{ width:120, padding:"5px 8px", fontSize:12 }}
                          onKeyDown={e => {
                            if (e.key === "Enter" && renameMap[col]?.trim()) {
                              doOp("rename_column", { old_name: col, new_name: renameMap[col].trim() },
                                { type:"rename", label:`Rename "${col}" → "${renameMap[col].trim()}"` });
                              setRenameMap(p => { const n = {...p}; delete n[col]; return n; });
                            }
                          }}
                        />
                        <button className="btn-secondary" disabled={busy || !renameMap[col]?.trim()}
                          onClick={() => {
                            doOp("rename_column", { old_name: col, new_name: renameMap[col].trim() },
                              { type:"rename", label:`Rename "${col}" → "${renameMap[col].trim()}"` });
                            setRenameMap(p => { const n = {...p}; delete n[col]; return n; });
                          }}
                          style={{ padding:"5px 10px", fontSize:12 }}>
                          <IcoRename />
                        </button>
                        <button disabled={busy}
                          onClick={() => doOp("drop_column", { column: col }, { type:"drop_col", label:`Drop column "${col}"` })}
                          style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:7, padding:"5px 10px", cursor:"pointer", color:"var(--red)", display:"flex", alignItems:"center" }}
                          onMouseEnter={e => e.currentTarget.style.background="rgba(248,113,113,0.15)"}
                          onMouseLeave={e => e.currentTarget.style.background="rgba(248,113,113,0.08)"}>
                          <IcoTrash />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── DUPLICATES ── */}
              {activeTab === "duplicates" && (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ padding:"16px", background:"var(--bg3)", borderRadius:10, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"var(--text)", marginBottom:4 }}>
                      {dupCount > 0 ? `${dupCount} duplicate rows found` : "No duplicate rows detected"}
                    </div>
                    <div style={{ fontSize:12, color:"var(--text3)" }}>
                      {dupCount > 0 ? "Duplicate rows are exact matches across all columns." : "Your dataset has no exact-duplicate rows."}
                    </div>
                  </div>
                  {dupCount > 0 && (
                    <button className="btn-primary" disabled={busy} style={{ justifyContent:"center" }}
                      onClick={() => doOp("drop_duplicates", {}, { type:"drop_dupes", label:`Removed ${dupCount} duplicate rows` })}>
                      <IcoDupe /> Remove {dupCount} Duplicate{dupCount !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              )}

              {/* ── CAST TYPES ── */}
              {activeTab === "cast" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>Change the data type of a column. Use with care — casting may introduce nulls.</div>
                  {safeColumns.map(col => {
                    const s    = summary?.[col];
                    const curr = s?.dtype ?? "unknown";
                    return (
                      <div key={col} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border)" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, color:"var(--text)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col}</div>
                          <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"'DM Mono',monospace" }}>{curr}</span>
                        </div>
                        <select className="input-field" value={castMap[col] ?? ""}
                          onChange={e => setCastMap(p => ({ ...p, [col]: e.target.value }))}
                          style={{ width:120, padding:"5px 8px", fontSize:12, cursor:"pointer" }}>
                          <option value="">— Cast to —</option>
                          {DTYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button className="btn-secondary" disabled={busy || !castMap[col]}
                          onClick={() => {
                            doOp("cast_column", { column: col, dtype: castMap[col] },
                              { type:"cast", label:`Cast "${col}" → ${castMap[col]}` });
                            setCastMap(p => { const n = {...p}; delete n[col]; return n; });
                          }}
                          style={{ padding:"5px 10px", fontSize:12 }}>
                          <IcoType />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeTab === "encoding" && (
  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
    <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>
      Encode categorical columns before modeling. Use label encoding for tree models and one-hot encoding when you want separate binary columns.
    </div>

    {categoricalCols.length === 0 ? (
      <div style={{ textAlign:"center", padding:"30px 0", color:"var(--green)", fontSize:13 }}>
        <IcoCheck /> &nbsp;No categorical columns detected
      </div>
    ) : (
      categoricalCols.map((col) => {
        const current = cleanEncodeMap[col] ?? "label";
        const uniqueCount = summary?.[col]?.unique ?? "—";
        const topValue = summary?.[col]?.top ?? "—";

        return (
          <div
            key={col}
            style={{
              display:"flex",
              alignItems:"center",
              gap:8,
              padding:"10px 12px",
              background:"var(--bg3)",
              borderRadius:9,
              border:"1px solid var(--border)",
            }}
          >
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:500, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {col}
              </div>
              <div style={{ fontSize:10.5, color:"var(--text3)", fontFamily:"'DM Mono', monospace", marginTop:2 }}>
                {uniqueCount} unique · top: {String(topValue)}
              </div>
            </div>

            <select
              className="input-field"
              value={current}
              onChange={(e) => setCleanEncodeMap((prev) => ({ ...prev, [col]: e.target.value }))}
              style={{ width:140, padding:"6px 8px", fontSize:11.5, cursor:"pointer", flexShrink:0 }}
            >
              {ENCODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                doOp(
                  "encode_column",
                  { column: col, strategy: current },
                  { type:"encode", label:`Encode "${col}" with ${current}` }
                );
                setCleanEncodeMap((prev) => {
                  const next = { ...prev };
                  delete next[col];
                  return next;
                });
              }}
              style={{ padding:"6px 12px", fontSize:12, flexShrink:0 }}
            >
              <IcoEncode />
              Apply
            </button>
          </div>
        );
      })
    )}
  </div>
)}
            </div>
          </div>
        </div>

        {/* ── right: log + preview ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14, minWidth:0 }}>

          {/* operation log */}
          <div className="card">
            <div className="card-title">
              <IcoWand /> Operation Log
              {opLog.length > 0 && (
                <span className="tag tag-blue" style={{ marginLeft:"auto" }}>{opLog.length} ops</span>
              )}
            </div>
            {opLog.length === 0 ? (
              <div style={{ fontSize:12, color:"var(--text3)", textAlign:"center", padding:"20px 0" }}>
                No operations yet. Start cleaning your data.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:7, maxHeight:300, overflowY:"auto" }}>
                {opLog.map((op, i) => (
                  <LogItem key={i} op={op} onUndo={() => handleUndo(i)} />
                ))}
              </div>
            )}
          </div>

          {/* data preview */}
{safePreviewColumns.length > 0 && safePreviewRows.length > 0 && (
  <div className="card">
    <div className="card-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={Icons.eye} />
      </svg>
      Live Preview
      <span className="tag tag-green" style={{ marginLeft:"auto" }}>8 rows</span>
    </div>

    <div style={{ overflowX:"auto" }}>
      <table className="data-table" style={{ minWidth:"max-content" }}>
        <thead>
          <tr>{safePreviewColumns.slice(0,6).map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {safePreviewRows.slice(0,8).map((row, i) => (
            <tr key={i}>
              {safePreviewColumns.slice(0,6).map(col => (
                <td key={col}>
                  {row[col] == null || row[col] === ""
                    ? <span style={{ color:"var(--red)", fontSize:10 }}>null</span>
                    : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {safePreviewColumns.length > 6 && (
        <div style={{ marginTop:8, fontSize:10 }}>
          Showing 6 of {safePreviewColumns.length} columns
        </div>
      )}
    </div>
  </div>
)}

        </div>
      </div>
      <NextStepBar label="Ask DataPilot" to="/insights" setPage={setPage} note="Next: ask natural language questions about your cleaned data" />
    </div>
  );
}