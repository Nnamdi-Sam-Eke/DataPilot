import { useState, useEffect, useRef } from "react";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import { Icons } from "../shared/icons.jsx";

// ── icons ─────────────────────────────────────────────────────────────────────
const IcoWand    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2m0 14v-2M8 9H2m14 0h-2M4.22 4.22l1.42 1.42M17.36 17.36l1.42 1.42M17.36 6.64l1.42-1.42M4.22 19.78l1.42-1.42"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoTrash   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoRename  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoType    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
const IcoFill    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
const IcoDupe    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
const IcoCheck   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoUndo    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>;
const IcoDown    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
const IcoEncode  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h10M4 12h6M4 17h10"/><path d="M17 7l3 3-3 3"/><path d="M17 17l3-3-3-3"/></svg>;
const IcoOutlier = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="11" cy="10" r="2"/><circle cx="19" cy="5" r="2"/><path d="M3 20l4-6M10 16l2-4M13 12l4-5"/></svg>;
const IcoStrOp   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="14" x2="22" y2="14"/><line x1="20" y1="12" x2="20" y2="16"/></svg>;
const IcoFilter  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
const IcoSwap    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>;
const IcoBin     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/><line x1="2"  y1="20" x2="22" y2="20"/></svg>;
const IcoFormula = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H7a2 2 0 00-2 2v5a2 2 0 01-2 2 2 2 0 012 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 012 2v5a2 2 0 002 2 2 2 0 00-2 2v5a2 2 0 01-2 2h-1"/></svg>;
const IcoScale   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M5 8l14 0"/><path d="M3 12l4 4 4-4"/><path d="M17 12l2 4 2-4"/></svg>;
const IcoParse   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
const IcoCal     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8"  y1="2" x2="8"  y2="6"/><line x1="3"  y1="10" x2="21" y2="10"/></svg>;

// ── option sets ───────────────────────────────────────────────────────────────
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
const FILTER_OPS = [
  { value: "eq",         label: "= equals",       needsVal: true  },
  { value: "ne",         label: "≠ not equals",   needsVal: true  },
  { value: "gt",         label: "> greater than", needsVal: true  },
  { value: "lt",         label: "< less than",    needsVal: true  },
  { value: "gte",        label: "≥ ≥ or equal",   needsVal: true  },
  { value: "lte",        label: "≤ ≤ or equal",   needsVal: true  },
  { value: "contains",   label: "contains",        needsVal: true  },
  { value: "startswith", label: "starts with",     needsVal: true  },
  { value: "endswith",   label: "ends with",       needsVal: true  },
  { value: "isnull",     label: "is null",         needsVal: false },
  { value: "notnull",    label: "is not null",     needsVal: false },
];
const STRING_OPS = [
  { value: "trim",          label: "Trim whitespace"     },
  { value: "lower",         label: "Lowercase"           },
  { value: "upper",         label: "Uppercase"           },
  { value: "title",         label: "Title Case"          },
  { value: "strip_special", label: "Strip special chars" },
];
const DERIVED_OPS = [
  { value: "add",      label: "Add (+)",       binary: true  },
  { value: "subtract", label: "Subtract (−)",  binary: true  },
  { value: "multiply", label: "Multiply (×)",  binary: true  },
  { value: "divide",   label: "Divide (÷)",    binary: true  },
  { value: "concat",   label: "Concat text",   binary: true  },
  { value: "abs",      label: "Absolute value",binary: false },
  { value: "log",      label: "Log (ln)",      binary: false },
  { value: "sqrt",     label: "Square root",   binary: false },
  { value: "round",    label: "Round (2 dp)",  binary: false },
];
const DATE_PARTS = [
  { key: "year",    label: "Year"    },
  { key: "month",   label: "Month"   },
  { key: "day",     label: "Day"     },
  { key: "weekday", label: "Weekday" },
  { key: "hour",    label: "Hour"    },
  { key: "quarter", label: "Quarter" },
];
const SPLIT_OPTIONS = [
  { value: " ", label: "Space" },
  { value: ",", label: "Comma (,)" },
  { value: "|", label: "Pipe (|)" },
  { value: "-", label: "Hyphen (-)" },
  { value: "_", label: "Underscore (_)" },
  { value: "/", label: "Slash (/)" },
];
const FLAG_OPS = [
  { value: "contains", label: "Contains" },
  { value: "startswith", label: "Starts with" },
  { value: "endswith", label: "Ends with" },
  { value: "regex", label: "Regex match" },
  { value: "eq", label: "Equals (=)" },
  { value: "ne", label: "Not equals (≠)" },
  { value: "gt", label: "Greater than (>)" },
  { value: "lt", label: "Less than (<)" },
  { value: "gte", label: "Greater or equal (≥)" },
  { value: "lte", label: "Less or equal (≤)" },
];
const GROUPBY_FUNCS = [
  { value: "mean", label: "Mean" },
  { value: "sum", label: "Sum" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "median", label: "Median" },
  { value: "std", label: "Std Dev" },
  { value: "nunique", label: "Unique Count" },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function missingPct(col, summary, rowCount) {
  const s = summary?.[col];
  if (!s || !rowCount) return null;
  const count = parseFloat(s.count);
  if (isNaN(count)) return null;
  const missing = rowCount - count;
  if (missing <= 0) return "0.0";
  return ((missing / rowCount) * 100).toFixed(1);
}
function missingColor(pct) {
  const n = parseFloat(pct);
  if (n === 0)  return "var(--green)";
  if (n < 5)    return "var(--amber)";
  return "var(--red)";
}
function isNumeric(col, summary) {
  return summary?.[col]?.mean !== undefined;
}
function suggestEncoding(unique) {
  const n = typeof unique === "number" ? unique : parseInt(unique, 10);
  if (isNaN(n) || !isFinite(n)) return "label";
  if (n <= 2)  return "label";
  if (n <= 10) return "onehot";
  return "label";
}

// ── sub-components ────────────────────────────────────────────────────────────
function SectionHead({ label }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      color: "var(--text3)", paddingBottom: 6, marginTop: 18, marginBottom: 2,
      borderBottom: "1px solid var(--border)",
    }}>
      {label}
    </div>
  );
}

function LogItem({ op, onUndo }) {
  const icons = {
    fill:          <IcoFill />,
    drop_col:      <IcoTrash />,
    drop_dupes:    <IcoDupe />,
    rename:        <IcoRename />,
    cast:          <IcoType />,
    encode:        <IcoEncode />,
    outlier:       <IcoOutlier />,
    string_op:     <IcoStrOp />,
    filter:        <IcoFilter />,
    find_replace:  <IcoSwap />,
    normalize:     <IcoScale />,
    date_extract:  <IcoCal />,
    bin:           <IcoBin />,
    derived:       <IcoFormula />,
    subset_dedup:  <IcoDupe />,
    parse_number:  <IcoParse />,
    split:         <IcoSwap />,
    extract_regex: <IcoFormula />,
    create_flag:   <IcoCheck />,
    groupby:       <IcoScale />,
    custom_formula: <IcoFormula />,
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

function NextStepBar({ label, to, setPage, note }) {
  return (
    <div style={{ marginTop:28, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderRadius:12, background:"var(--bg3)", border:"1px solid var(--border2)" }}>
      {note && <span style={{ fontSize:12, color:"var(--text3)" }}>{note}</span>}
      <button className="btn-primary" style={{ marginLeft:"auto" }} onClick={() => setPage(to)}>
        {label}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function PageCleaning({ setPage }) {
  const {
    sessionId, columns, summary, fileName, rowCount,
    setColumns, setSummary, setRowCount,
    sessions, activeIdx, setSessions: setSessionsRaw, addSession,
    promoteCleanedSession,
    cleanOpLog,          setCleanOpLog,
    cleanFillStrategies, setCleanFillStrategies,
    cleanRenameMap,      setCleanRenameMap,
    cleanCastMap,        setCleanCastMap,
    cleanEncodeMap,      setCleanEncodeMap,
    cleanPreview,        setCleanPreview,
    cleanPromoted,       setCleanPromoted,
    activeSessionExpired,
  } = useDataPilot();

  // ── transient UI state ───────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState("missing");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [downloading, setDownloading] = useState(false);
  const [promoting,   setPromoting]   = useState(false);

  // ── Outliers tab state ────────────────────────────────────────────────────
  const [outlierCfg, setOutlierCfg] = useState({});
  // outlierCfg[col] = { method: "iqr"|"zscore", action: "cap"|"remove", threshold: number }
  const getOutlierCfg = (col) => ({
    method:    outlierCfg[col]?.method    ?? "iqr",
    action:    outlierCfg[col]?.action    ?? "cap",
    threshold: outlierCfg[col]?.threshold ?? 1.5,
  });
  const setOutlierField = (col, field, val) =>
    setOutlierCfg(p => ({ ...p, [col]: { ...getOutlierCfg(col), [field]: val } }));

  // ── Transform tab state ───────────────────────────────────────────────────
  // String op
  const [strCol,    setStrCol]    = useState("");
  const [strOp,     setStrOp]     = useState("trim");
  // Find & replace
  const [frCol,     setFrCol]     = useState("__all__");
  const [frFind,    setFrFind]    = useState("");
  const [frReplace, setFrReplace] = useState("");
  const [frRegex,   setFrRegex]   = useState(false);
  // Filter rows
  const [fltCol,    setFltCol]    = useState("");
  const [fltOp,     setFltOp]     = useState("eq");
  const [fltVal,    setFltVal]    = useState("");
  const [fltKeep,   setFltKeep]   = useState(true);
  // Normalize
  const [normCol,   setNormCol]   = useState("");
  const [normMeth,  setNormMeth]  = useState("minmax");
  // Date extraction
  const [dateCol,   setDateCol]   = useState("");
  const [dateParts, setDateParts] = useState({ year:true, month:true, day:true, weekday:false, hour:false, quarter:false });
  // Binning
  const [binCol,    setBinCol]    = useState("");
  const [binN,      setBinN]      = useState(5);
  const [binMeth,   setBinMeth]   = useState("equal_width");
  const [binName,   setBinName]   = useState("");
  // Derived column
  const [drvName,   setDrvName]   = useState("");
  const [drvColA,   setDrvColA]   = useState("");
  const [drvColB,   setDrvColB]   = useState("");
  const [drvOp,     setDrvOp]     = useState("add");
  // Parse numbers
  const [prsCol,    setPrsCol]    = useState("");
  const [prsFmt,    setPrsFmt]    = useState("auto");
  // Subset dedup
  const [subsetCols, setSubsetCols] = useState([]);
  const [subsetKeep, setSubsetKeep] = useState("first");
  // Split Column
  const [splitCol, setSplitCol] = useState("");
  const [splitDelim, setSplitDelim] = useState(" ");
  const [splitNames, setSplitNames] = useState("");
  const [splitDropOrig, setSplitDropOrig] = useState(false);
  // Regex Extract
  const [regexCol, setRegexCol] = useState("");
  const [regexPattern, setRegexPattern] = useState("");
  const [regexNewName, setRegexNewName] = useState("");
  const [regexDropOrig, setRegexDropOrig] = useState(false);
  // Create Flag
  const [flagNewName, setFlagNewName] = useState("");
  const [flagCol, setFlagCol] = useState("");
  const [flagOp, setFlagOp] = useState("contains");
  const [flagValue, setFlagValue] = useState("");
  // GroupBy + Aggregate
  const [groupByCols, setGroupByCols] = useState([]);
  const [groupByAggCol, setGroupByAggCol] = useState("");
  const [groupByFunc, setGroupByFunc] = useState("mean");
  const [groupByNewName, setGroupByNewName] = useState("");
  // Custom Formula
  const [formulaName, setFormulaName] = useState("");
  const [formulaExpr, setFormulaExpr] = useState("");

  // ── tab drag-scroll ───────────────────────────────────────────────────────
  const tabBarRef = useRef(null);
  const tabDrag   = useRef(null);

  // ── aliases from context ──────────────────────────────────────────────────
  const opLog             = cleanOpLog;
  const setOpLog          = setCleanOpLog;
  const fillStrategies    = cleanFillStrategies;
  const setFillStrategies = setCleanFillStrategies;
  const renameMap         = cleanRenameMap;
  const setRenameMap      = setCleanRenameMap;
  const castMap           = cleanCastMap;
  const setCastMap        = setCleanCastMap;
  const preview           = cleanPreview;
  const setPreview        = setCleanPreview;
  const promoted          = cleanPromoted;
  const setPromoted       = setCleanPromoted;

  // ── helpers ───────────────────────────────────────────────────────────────
  const now = () => new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  const updateArrowVisibility = () => {
    const container = tabBarRef.current;
    if (!container) return;
    
    const leftBtn = document.getElementById("tab-scroll-left");
    const rightBtn = document.getElementById("tab-scroll-right");
    
    if (leftBtn) {
      leftBtn.style.opacity = container.scrollLeft > 0 ? "1" : "0.4";
    }
    if (rightBtn) {
      rightBtn.style.opacity = 
        container.scrollLeft < container.scrollWidth - container.clientWidth - 10 ? "1" : "0.4";
    }
  };

  // ── fetch preview on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || activeSessionExpired) return;
    fetch(`${API_BASE}/data/${sessionId}?limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.data && columns?.length ? setPreview({ columns, rows: d.data }) : null)
      .catch(() => null);
  }, [sessionId]);

  // Keyboard arrow key support for tab scrolling
  useEffect(() => {
    const handleKeyDown = (e) => {
      const container = tabBarRef.current;
      if (!container) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        container.scrollBy({ left: -180, behavior: 'smooth' });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        container.scrollBy({ left: 180, behavior: 'smooth' });
      } else if (e.key === "Home") {
        e.preventDefault();
        container.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (e.key === "End") {
        e.preventDefault();
        container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
      }
    };

    // Initialize arrow visibility
    updateArrowVisibility();

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [updateArrowVisibility]);

  const refreshSummary = async (sid) => {
    try {
      const r = await fetch(`${API_BASE}/clean/${sid}/summary`);
      if (!r.ok) return;
      const d = await r.json();
      setSummary(d.summary);
      setColumns(d.columns);
      setRowCount(d.row_count);
      if (setSessionsRaw && activeIdx !== null) {
        setSessionsRaw(prev => {
          const updated = [...prev];
          updated[activeIdx] = { ...updated[activeIdx], summary: d.summary, columns: d.columns, rowCount: d.row_count };
          return updated;
        });
      }
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
      setTimeout(() => setSuccess(""), 3500);
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
      const r = await fetch(`${API_BASE}/clean/${sessionId}/promote`, { method:"POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Promote failed");
      await promoteCleanedSession(sessionId, d);
      setPromoted(true);
      setSuccess("Cleaned data is now the active dataset.");
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
  const safeColumns        = Array.isArray(columns) ? columns : [];
  const safePreviewColumns = Array.isArray(preview?.columns) ? preview.columns : [];
  const safePreviewRows    = Array.isArray(preview?.rows) ? preview.rows : [];

  const colsWithMissing = safeColumns.filter(
    (c) => parseFloat(missingPct(c, summary, rowCount) ?? 0) > 0
  );
  const totalMissing = colsWithMissing.length;
  const dupCount     = summary?.__meta__?.duplicates ?? 0;

  const categoricalCols = safeColumns.filter((c) => {
    const s = summary?.[c];
    return s?.top !== undefined || s?.dtype === "object" || s?.dtype === "category";
  });
  const numericCols  = safeColumns.filter(c => isNumeric(c, summary));
  const datetimeCols = safeColumns.filter(c => {
    const d = summary?.[c]?.dtype ?? "";
    return d.includes("datetime") || d.includes("date");
  });

  // ── no session guard ──────────────────────────────────────────────────────
  if (!sessionId || activeSessionExpired) return (
    <div className="page-enter">
      <div className="page-header"><div className="page-title">Data Cleaning</div></div>
      <div className="card" style={{ textAlign:"center", padding:"60px 20px" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{ fontSize:14, fontWeight:500, color:"var(--text)", marginBottom:6 }}>
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
    { id:"duplicates", label:"Duplicates",     badge: dupCount || null },
    { id:"cast",       label:"Data Types" },
    { id:"encoding",   label:"Encoding",       badge: categoricalCols.length || null },
    { id:"outliers",   label:"Outliers",       badge: numericCols.length || null },
    { id:"transform",  label:"Transform" },
  ];

  const filterOpCfg = FILTER_OPS.find(o => o.value === fltOp) ?? FILTER_OPS[0];
  const derivedOpCfg = DERIVED_OPS.find(o => o.value === drvOp) ?? DERIVED_OPS[0];

  // ── shared select style ───────────────────────────────────────────────────
  const sel = { padding:"6px 8px", fontSize:12, cursor:"pointer" };

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
          { label:"Columns",         value: safeColumns.length,           color:"var(--cyan)"    },
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
          <div className="card" style={{ padding:0, overflow:"hidden", minWidth:0, position:"relative" }}>

            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              borderBottom: "1px solid var(--border)", 
              background: "var(--bg2)" 
            }}>

              {/* LEFT ARROW */}
              <button 
                id="tab-scroll-left"
                onClick={() => tabBarRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
                style={{
                  padding: "12px 8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text3)",
                  zIndex: 10,
                  flexShrink: 0,
                  opacity: 0.4,
                  transition: "opacity 0.2s ease"
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0.4"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>

              {/* Scrollable Tabs */}
              <div
                className="codegen-tabs"
                style={{ 
                  flex: 1, 
                  overflowX: "auto", 
                  whiteSpace: "nowrap", 
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  cursor: "grab",
                  scrollBehavior: "smooth"
                }}
                ref={tabBarRef}
                onScroll={updateArrowVisibility}
                onMouseDown={e => {
                  tabDrag.current = { 
                    active: true, 
                    startX: e.pageX - tabBarRef.current.offsetLeft, 
                    scrollLeft: tabBarRef.current.scrollLeft 
                  };
                  tabBarRef.current.style.cursor = "grabbing";
                }}
                onMouseLeave={() => { 
                  if (tabDrag.current?.active) { 
                    tabDrag.current.active = false; 
                    tabBarRef.current.style.cursor = "grab"; 
                  }
                }}
                onMouseUp={() => { 
                  if (tabDrag.current) { 
                    tabDrag.current.active = false; 
                    tabBarRef.current.style.cursor = "grab"; 
                  }
                }}
                onMouseMove={e => {
                  if (!tabDrag.current?.active) return;
                  e.preventDefault();
                  tabBarRef.current.scrollLeft = tabDrag.current.scrollLeft - 
                    (e.pageX - tabBarRef.current.offsetLeft - tabDrag.current.startX);
                }}
                tabIndex={0}
              >
                {TABS.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      flexShrink: 0, 
                      padding: "12px 16px", 
                      background: "none", 
                      border: "none", 
                      cursor: "pointer",
                      fontSize: 12, 
                      fontWeight: 500, 
                      whiteSpace: "nowrap",
                      color: activeTab === t.id ? "var(--text)" : "var(--text3)",
                      borderBottom: activeTab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "all 0.15s", 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 5,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {t.label}
                    {t.badge != null && t.badge > 0 && (
                      <span style={{ 
                        background: "rgba(248,113,113,0.15)", 
                        color: "var(--red)", 
                        border: "1px solid rgba(248,113,113,0.25)", 
                        borderRadius: 10, 
                        fontSize: 9, 
                        padding: "1px 5px", 
                        fontFamily: "'DM Mono',monospace" 
                      }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* RIGHT ARROW */}
              <button 
                id="tab-scroll-right"
                onClick={() => tabBarRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
                style={{
                  padding: "12px 8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text3)",
                  zIndex: 10,
                  flexShrink: 0,
                  opacity: 0.4,
                  transition: "opacity 0.2s ease"
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0.4"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>

            <div style={{ padding:20 }}>

              {/* ────────────── MISSING VALUES ────────────── */}
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
                        const opts    = numeric ? FILL_OPTIONS : FILL_OPTIONS.filter(o => !["mean","median"].includes(o.value));
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
                              style={{ width:130, ...sel }}>
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

              {/* ────────────── COLUMNS ────────────── */}
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

              {/* ────────────── DUPLICATES ────────────── */}
              {activeTab === "duplicates" && (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {/* global dedup */}
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

                  {/* subset dedup */}
                  <SectionHead label="Deduplicate by specific columns" />
                  <div style={{ fontSize:12, color:"var(--text3)", marginBottom:2 }}>
                    Keep the first or last occurrence when a combination of columns repeats (e.g. customer_id + date).
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {safeColumns.map(col => (
                      <label key={col} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", background:subsetCols.includes(col) ? "var(--accent-dim)" : "var(--bg3)", border:`1px solid ${subsetCols.includes(col) ? "rgba(108,99,255,0.4)" : "var(--border)"}`, borderRadius:6, cursor:"pointer", fontSize:11.5, color:subsetCols.includes(col) ? "var(--accent2)" : "var(--text2)", userSelect:"none" }}>
                        <input type="checkbox" style={{ display:"none" }} checked={subsetCols.includes(col)}
                          onChange={e => setSubsetCols(p => e.target.checked ? [...p,col] : p.filter(c=>c!==col))} />
                        {col}
                      </label>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <select className="input-field" value={subsetKeep} onChange={e => setSubsetKeep(e.target.value)} style={{ width:130, ...sel }}>
                      <option value="first">Keep first</option>
                      <option value="last">Keep last</option>
                    </select>
                    <button className="btn-secondary" disabled={busy || subsetCols.length === 0} style={{ flex:1, justifyContent:"center" }}
                      onClick={() => doOp("drop_duplicates_subset", { subset: subsetCols, keep: subsetKeep }, { type:"subset_dedup", label:`Dedup by [${subsetCols.join(", ")}]` })}>
                      <IcoDupe /> Deduplicate by Selected
                    </button>
                  </div>
                </div>
              )}

              {/* ────────────── CAST TYPES ────────────── */}
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
                          style={{ width:120, ...sel }}>
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

              {/* ────────────── ENCODING ────────────── */}
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
                      const uniqueCount = summary?.[col]?.unique ?? "—";
                      const suggested   = suggestEncoding(uniqueCount);
                      const current     = cleanEncodeMap[col] ?? suggested;
                      const topValue    = summary?.[col]?.top ?? "—";
                      return (
                        <div key={col} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border)" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:500, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col}</div>
                            <div style={{ fontSize:10.5, color:"var(--text3)", fontFamily:"'DM Mono', monospace", marginTop:2 }}>
                              {uniqueCount} unique · top: {String(topValue)}
                            </div>
                          </div>
                          <select className="input-field" value={current}
                            onChange={(e) => setCleanEncodeMap((prev) => ({ ...prev, [col]: e.target.value }))}
                            style={{ width:140, ...sel, flexShrink:0 }}>
                            {ENCODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <button className="btn-secondary" disabled={busy}
                            onClick={() => {
                              doOp("encode_column", { column: col, strategy: current },
                                { type:"encode", label:`Encode "${col}" with ${current}` });
                              setCleanEncodeMap((prev) => { const next = { ...prev }; delete next[col]; return next; });
                            }}
                            style={{ padding:"6px 12px", fontSize:12, flexShrink:0 }}>
                            <IcoEncode /> Apply
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ────────────── OUTLIERS ────────────── */}
              {activeTab === "outliers" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:12, color:"var(--text3)", marginBottom:4 }}>
                    Detect outliers in numeric columns using IQR or z-score. Cap them to the boundary or remove the rows entirely.
                  </div>
                  {numericCols.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"30px 0", color:"var(--text3)", fontSize:13 }}>
                      No numeric columns found.
                    </div>
                  ) : (
                    numericCols.map(col => {
                      const cfg = getOutlierCfg(col);
                      const s   = summary?.[col];
                      return (
                        <div key={col} style={{ padding:"10px 12px", background:"var(--bg3)", borderRadius:9, border:"1px solid var(--border)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            <div style={{ flex:1, minWidth:100 }}>
                              <div style={{ fontSize:12.5, fontWeight:500, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col}</div>
                              {s && (
                                <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                                  min {s.min} · max {s.max} · σ {s.std}
                                </div>
                              )}
                            </div>
                            <select className="input-field" value={cfg.method}
                              onChange={e => setOutlierField(col, "method", e.target.value)}
                              style={{ width:100, ...sel }}>
                              <option value="iqr">IQR</option>
                              <option value="zscore">Z-score</option>
                            </select>
                            <input type="number" className="input-field" value={cfg.threshold} min={0.5} max={10} step={0.5}
                              onChange={e => setOutlierField(col, "threshold", parseFloat(e.target.value) || 1.5)}
                              style={{ width:68, padding:"5px 8px", fontSize:12 }}
                              title={cfg.method === "iqr" ? "IQR multiplier (1.5 = standard)" : "Z-score cutoff (3.0 = standard)"} />
                            <select className="input-field" value={cfg.action}
                              onChange={e => setOutlierField(col, "action", e.target.value)}
                              style={{ width:100, ...sel }}>
                              <option value="cap">Cap</option>
                              <option value="remove">Remove rows</option>
                            </select>
                            <button className="btn-secondary" disabled={busy}
                              onClick={() => doOp("cap_outliers",
                                { column: col, method: cfg.method, action: cfg.action, threshold: cfg.threshold },
                                { type:"outlier", label:`Outlier ${cfg.action} "${col}" (${cfg.method})` })}
                              style={{ padding:"6px 10px", fontSize:12, flexShrink:0 }}>
                              <IcoOutlier /> Apply
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ────────────── TRANSFORM ────────────── */}
              {activeTab === "transform" && (
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>

                  {/* ── String Operations ── */}
                  <SectionHead label="String Operations" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Clean text columns — trim whitespace, fix casing, or strip special characters.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={strCol} onChange={e => setStrCol(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      <option value="">— Column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input-field" value={strOp} onChange={e => setStrOp(e.target.value)} style={{ flex:1, minWidth:130, ...sel }}>
                      {STRING_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="btn-secondary" disabled={busy || !strCol}
                      onClick={() => doOp("string_op", { column: strCol, operation: strOp },
                        { type:"string_op", label:`String op: ${strOp} on "${strCol}"` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoStrOp /> Apply
                    </button>
                  </div>

                  {/* ── Find & Replace ── */}
                  <SectionHead label="Find & Replace" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Replace values like <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>N/A</code>, <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>?</code>, or <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>-</code> with real nulls or corrected values.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={frCol} onChange={e => setFrCol(e.target.value)} style={{ width:130, ...sel }}>
                      <option value="__all__">All columns</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="input-field" placeholder="Find…" value={frFind} onChange={e => setFrFind(e.target.value)}
                      style={{ flex:1, minWidth:80, padding:"6px 8px", fontSize:12 }} />
                    <input className="input-field" placeholder="Replace with…" value={frReplace} onChange={e => setFrReplace(e.target.value)}
                      style={{ flex:1, minWidth:80, padding:"6px 8px", fontSize:12 }} />
                    <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11.5, color:"var(--text3)", cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>
                      <input type="checkbox" checked={frRegex} onChange={e => setFrRegex(e.target.checked)} /> Regex
                    </label>
                    <button className="btn-secondary" disabled={busy || !frFind}
                      onClick={() => doOp("find_replace",
                        { column: frCol === "__all__" ? null : frCol, find_value: frFind, replace_value: frReplace, regex: frRegex },
                        { type:"find_replace", label:`Find "${frFind}" → "${frReplace}"` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoSwap /> Apply
                    </button>
                  </div>

                  {/* ── Filter Rows ── */}
                  <SectionHead label="Filter / Keep Rows" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Keep or drop rows based on a column condition.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={fltCol} onChange={e => setFltCol(e.target.value)} style={{ flex:1, minWidth:100, ...sel }}>
                      <option value="">— Column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input-field" value={fltOp} onChange={e => setFltOp(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      {FILTER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {filterOpCfg.needsVal && (
                      <input className="input-field" placeholder="Value…" value={fltVal} onChange={e => setFltVal(e.target.value)}
                        style={{ flex:1, minWidth:80, padding:"6px 8px", fontSize:12 }} />
                    )}
                    <select className="input-field" value={fltKeep ? "keep" : "drop"} onChange={e => setFltKeep(e.target.value === "keep")} style={{ width:90, ...sel }}>
                      <option value="keep">Keep</option>
                      <option value="drop">Drop</option>
                    </select>
                    <button className="btn-secondary" disabled={busy || !fltCol || (filterOpCfg.needsVal && !fltVal)}
                      onClick={() => doOp("filter_rows",
                        { column: fltCol, operator: fltOp, value: filterOpCfg.needsVal ? fltVal : null, keep: fltKeep },
                        { type:"filter", label:`Filter: ${fltKeep?"keep":"drop"} rows where "${fltCol}" ${fltOp}${fltVal ? ` ${fltVal}` : ""}` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFilter /> Apply
                    </button>
                  </div>

                  {/* ── Normalize ── */}
                  <SectionHead label="Normalize / Scale" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Scale numeric columns to [0,1] or standardize to mean=0, std=1. Common pre-ML step.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={normCol} onChange={e => setNormCol(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      <option value="">— Numeric column —</option>
                      {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input-field" value={normMeth} onChange={e => setNormMeth(e.target.value)} style={{ width:150, ...sel }}>
                      <option value="minmax">Min-Max [0, 1]</option>
                      <option value="zscore">Z-Score (μ=0, σ=1)</option>
                    </select>
                    <button className="btn-secondary" disabled={busy || !normCol}
                      onClick={() => doOp("normalize", { column: normCol, method: normMeth },
                        { type:"normalize", label:`Normalize "${normCol}" (${normMeth})` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoScale /> Apply
                    </button>
                  </div>

                  {/* ── Date Extraction ── */}
                  <SectionHead label="Date Feature Extraction" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Extract year, month, day, etc. from a date column into new columns.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
                    <select className="input-field" value={dateCol} onChange={e => setDateCol(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      <option value="">— Date column —</option>
                      {datetimeCols.length > 0
                        ? datetimeCols.map(c => <option key={c} value={c}>{c}</option>)
                        : safeColumns.map(c => <option key={c} value={c}>{c}</option>)
                      }
                    </select>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {DATE_PARTS.map(p => (
                        <label key={p.key} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 8px", background:dateParts[p.key] ? "var(--accent-dim)" : "var(--bg3)", border:`1px solid ${dateParts[p.key] ? "rgba(108,99,255,0.4)" : "var(--border)"}`, borderRadius:6, cursor:"pointer", fontSize:11, color:dateParts[p.key] ? "var(--accent2)" : "var(--text3)", userSelect:"none" }}>
                          <input type="checkbox" style={{ display:"none" }} checked={!!dateParts[p.key]}
                            onChange={e => setDateParts(prev => ({ ...prev, [p.key]: e.target.checked }))} />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <button className="btn-secondary" disabled={busy || !dateCol || !Object.values(dateParts).some(Boolean)}
                      onClick={() => {
                        const parts = Object.entries(dateParts).filter(([,v]) => v).map(([k]) => k);
                        doOp("extract_date_parts", { column: dateCol, parts },
                          { type:"date_extract", label:`Extract ${parts.join("/")} from "${dateCol}"` });
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoCal /> Extract
                    </button>
                  </div>

                  {/* ── Binning ── */}
                  <SectionHead label="Binning / Discretize" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Convert a continuous column into discrete buckets (e.g. age → 0–18, 18–35, 35+).
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={binCol} onChange={e => setBinCol(e.target.value)} style={{ flex:1, minWidth:100, ...sel }}>
                      <option value="">— Numeric column —</option>
                      {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" className="input-field" value={binN} min={2} max={50}
                      onChange={e => setBinN(parseInt(e.target.value) || 5)}
                      style={{ width:68, padding:"6px 8px", fontSize:12 }}
                      title="Number of bins" />
                    <select className="input-field" value={binMeth} onChange={e => setBinMeth(e.target.value)} style={{ width:120, ...sel }}>
                      <option value="equal_width">Equal width</option>
                      <option value="equal_freq">Equal freq</option>
                    </select>
                    <input className="input-field" placeholder="New col name (opt.)" value={binName} onChange={e => setBinName(e.target.value)}
                      style={{ flex:1, minWidth:100, padding:"6px 8px", fontSize:12 }} />
                    <button className="btn-secondary" disabled={busy || !binCol}
                      onClick={() => doOp("bin_column",
                        { column: binCol, n_bins: binN, method: binMeth, new_col_name: binName || null },
                        { type:"bin", label:`Bin "${binCol}" into ${binN} buckets` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoBin /> Apply
                    </button>
                  </div>

                  {/* ── Derived Column ── */}
                  <SectionHead label="Derived Column" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Create a new column from arithmetic or string operations on existing columns.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <input className="input-field" placeholder="New col name…" value={drvName} onChange={e => setDrvName(e.target.value)}
                      style={{ flex:1, minWidth:100, padding:"6px 8px", fontSize:12 }} />
                    <select className="input-field" value={drvColA} onChange={e => setDrvColA(e.target.value)} style={{ flex:1, minWidth:90, ...sel }}>
                      <option value="">— Col A —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input-field" value={drvOp} onChange={e => setDrvOp(e.target.value)} style={{ width:130, ...sel }}>
                      {DERIVED_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {derivedOpCfg.binary && (
                      <select className="input-field" value={drvColB} onChange={e => setDrvColB(e.target.value)} style={{ flex:1, minWidth:90, ...sel }}>
                        <option value="">— Col B —</option>
                        {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <button className="btn-secondary" disabled={busy || !drvName || !drvColA || (derivedOpCfg.binary && !drvColB)}
                      onClick={() => doOp("derived_column",
                        { new_col_name: drvName, col_a: drvColA, col_b: derivedOpCfg.binary ? drvColB : null, operation: drvOp },
                        { type:"derived", label:`Derived: "${drvName}" = ${drvOp}(${drvColA}${derivedOpCfg.binary ? `, ${drvColB}` : ""})` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Create
                    </button>
                  </div>

                  {/* ── Parse Formatted Numbers ── */}
                  <SectionHead label="Parse Formatted Numbers" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Convert strings like <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>$1,234</code> or <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>45%</code> into real numeric values.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={prsCol} onChange={e => setPrsCol(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      <option value="">— Column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input-field" value={prsFmt} onChange={e => setPrsFmt(e.target.value)} style={{ width:160, ...sel }}>
                      <option value="auto">Auto (currency + commas)</option>
                      <option value="currency">Currency ($, €, £, ₦)</option>
                      <option value="percentage">Percentage (%)</option>
                      <option value="comma_separated">Comma-separated</option>
                    </select>
                    <button className="btn-secondary" disabled={busy || !prsCol}
                      onClick={() => doOp("parse_number", { column: prsCol, format: prsFmt },
                        { type:"parse_number", label:`Parse numbers in "${prsCol}" (${prsFmt})` })}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoParse /> Parse
                    </button>
                  </div>

                  {/* ── Split Column ── */}
                  <SectionHead label="Split Column" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Split text into multiple columns (e.g. "John Doe" → First & Last Name)
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="input-field" value={splitCol} onChange={e => setSplitCol(e.target.value)} style={{ flex:1, minWidth:140, ...sel }}>
                      <option value="">— Column to split —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select className="input-field" value={splitDelim} onChange={e => setSplitDelim(e.target.value)} style={{ width:130, ...sel }}>
                      {SPLIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <input 
                      className="input-field" 
                      placeholder="New column names (comma separated)" 
                      value={splitNames} 
                      onChange={e => setSplitNames(e.target.value)}
                      style={{ flex:1, minWidth:180, padding:"6px 8px", fontSize:12 }} 
                    />

                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--text3)", cursor:"pointer", userSelect:"none" }}>
                      <input type="checkbox" checked={splitDropOrig} onChange={e => setSplitDropOrig(e.target.checked)} />
                      Drop original
                    </label>

                    <button className="btn-secondary" disabled={busy || !splitCol}
                      onClick={() => {
                        const newNames = splitNames.trim() ? splitNames.split(",").map(n => n.trim()).filter(Boolean) : [];
                        doOp("split_column", { 
                          column: splitCol, 
                          delimiter: splitDelim, 
                          new_col_names: newNames.length > 0 ? newNames : null,
                          drop_original: splitDropOrig 
                        }, { 
                          type:"split", 
                          label:`Split "${splitCol}" by "${splitDelim}"` 
                        });
                        
                        // Reset form
                        setSplitNames("");
                        setSplitDropOrig(false);
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Split
                    </button>
                  </div>

                  {/* ── Regex Extract ── */}
                  <SectionHead label="Regex Extract" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Extract patterns using regex (e.g. email domain, phone digits). Supports capture groups.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
                    <select className="input-field" value={regexCol} onChange={e => setRegexCol(e.target.value)} style={{ flex:1, minWidth:100, ...sel }}>
                      <option value="">— Column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <input 
                      className="input-field" 
                      placeholder="Regex pattern (e.g. (\d{3})-(\d{2}))" 
                      value={regexPattern} 
                      onChange={e => setRegexPattern(e.target.value)}
                      style={{ flex:1, minWidth:150, padding:"6px 8px", fontSize:12 }}
                    />

                    <input 
                      className="input-field" 
                      placeholder="New col name (optional)" 
                      value={regexNewName} 
                      onChange={e => setRegexNewName(e.target.value)}
                      style={{ flex:1, minWidth:130, padding:"6px 8px", fontSize:12 }}
                    />

                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--text3)", cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }}>
                      <input type="checkbox" checked={regexDropOrig} onChange={e => setRegexDropOrig(e.target.checked)} />
                      Drop original
                    </label>

                    <button className="btn-secondary" disabled={busy || !regexCol || !regexPattern}
                      onClick={() => {
                        doOp("extract_regex", {
                          column: regexCol,
                          pattern: regexPattern,
                          new_col_name: regexNewName || null,
                          drop_original: regexDropOrig
                        }, {
                          type:"extract_regex",
                          label:`Extract regex from "${regexCol}"`
                        });
                        setRegexNewName("");
                        setRegexDropOrig(false);
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Extract
                    </button>
                  </div>

                  {/* ── Create Flag ── */}
                  <SectionHead label="Create Flag / Indicator" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Create a binary flag column (0/1) based on a condition on an existing column.
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <input 
                      className="input-field" 
                      placeholder="New flag column name" 
                      value={flagNewName} 
                      onChange={e => setFlagNewName(e.target.value)}
                      style={{ flex:1, minWidth:150, padding:"6px 8px", fontSize:12 }}
                    />

                    <select className="input-field" value={flagCol} onChange={e => setFlagCol(e.target.value)} style={{ flex:1, minWidth:100, ...sel }}>
                      <option value="">— Column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select className="input-field" value={flagOp} onChange={e => setFlagOp(e.target.value)} style={{ flex:1, minWidth:120, ...sel }}>
                      {FLAG_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <input 
                      className="input-field" 
                      placeholder="Value" 
                      value={flagValue} 
                      onChange={e => setFlagValue(e.target.value)}
                      style={{ flex:1, minWidth:80, padding:"6px 8px", fontSize:12 }}
                    />

                    <button className="btn-secondary" disabled={busy || !flagNewName || !flagCol}
                      onClick={() => {
                        doOp("create_flag", {
                          new_col_name: flagNewName,
                          column: flagCol,
                          operator: flagOp,
                          value: flagValue || null
                        }, {
                          type:"create_flag",
                          label:`Flag: "${flagNewName}" = ${flagOp}(${flagCol})`
                        });
                        setFlagNewName("");
                        setFlagValue("");
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Create
                    </button>
                  </div>

                  {/* ── GroupBy + Aggregate ── */}
                  <SectionHead label="GroupBy + Aggregate" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Group by columns and aggregate values (e.g. average price per product).
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, flex:1, minWidth:120 }}>
                      {safeColumns.map(col => (
                        <label key={col} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 8px", background:groupByCols.includes(col) ? "var(--accent-dim)" : "var(--bg3)", border:`1px solid ${groupByCols.includes(col) ? "rgba(108,99,255,0.4)" : "var(--border)"}`, borderRadius:6, cursor:"pointer", fontSize:10.5, color:groupByCols.includes(col) ? "var(--accent2)" : "var(--text3)", userSelect:"none" }}>
                          <input type="checkbox" style={{ display:"none" }} checked={groupByCols.includes(col)}
                            onChange={e => setGroupByCols(p => e.target.checked ? [...p,col] : p.filter(c=>c!==col))} />
                          {col}
                        </label>
                      ))}
                    </div>

                    <select className="input-field" value={groupByAggCol} onChange={e => setGroupByAggCol(e.target.value)} style={{ flex:1, minWidth:100, ...sel }}>
                      <option value="">— Agg column —</option>
                      {safeColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select className="input-field" value={groupByFunc} onChange={e => setGroupByFunc(e.target.value)} style={{ width:120, ...sel }}>
                      {GROUPBY_FUNCS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <input 
                      className="input-field" 
                      placeholder="New col name (opt.)" 
                      value={groupByNewName} 
                      onChange={e => setGroupByNewName(e.target.value)}
                      style={{ flex:1, minWidth:120, padding:"6px 8px", fontSize:12 }}
                    />

                    <button className="btn-secondary" disabled={busy || groupByCols.length === 0 || !groupByAggCol}
                      onClick={() => {
                        doOp("groupby", {
                          group_by: groupByCols,
                          agg_column: groupByAggCol,
                          agg_func: groupByFunc,
                          new_col_name: groupByNewName || null
                        }, {
                          type:"groupby",
                          label:`GroupBy [${groupByCols.join(",")}] → ${groupByFunc}(${groupByAggCol})`
                        });
                        setGroupByNewName("");
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Aggregate
                    </button>
                  </div>

                  {/* ── Custom Formula ── */}
                  <SectionHead label="Custom Formula" />
                  <div style={{ fontSize:11.5, color:"var(--text3)", marginBottom:6 }}>
                    Create a new column using a pandas expression (e.g. <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>col1 + col2</code>, <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>log(col1)</code>, <code style={{ fontFamily:"'DM Mono',monospace", background:"var(--bg3)", padding:"1px 4px", borderRadius:3 }}>col1 {'>'}  100</code>).
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <input 
                      className="input-field" 
                      placeholder="New column name" 
                      value={formulaName} 
                      onChange={e => setFormulaName(e.target.value)}
                      style={{ flex:1, minWidth:150, padding:"6px 8px", fontSize:12 }}
                    />

                    <input 
                      className="input-field" 
                      placeholder="Expression (e.g. col1 + col2 * 2, sqrt(col1))" 
                      value={formulaExpr} 
                      onChange={e => setFormulaExpr(e.target.value)}
                      style={{ flex:1, minWidth:200, padding:"6px 8px", fontSize:12 }}
                    />

                    <button className="btn-secondary" disabled={busy || !formulaName || !formulaExpr}
                      onClick={() => {
                        doOp("custom_formula", {
                          new_col_name: formulaName,
                          formula: formulaExpr
                        }, {
                          type:"custom_formula",
                          label:`Formula: "${formulaName}" = ${formulaExpr}`
                        });
                        setFormulaName("");
                        setFormulaExpr("");
                      }}
                      style={{ padding:"6px 12px", fontSize:12 }}>
                      <IcoFormula /> Create
                    </button>
                  </div>

                  <div style={{ height:8 }} />
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
                  <div style={{ marginTop:8, fontSize:10, color:"var(--text3)" }}>
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