import { useState, useMemo } from "react";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import { Icons } from "../shared/icons.jsx";

// ── tiny icons ───────────────────────────────────────────────────────────────
const Ico = ({ d, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IcoPy      = () => <Ico d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />;
const IcoNb      = () => <Ico d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />;
const IcoMd      = () => <Ico d="M4 6h16M4 10h16M4 14h16M4 18h16" />;
const IcoCopy    = () => <Ico d={Icons.copy} />;
const IcoDown    = () => <Ico d={Icons.download} />;
const IcoCode    = () => <Ico d={Icons.code} />;
const IcoCheck   = () => <Ico d={Icons.check} />;
const IcoSpark   = () => <Ico d={Icons.sparkle} />;

// ── section toggle chip ──────────────────────────────────────────────────────
function SectionChip({ id, label, icon, enabled, onToggle, hasData }) {
  return (
    <button onClick={() => onToggle(id)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 12px", borderRadius: 8, cursor: hasData ? "pointer" : "not-allowed",
        fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
        background: enabled && hasData ? "var(--accent-dim)" : "var(--bg3)",
        color: enabled && hasData ? "var(--accent2)" : hasData ? "var(--text2)" : "var(--text3)",
        border: `1px solid ${enabled && hasData ? "rgba(108,99,255,0.35)" : "var(--border)"}`,
        transition: "all 0.15s", opacity: hasData ? 1 : 0.45,
      }}>
      {icon}
      {label}
      {!hasData && <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "'DM Mono',monospace" }}>no data</span>}
    </button>
  );
}

// ── format tab ───────────────────────────────────────────────────────────────
function FormatTab({ id, label, icon, ext, active, onClick }) {
  return (
    <button onClick={() => onClick(id)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
        background: "none", border: "none", cursor: "pointer",
        fontSize: 12.5, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
        color: active ? "var(--text)" : "var(--text3)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "all 0.15s", flexShrink: 0, whiteSpace: "nowrap",
      }}>
      {icon}
      <span>{label}</span>
      <span style={{
        fontSize: 9, padding: "1px 5px", borderRadius: 4,
        background: active ? "var(--accent-dim)" : "var(--bg3)",
        color: active ? "var(--accent2)" : "var(--text3)",
        fontFamily: "'DM Mono',monospace", border: "1px solid var(--border)",
      }}>{ext}</span>
    </button>
  );
}

// ── code block with copy ─────────────────────────────────────────────────────
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const doCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
      {/* header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", background: "var(--bg3)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#f87171", "#fbbf24", "#34d399"].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono',monospace" }}>
            {language}
          </span>
          <button onClick={doCopy} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
            background: copied ? "rgba(52,211,153,0.1)" : "var(--bg2)",
            border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
            borderRadius: 5, cursor: "pointer",
            color: copied ? "var(--green)" : "var(--text2)", fontSize: 11,
            fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s",
          }}>
            {copied ? <IcoCheck /> : <IcoCopy />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {/* code */}
      <pre style={{
        margin: 0, padding: "20px 20px", overflowX: "auto",
        background: "#07090e", fontSize: 12, lineHeight: 1.75,
        fontFamily: "'DM Mono', monospace", color: "var(--text2)",
        maxHeight: 520, overflowY: "auto",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── model name map ────────────────────────────────────────────────────────────
const MODEL_CLASS_MAP = {
  rf:  "RandomForestClassifier",  rf_r: "RandomForestRegressor",
  lr:  "LogisticRegression",      lr_r: "LinearRegression",
  xgb: "XGBClassifier",           xgb_r: "XGBRegressor",
  svm: "SVC",                      svm_r: "SVR",
};
const MODEL_IMPORT_MAP = {
  rf:  "from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor",
  lr:  "from sklearn.linear_model import LogisticRegression, LinearRegression",
  xgb: "from xgboost import XGBClassifier, XGBRegressor",
  svm: "from sklearn.svm import SVC, SVR",
};

// ── code generators ───────────────────────────────────────────────────────────
function buildPython({ fileName, columns, summary, rowCount,
  trainConfig, trainResults, cleanOpLog, savedPlots,
  sections }) {

  const fname = fileName || "dataset.csv";
  const safeFile = fname.replace(/'/g, "\\'");
  const numericCols = columns.filter(c => summary?.[c]?.mean !== undefined);
  const catCols     = columns.filter(c => summary?.[c]?.mean === undefined && c !== "__meta__");
  const isClass     = trainResults?.task === "classification";
  const algo        = trainConfig?.selectedModel || "rf";
  const target      = trainConfig?.targetCol || "target";
  const testSize    = trainConfig?.testSize || 0.2;

  const lines = [];

  lines.push("# ============================================================");
  lines.push(`# DataPilot — Generated Code`);
  lines.push(`# Dataset : ${fname}`);
  lines.push(`# Rows    : ${rowCount?.toLocaleString() || "unknown"}`);
  lines.push(`# Columns : ${columns.length}`);
  lines.push(`# Generated: ${new Date().toLocaleString()}`);
  lines.push("# ============================================================");
  lines.push("");

  // ── IMPORTS ──────────────────────────────────────────────────────────────
  lines.push("import pandas as pd");
  lines.push("import numpy as np");
  if (sections.visualization) {
    lines.push("import matplotlib");
    lines.push("matplotlib.use('Agg')");
    lines.push("import matplotlib.pyplot as plt");
    lines.push("import seaborn as sns");
  }
  if (sections.model && trainConfig?.targetCol) {
    lines.push("from sklearn.model_selection import train_test_split");
    lines.push("from sklearn.preprocessing import LabelEncoder, StandardScaler");
    lines.push("from sklearn.metrics import (classification_report, confusion_matrix,");
    lines.push("                             mean_squared_error, r2_score)");
    lines.push("import joblib");
    if (MODEL_IMPORT_MAP[algo]) lines.push(MODEL_IMPORT_MAP[algo]);
  }
  lines.push("");

  // ── LOAD DATA ─────────────────────────────────────────────────────────────
  if (sections.load) {
    lines.push("# ── 1. Load Data ─────────────────────────────────────────────");
    lines.push(`df = pd.read_csv('${safeFile}')`);
    lines.push(`print(f"Loaded: {len(df):,} rows × {len(df.columns)} columns")`);
    lines.push(`print(df.head())`);
    lines.push("");
  }

  // ── CLEANING ──────────────────────────────────────────────────────────────
  if (sections.cleaning && cleanOpLog?.length > 0) {
    lines.push("# ── 2. Data Cleaning ─────────────────────────────────────────");
    lines.push("# Operations applied in DataPilot (in order):");
    cleanOpLog.slice().reverse().forEach(op => {
      lines.push(`# • ${op.label}`);
    });
    lines.push("");
    cleanOpLog.slice().reverse().forEach(op => {
      if (op.type === "fill") {
        const colMatch = op.label.match(/"([^"]+)"/);
        const stratMatch = op.label.match(/with (\w+)/);
        const col  = colMatch?.[1];
        const strat = stratMatch?.[1]?.toLowerCase();
        if (col && strat) {
          if (strat === "mean")   lines.push(`df['${col}'].fillna(df['${col}'].mean(), inplace=True)`);
          else if (strat === "median") lines.push(`df['${col}'].fillna(df['${col}'].median(), inplace=True)`);
          else if (strat === "mode")   lines.push(`df['${col}'].fillna(df['${col}'].mode()[0], inplace=True)`);
          else if (strat === "zero")   lines.push(`df['${col}'].fillna(0, inplace=True)`);
          else if (strat === "ffill")  lines.push(`df['${col}'] = df['${col}'].ffill()`);
          else if (strat === "bfill")  lines.push(`df['${col}'] = df['${col}'].bfill()`);
          else if (strat === "drop")   lines.push(`df.dropna(subset=['${col}'], inplace=True)`);
          else lines.push(`# Fill '${col}' with ${strat}`);
        } else if (op.label.includes("all")) {
          lines.push("# Fill all columns — see individual operations above");
        }
      } else if (op.type === "drop_col") {
        const colMatch = op.label.match(/"([^"]+)"/);
        if (colMatch?.[1]) lines.push(`df.drop(columns=['${colMatch[1]}'], inplace=True)`);
      } else if (op.type === "drop_dupes") {
        lines.push("df.drop_duplicates(inplace=True)");
      } else if (op.type === "rename") {
        const m = op.label.match(/"([^"]+)" → "([^"]+)"/);
        if (m) lines.push(`df.rename(columns={'${m[1]}': '${m[2]}'}, inplace=True)`);
      } else if (op.type === "cast") {
        const m = op.label.match(/"([^"]+)" → (\w+)/);
        if (m) {
          const dtypeMap = { int:"int64", float:"float64", str:"str", datetime:"datetime64[ns]", bool:"bool" };
          lines.push(`df['${m[1]}'] = df['${m[1]}'].astype('${dtypeMap[m[2]] || m[2]}')`);
        }
      }
    });
    lines.push(`print(f"After cleaning: {len(df):,} rows × {len(df.columns)} columns")`);
    lines.push("");
  } else if (sections.cleaning) {
    lines.push("# ── 2. Data Cleaning ─────────────────────────────────────────");
    lines.push("# No cleaning operations were recorded for this session.");
    lines.push("# Add your own cleaning steps here:");
    lines.push("# df.dropna(inplace=True)");
    lines.push("# df.drop_duplicates(inplace=True)");
    lines.push("");
  }

  // ── EDA ───────────────────────────────────────────────────────────────────
  if (sections.eda) {
    lines.push("# ── 3. Exploratory Data Analysis ─────────────────────────────");
    lines.push("print('\\n── Shape & Types ──────────────────────────────────────')");
    lines.push("print(df.dtypes)");
    lines.push("print('\\n── Missing Values ─────────────────────────────────────')");
    lines.push("print(df.isnull().sum()[df.isnull().sum() > 0])");
    lines.push("print('\\n── Descriptive Statistics ─────────────────────────────')");
    lines.push("print(df.describe(include='all'))");
    if (numericCols.length > 1) {
      lines.push("print('\\n── Correlation Matrix ─────────────────────────────────')");
      lines.push(`numeric_cols = ${JSON.stringify(numericCols)}`);
      lines.push("print(df[numeric_cols].corr())");
    }
    lines.push("");
  }

  // ── VISUALIZATIONS ────────────────────────────────────────────────────────
  if (sections.visualization && savedPlots?.length > 0) {
    lines.push("# ── 4. Visualizations ────────────────────────────────────────");
    lines.push("# Charts generated in DataPilot — reproduced with matplotlib/seaborn");
    lines.push("");
    const completed = savedPlots.filter(p => p.image && !p.error);
    completed.forEach((plot, i) => {
      lines.push(`# Chart ${i + 1}: ${plot.title || plot.type}`);
      lines.push("fig, ax = plt.subplots(figsize=(10, 6))");
      const x = plot.x; const y = plot.y; const hue = plot.hue;
      const t = plot.type;
      if (t === "hist")       lines.push(`df['${x}'].dropna().plot.hist(bins=${plot.customizations?.bins || 30}, ax=ax, color='#6c63ff', alpha=0.8)`);
      else if (t === "box")   lines.push(`df.boxplot(column='${x}', ax=ax)`);
      else if (t === "scatter" && y) lines.push(`ax.scatter(df['${x}'], df['${y}'], alpha=0.5, color='#6c63ff')\nax.set_xlabel('${x}')\nax.set_ylabel('${y}')`);
      else if (t === "line" && y)  lines.push(`ax.plot(df['${x}'], df['${y}'], color='#6c63ff')\nax.set_xlabel('${x}')\nax.set_ylabel('${y}')`);
      else if (t === "bar" && y)   lines.push(`df.groupby('${x}')['${y}'].mean().plot.bar(ax=ax, color='#6c63ff')\nax.set_xlabel('${x}')\nax.set_ylabel('${y}')`);
      else if (t === "heatmap")    lines.push(`sns.heatmap(df.select_dtypes(include='number').corr(), annot=True, cmap='coolwarm', ax=ax)`);
      else if (t === "pie")        lines.push(`df['${x}'].value_counts().head(10).plot.pie(ax=ax, autopct='%1.1f%%')`);
      else                         lines.push(`# ${t} chart: x='${x}'${y ? `, y='${y}'` : ""}${hue ? `, hue='${hue}'` : ""}`);
      lines.push(`ax.set_title('${(plot.title || "").replace(/'/g, "\\'")}')`);
      lines.push("plt.tight_layout()");
      lines.push(`plt.savefig('chart_${i + 1}_${(t || "plot")}.png', dpi=150, bbox_inches='tight')`);
      lines.push("plt.close()");
      lines.push(`print("Saved chart_${i + 1}_${(t || "plot")}.png")`);
      lines.push("");
    });
  }

  // ── MODEL TRAINING ────────────────────────────────────────────────────────
  if (sections.model && trainConfig?.targetCol) {
    lines.push("# ── 5. Model Training ────────────────────────────────────────");
    lines.push(`# Algorithm : ${algo.toUpperCase()}`);
    lines.push(`# Target    : ${target}`);
    lines.push(`# Task      : ${trainResults?.task || "auto-detect"}`);
    lines.push(`# Test size : ${Math.round(testSize * 100)}%`);
    lines.push("");
    lines.push("# Prepare features");
    lines.push(`features = [c for c in df.columns if c != '${target}']`);
    lines.push("X = df[features].copy()");
    lines.push(`y = df['${target}'].copy()`);
    lines.push("");
    lines.push("# Encode categoricals");
    lines.push("le_map = {}");
    lines.push("for col in X.select_dtypes(include='object').columns:");
    lines.push("    le = LabelEncoder()");
    lines.push("    X[col] = le.fit_transform(X[col].astype(str))");
    lines.push("    le_map[col] = le");
    lines.push("");
    if (isClass) {
      lines.push("# Encode target if categorical");
      lines.push("if y.dtype == 'object':");
      lines.push("    le_target = LabelEncoder()");
      lines.push("    y = le_target.fit_transform(y.astype(str))");
    }
    lines.push("");
    lines.push("# Train/test split");
    lines.push(`X_train, X_test, y_train, y_test = train_test_split(`);
    lines.push(`    X, y, test_size=${testSize}, random_state=42, ${isClass ? "stratify=y" : ""}`);
    lines.push(")");
    lines.push("");
    lines.push("# Scale");
    lines.push("scaler = StandardScaler()");
    lines.push("X_train = scaler.fit_transform(X_train)");
    lines.push("X_test  = scaler.transform(X_test)");
    lines.push("");
    const cls = isClass ? (MODEL_CLASS_MAP[algo] || "RandomForestClassifier") : (MODEL_CLASS_MAP[algo + "_r"] || "RandomForestRegressor");
    lines.push(`# Train`);
    lines.push(`model = ${cls}(random_state=42)`);
    lines.push("model.fit(X_train, y_train)");
    lines.push("y_pred = model.predict(X_test)");
    lines.push("");
    lines.push("# Evaluate");
    if (isClass) {
      lines.push("print('\\n── Classification Report ──────────────────────────────')");
      lines.push("print(classification_report(y_test, y_pred))");
      lines.push("print('Confusion matrix:')");
      lines.push("print(confusion_matrix(y_test, y_pred))");
    } else {
      lines.push("rmse = np.sqrt(mean_squared_error(y_test, y_pred))");
      lines.push("r2   = r2_score(y_test, y_pred)");
      lines.push("print(f'RMSE : {rmse:.4f}')");
      lines.push("print(f'R²   : {r2:.4f}')");
    }
    if (trainResults?.metrics) {
      lines.push("");
      lines.push("# DataPilot results for reference:");
      Object.entries(trainResults.metrics).forEach(([k, v]) => {
        if (typeof v === "number") lines.push(`# ${k.toUpperCase()} = ${v < 1 ? (v * 100).toFixed(2) + "%" : v.toFixed(4)}`);
      });
    }
    lines.push("");
    lines.push("# Save model");
    lines.push("joblib.dump(model,  'model.pkl')");
    lines.push("joblib.dump(scaler, 'scaler.pkl')");
    lines.push("print('Model saved as model.pkl')");
    lines.push("");
  }

  // ── PREDICTIONS ───────────────────────────────────────────────────────────
  if (sections.predict && trainConfig?.targetCol) {
    lines.push("# ── 6. Predict on New Data ───────────────────────────────────");
    lines.push("# new_df = pd.read_csv('new_data.csv')");
    lines.push("# Encode categoricals the same way:");
    lines.push("# for col, le in le_map.items():");
    lines.push("#     new_df[col] = le.transform(new_df[col].astype(str))");
    lines.push("# X_new = scaler.transform(new_df[features])");
    lines.push("# predictions = model.predict(X_new)");
    lines.push("# pd.DataFrame({'prediction': predictions}).to_csv('predictions.csv', index=False)");
    lines.push("");
  }

  return lines.join("\n");
}

// ── notebook builder ──────────────────────────────────────────────────────────
function buildNotebook(pyCode, fileName, sections) {
  const cells = [];
  const addMd  = src => cells.push({ cell_type:"markdown", metadata:{}, source:[src] });
  const addCode = src => cells.push({ cell_type:"code", execution_count:null, metadata:{}, outputs:[], source:[src] });

  addMd(`# DataPilot Generated Notebook\n**Dataset:** \`${fileName || "dataset.csv"}\`  \n**Generated:** ${new Date().toLocaleString()}`);

  // Split the python code into logical sections using the comment markers
  const sectionMarkers = [
    { marker: "# ── 1. Load Data", title: "## 1. Load Data" },
    { marker: "# ── 2. Data Cleaning", title: "## 2. Data Cleaning" },
    { marker: "# ── 3. Exploratory Data Analysis", title: "## 3. Exploratory Data Analysis" },
    { marker: "# ── 4. Visualizations", title: "## 4. Visualizations" },
    { marker: "# ── 5. Model Training", title: "## 5. Model Training" },
    { marker: "# ── 6. Predict on New Data", title: "## 6. Predictions" },
  ];

  // Split code by section
  const codeLines = pyCode.split("\n");
  let currentSection = [];
  let currentTitle   = null;
  const pendingCode  = [];

  const flush = () => {
    if (currentTitle) addMd(currentTitle);
    const block = currentSection.join("\n").trim();
    if (block) addCode(block);
    currentSection = [];
    currentTitle   = null;
  };

  codeLines.forEach(line => {
    const marker = sectionMarkers.find(s => line.startsWith(s.marker));
    if (marker) {
      flush();
      currentTitle = marker.title;
    } else {
      currentSection.push(line);
    }
  });
  flush();

  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python", version: "3.9.0" },
    },
    cells,
  }, null, 2);
}

// ── markdown builder ──────────────────────────────────────────────────────────
function buildMarkdown({ fileName, columns, summary, rowCount,
  trainConfig, trainResults, cleanOpLog, savedPlots, sections }) {
  const lines = [];
  const isClass = trainResults?.task === "classification";
  const numericCols = columns.filter(c => summary?.[c]?.mean !== undefined);

  lines.push(`# DataPilot Analysis Report`);
  lines.push(`> **Dataset:** \`${fileName || "dataset.csv"}\` · **Generated:** ${new Date().toLocaleString()}`);
  lines.push("");

  if (sections.load) {
    lines.push("## Dataset Overview");
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| File | \`${fileName}\` |`);
    lines.push(`| Rows | ${rowCount?.toLocaleString()} |`);
    lines.push(`| Columns | ${columns.length} |`);
    lines.push(`| Numeric Columns | ${numericCols.length} |`);
    lines.push(`| Categorical Columns | ${columns.length - numericCols.length} |`);
    lines.push("");
    lines.push("### Columns");
    lines.push("| Column | Type | Non-Null Count | Unique |");
    lines.push("|--------|------|---------------|--------|");
    columns.slice(0, 30).forEach(col => {
      const s = summary?.[col];
      if (s && col !== "__meta__") {
        const type = s.mean !== undefined ? "numeric" : "categorical";
        lines.push(`| \`${col}\` | ${type} | ${s.count?.toLocaleString() || "—"} | ${s.unique || "—"} |`);
      }
    });
    if (columns.length > 30) lines.push(`| … | … | … | … |`);
    lines.push("");
  }

  if (sections.cleaning && cleanOpLog?.length > 0) {
    lines.push("## Data Cleaning Steps");
    lines.push("Operations applied (most recent first):");
    lines.push("");
    cleanOpLog.forEach((op, i) => {
      const icons = { fill:"🔧", drop_col:"🗑️", drop_dupes:"♻️", rename:"✏️", cast:"🔄" };
      lines.push(`${i + 1}. ${icons[op.type] || "•"} **${op.label}** _(${op.time})_`);
    });
    lines.push("");
  }

  if (sections.eda) {
    lines.push("## Exploratory Analysis");
    if (numericCols.length > 0) {
      lines.push("### Numeric Column Statistics");
      lines.push("| Column | Mean | Std | Min | Max |");
      lines.push("|--------|------|-----|-----|-----|");
      numericCols.slice(0, 20).forEach(col => {
        const s = summary[col];
        const fmt = v => v != null ? parseFloat(v).toLocaleString(undefined, {maximumFractionDigits: 4}) : "—";
        lines.push(`| \`${col}\` | ${fmt(s.mean)} | ${fmt(s.std)} | ${fmt(s.min)} | ${fmt(s.max)} |`);
      });
      lines.push("");
    }
  }

  if (sections.visualization && savedPlots?.filter(p => p.image).length > 0) {
    lines.push("## Visualizations");
    lines.push(`> ${savedPlots.filter(p => p.image).length} chart(s) generated in DataPilot.`);
    lines.push("");
    savedPlots.filter(p => p.image).forEach((plot, i) => {
      lines.push(`### Chart ${i + 1}: ${plot.title || plot.type}`);
      lines.push(`- **Type:** ${plot.type}`);
      if (plot.x) lines.push(`- **X:** \`${plot.x}\``);
      if (plot.y) lines.push(`- **Y:** \`${plot.y}\``);
      if (plot.hue) lines.push(`- **Hue:** \`${plot.hue}\``);
      lines.push(`\n![${plot.title || "Chart"}](chart_${i + 1}.png)\n`);
      lines.push("");
    });
  }

  if (sections.model && trainConfig?.targetCol) {
    lines.push("## Model Training");
    lines.push(`| Setting | Value |`);
    lines.push(`|---------|-------|`);
    lines.push(`| Algorithm | ${(trainConfig.selectedModel || "rf").toUpperCase()} |`);
    lines.push(`| Task | ${trainResults?.task || "unknown"} |`);
    lines.push(`| Target | \`${trainConfig.targetCol}\` |`);
    lines.push(`| Test Size | ${Math.round((trainConfig.testSize || 0.2) * 100)}% |`);
    if (trainResults?.train_size) lines.push(`| Train Rows | ${trainResults.train_size?.toLocaleString()} |`);
    if (trainResults?.test_size)  lines.push(`| Test Rows  | ${trainResults.test_size?.toLocaleString()} |`);
    lines.push("");
    if (trainResults?.metrics) {
      lines.push("### Performance Metrics");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");
      Object.entries(trainResults.metrics).forEach(([k, v]) => {
        if (typeof v === "number") {
          const val = v < 1 ? (v * 100).toFixed(2) + "%" : v.toFixed(4);
          lines.push(`| ${k.toUpperCase()} | **${val}** |`);
        }
      });
      lines.push("");
    }
    if (trainResults?.feature_importance?.length > 0) {
      lines.push("### Top Feature Importances");
      lines.push("| Feature | Importance |");
      lines.push("|---------|-----------|");
      trainResults.feature_importance.slice(0, 10).forEach(f => {
        lines.push(`| \`${f.feature}\` | ${f.importance.toFixed(4)} |`);
      });
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*Generated by [DataPilot]");

  return lines.join("\n");
}

// ── main page ─────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "load",          label: "Load Data",       icon: <Ico d={Icons.upload} /> },
  { id: "cleaning",      label: "Cleaning",         icon: <Ico d="M15 4V2m0 14v-2M8 9H2m14 0h-2" /> },
  { id: "eda",           label: "EDA",              icon: <Ico d={Icons.chart} /> },
  { id: "visualization", label: "Visualizations",   icon: <Ico d={Icons.predict} /> },
  { id: "model",         label: "Model Training",   icon: <Ico d={Icons.cpu} /> },
  { id: "predict",       label: "Predictions",      icon: <Ico d={Icons.predict} /> },
];

export default function PageCodeGen() {
  const {
    sessionId, fileName, columns, summary, rowCount,
    trainConfig, trainResults,
    cleanOpLog, savedPlots,
    activeSessionExpired,
  } = useDataPilot();

  const hasData    = !!sessionId && !activeSessionExpired;
  const hasCleaning = Array.isArray(cleanOpLog) && cleanOpLog.length > 0;
  const hasModel   = !!trainConfig?.targetCol;
  const hasViz     = Array.isArray(savedPlots) && savedPlots.filter(p => p.image).length > 0;

  const sectionAvailability = {
    load:          hasData,
    cleaning:      hasData,
    eda:           hasData,
    visualization: hasViz,
    model:         hasModel,
    predict:       hasModel,
  };

  const [format,   setFormat]   = useState("py");
  const [sections, setSections] = useState({
    load: true, cleaning: true, eda: true,
    visualization: hasViz, model: hasModel, predict: false,
  });
  const [copied, setCopied] = useState(false);

  const toggleSection = (id) => {
    if (!sectionAvailability[id]) return;
    setSections(s => ({ ...s, [id]: !s[id] }));
  };

  const ctx = { fileName, columns: columns || [], summary, rowCount, trainConfig, trainResults, cleanOpLog, savedPlots };

  const generatedCode = useMemo(() => {
    if (!hasData) return "";
    const activeSections = sections;
    if (format === "py")  return buildPython({ ...ctx, sections: activeSections });
    if (format === "md")  return buildMarkdown({ ...ctx, sections: activeSections });
    if (format === "ipynb") {
      const py = buildPython({ ...ctx, sections: activeSections });
      return buildNotebook(py, fileName, activeSections);
    }
    return "";
  }, [format, sections, sessionId, trainResults, cleanOpLog, savedPlots]);

  const langLabel = format === "py" ? "python" : format === "md" ? "markdown" : "json";

  const handleDownload = () => {
    const ext  = format === "ipynb" ? "ipynb" : format;
    const name = (fileName?.replace(/\.[^.]+$/, "") || "datapilot") + "_export." + ext;
    const blob = new Blob([generatedCode], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!hasData) return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Code Export</div>
        <div className="page-subtitle">Generate runnable code from your DataPilot session</div>
      </div>
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width:56, height:56, borderRadius:14, background: activeSessionExpired ? "rgba(248,113,113,0.08)" : "var(--accent-dim)", border: activeSessionExpired ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(108,99,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
          {activeSessionExpired
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <IcoCode size={22} />
          }
        </div>
        <div style={{ fontSize:14, fontWeight:500, color:"var(--text)", marginBottom:6 }}>
          {activeSessionExpired ? "Session Expired" : "No Session Active"}
        </div>
        <div style={{ fontSize:12, color:"var(--text3)" }}>
          {activeSessionExpired
            ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue."
            : "Upload a dataset first, then come back to export code."}
        </div>
      </div>
    </div>
  );

  const lineCount = generatedCode.split("\n").length;
  const charCount = generatedCode.length;

  return (
    <div className="page-enter">
      {/* ── header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="page-title">Code Export</div>
          <div className="page-subtitle">
            Runnable code generated from your session on{" "}
            <strong style={{ color:"var(--text)" }}>{fileName}</strong>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button className="btn-secondary" onClick={handleCopyAll}>
            {copied ? <IcoCheck /> : <IcoCopy />}
            {copied ? "Copied!" : "Copy All"}
          </button>
          <button className="btn-primary" onClick={handleDownload}>
            <IcoDown />
            Download .{format === "ipynb" ? "ipynb" : format}
          </button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:16, alignItems:"start" }} className="codegen-layout">

        {/* ── LEFT: controls ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* session summary */}
          <div className="card">
            <div className="card-title"><IcoSpark /> Session Summary</div>
            {[
              { label:"Dataset",    value: fileName?.length > 22 ? fileName.slice(0,22)+"…" : fileName },
              { label:"Rows",       value: rowCount?.toLocaleString() },
              { label:"Columns",    value: columns?.length },
              { label:"Charts",     value: savedPlots?.filter(p=>p.image).length || 0 },
              { label:"Clean ops",  value: cleanOpLog?.length || 0 },
              { label:"Model",      value: trainConfig?.targetCol ? `${(trainConfig.selectedModel||"rf").toUpperCase()} → ${trainConfig.targetCol}` : "none" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace" }}>{label}</span>
                <span style={{ fontSize:11.5, color:"var(--text2)", fontWeight:500, maxWidth:130, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>{value ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* section toggles */}
          <div className="card">
            <div className="card-title"><IcoCode /> Include Sections</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {SECTIONS.map(s => (
                <SectionChip
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  icon={s.icon}
                  enabled={sections[s.id]}
                  onToggle={toggleSection}
                  hasData={sectionAvailability[s.id]}
                />
              ))}
            </div>
          </div>

          {/* stats */}
          <div className="card">
            <div className="card-title"><IcoPy /> Output Stats</div>
            {[
              { label:"Lines",  value: lineCount.toLocaleString() },
              { label:"Chars",  value: charCount.toLocaleString() },
              { label:"Format", value: format.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace" }}>{label}</span>
                <span style={{ fontSize:11.5, color:"var(--accent2)", fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: preview ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:0, minWidth:0 }}>

          {/* format tabs */}
          <div className="codegen-tabs" style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"var(--bg2)", borderRadius:"14px 14px 0 0" }}>
            <FormatTab id="py"    label="Python Script"   icon={<IcoPy />}   ext=".py"    active={format==="py"}    onClick={setFormat} />
            <FormatTab id="ipynb" label="Jupyter Notebook" icon={<IcoNb />}  ext=".ipynb" active={format==="ipynb"} onClick={setFormat} />
            <FormatTab id="md"    label="Markdown Report" icon={<IcoMd />}   ext=".md"    active={format==="md"}    onClick={setFormat} />
          </div>

          {/* description bar */}
          <div style={{ padding:"8px 16px", background:"var(--bg3)", borderLeft:"1px solid var(--border)", borderRight:"1px solid var(--border)", fontSize:11, color:"var(--text3)" }}>
            {format === "py"    && "Standalone Python script — run with: python export.py"}
            {format === "ipynb" && "Jupyter notebook — open with: jupyter notebook export.ipynb"}
            {format === "md"    && "Markdown report — render in any Markdown viewer or paste into Notion/Confluence"}
          </div>

          {/* code block */}
          <div style={{ borderRadius:"0 0 14px 14px", overflow:"hidden" }}>
            <CodeBlock code={generatedCode} language={langLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}