import { useState } from "react";
import { getAuth } from "firebase/auth";
import { useDataPilot } from "../DataPilotContext.jsx";

// ── icons ──────────────────────────────────────────────────────────────────────
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const IcoCheck  = ({ size }) => <Ico size={size} d="M20 6L9 17l-5-5" />;
const IcoX      = ({ size }) => <Ico size={size} d="M18 6L6 18M6 6l12 12" />;
const IcoStar   = ({ size }) => <Ico size={size} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
const IcoZap    = ({ size }) => <Ico size={size} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />;
const IcoArrow  = ({ size }) => <Ico size={size} d="M5 12h14M12 5l7 7-7 7" />;
const IcoShield = ({ size }) => <Ico size={size} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const IcoGlobe  = ({ size }) => <Ico size={size} d="M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />;

// ── feature table data ─────────────────────────────────────────────────────────
const FEATURES = [
  {
    category: "Uploads & Files",
    rows: [
      { label: "File formats",              free: "CSV, TSV, XLSX", pro: "CSV, TSV, XLSX, JSON, Parquet" },
      { label: "Max file size",             free: "10 MB",         pro: "50 MB" },
      { label: "Max rows per dataset",      free: "20,000",        pro: "500,000" },
    ],
  },
  {
    category: "Analysis & Visualization",
    rows: [
      { label: "Data overview & stats",     free: true,            pro: true },
      { label: "Correlation matrix",        free: true,            pro: true },
      { label: "Charts & visualizations",   free: true,            pro: true },
      { label: "Data cleaning tools",       free: true,            pro: true },
      { label: "Compare mode (side-by-side)", free: false,          pro: true },
    ],
  },
  {
    category: "Machine Learning",
    rows: [
      { label: "Random Forest",             free: true,            pro: true },
      { label: "Logistic Regression",       free: true,            pro: true },
      { label: "XGBoost",                   free: false,           pro: true },
      { label: "SVM",                       free: false,           pro: true },
      { label: "Models per session",        free: "1",             pro: "4" },
      { label: "Model memory (active TTL)",  free: "10 min",        pro: "60 min" },
      { label: "Model download (.pkl)",     free: false,           pro: true },
    ],
  },
  {
    category: "Forecasting",
    rows: [
      { label: "Time-series forecasting (Holt-Winters)", free: false, pro: true },
      { label: "Automatic seasonality detection",        free: false, pro: true },
      { label: "Forecast confidence bands",               free: false, pro: true },
      { label: "Forecast export (CSV/PDF)",                free: false, pro: true },
    ],
  },
  {
    category: "Predictions & Scoring",
    rows: [
      { label: "Score current dataset",     free: true,            pro: true },
      { label: "Score new file upload",     free: false,           pro: true },
    ],
  },
  {
    category: "Exports & Reports",
    rows: [
      { label: "Python code export",        free: true,            pro: true },
      { label: "Generate report (preview)", free: true,            pro: true },
      { label: "Download report (HTML/CSV/JSON/PDF)", free: false, pro: true },
      { label: "Jupyter notebooks (.ipynb)", free: false,           pro: true },
    ],
  },
  {
    category: "Sessions & Storage",
    rows: [
      { label: "Session duration",          free: "90 min",        pro: "12 hours" },
      { label: "Cloud backup",              free: "Files + workspace metadata", pro: "Files + workspace metadata + trained models" },
      { label: "Workspace restore",         free: "Files + chat/cleaning/train config", pro: "Files + chat/cleaning/train config + trained models" },
      { label: "AI insights queries/day",   free: "15/day",        pro: "Unlimited" },
    ],
  },
];

// ── cell renderer ──────────────────────────────────────────────────────────────
function Cell({ value, isPro }) {
  const accent = isPro ? "var(--accent2)" : "var(--text3)";
  if (value === true)  return <span style={{ color: isPro ? accent : "var(--green)" }}><IcoCheck size={15} /></span>;
  if (value === false) return <span style={{ color: "var(--text3)", opacity: 0.4 }}><IcoX size={14} /></span>;
  return (
    <span style={{
      fontSize: 12.5, fontFamily: "'DM Mono', monospace",
      color: isPro ? accent : "var(--text2)", fontWeight: isPro ? 600 : 400,
    }}>
      {value}
    </span>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function PagePricing() {
  const ctx = useDataPilot();
  const userProfile = ctx?.userProfile ?? { plan: "free" };
  const currentPlan = userProfile?.plan?.toLowerCase() || "free";

  const [showTable, setShowTable] = useState(false);
  const [upgradeError, setUpgradeError] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async () => {

  setUpgradeError(null);
  setUpgrading(true);

  try {

    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      setUpgradeError("Please log in again before upgrading.");
      setUpgrading(false);
      return;
    }
    const idToken = await currentUser.getIdToken();

    const response = await fetch(
      "/api/payments/create-checkout",
      {
        method: "POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization": `Bearer ${idToken}`
        }
      }
    );


    const text = await response.text();

console.log("Backend response:", text);

const data = text ? JSON.parse(text) : {};


    if(data.data?.link){
        window.location.href = data.data.link;
        return; // navigating away — leave `upgrading` true so the button doesn't flicker
    }

    setUpgradeError(
      data.detail || "Couldn't start checkout right now. Please try again in a moment."
    );
    setUpgrading(false);

  } catch(error){

    console.error(
      "Payment failed",
      error
    );
    setUpgradeError("Couldn't reach the payment server. Check your connection and try again.");
    setUpgrading(false);

  }

};

  return (
    <div className="page-enter" style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 60, padding: "0 16px" }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "clamp(32px, 8vw, 48px)", paddingTop: 8 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 20,
          background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.25)",
          fontSize: "clamp(11px, 2vw, 12px)", color: "var(--accent2)", fontFamily: "'DM Mono', monospace",
          marginBottom: 18, textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          <IcoZap size={12} /> Simple pricing
        </div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(24px, 6vw, 40px)",
          fontWeight: 800, color: "var(--text)", lineHeight: 1.15, margin: "0 0 14px",
        }}>
          Pay for what you need.<br />
          <span style={{ color: "var(--accent2)" }}>Nothing more.</span>
        </h1>
        <p style={{
          fontSize: "clamp(13px, 3vw, 15px)", color: "var(--text3)", maxWidth: 480,
          margin: "0 auto", lineHeight: 1.7, padding: "0 8px",
        }}>
          Start free with 20K rows and 15 daily AI queries. Upgrade to Pro for advanced models (XGBoost, SVM), time-series forecasting, larger datasets (500K rows), and extended sessions.
        </p>
      </div>

      {/* ── Plan Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "clamp(14px, 4vw, 20px)", marginBottom: "clamp(24px, 6vw, 36px)" }}>

        {/* FREE */}
        <div className="card" style={{
          position: "relative", padding: "clamp(20px, 5vw, 28px)",
          border: currentPlan === "free"
            ? "1px solid rgba(108,99,255,0.4)"
            : "1px solid var(--border)",
          transition: "border-color 0.2s",
        }}>
          {currentPlan === "free" && (
            <div style={{
              position: "absolute", top: -11, left: "clamp(12px, 4vw, 20px)",
              background: "var(--bg2)", border: "1px solid rgba(108,99,255,0.3)",
              borderRadius: 6, padding: "2px 10px",
              fontSize: "clamp(10px, 2vw, 11px)", color: "var(--accent2)", fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Current plan
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600, color: "var(--text3)",
              fontFamily: "'DM Mono', monospace", textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 10,
            }}>
              Free
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(32px, 8vw, 40px)", fontWeight: 800, color: "var(--text)", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>$0</span>
              <span style={{ fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text3)" }}>/ forever</span>
            </div>
            <p style={{ fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text3)", marginTop: 10, lineHeight: 1.6 }}>
              Everything you need to explore, clean, and visualize datasets. No credit card required.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {[
              "CSV, TSV, and XLSX files (10 MB max)",
              "Up to 20,000 rows per dataset",
              "Data overview, stats & correlation matrix",
              "15 AI insights queries per day",
              "Charts and visualizations",
              "Data cleaning tools",
              "Random Forest, Logistic Regression only",
              "1 trained model per session (10 min memory)",
              "Score current dataset",
              "Python code export + Markdown(.md) export",
              "90-minute session duration",
              "Cloud backup (files + workspace metadata)",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text2)" }}>
                <span style={{ color: "var(--green)", flexShrink: 0 }}><IcoCheck size={14} /></span>
                {f}
              </div>
            ))}
          </div>

          <button
            className="btn-secondary"
            style={{
              width: "100%", justifyContent: "center",
              opacity: currentPlan === "free" ? 0.5 : 1,
              cursor: currentPlan === "free" ? "default" : "pointer",
            }}
            disabled={currentPlan === "free"}
          >
            {currentPlan === "free" ? "Current plan" : "Downgrade to Free"}
          </button>
        </div>

        {/* PRO */}
        <div style={{
          position: "relative", borderRadius: 14, padding: "clamp(20px, 5vw, 28px)",
          background: "linear-gradient(145deg, rgba(108,99,255,0.1) 0%, rgba(108,99,255,0.03) 100%)",
          border: "1px solid rgba(108,99,255,0.35)",
          boxShadow: "0 0 40px rgba(108,99,255,0.08)",
        }}>
          {/* subtle inner glow */}
          <div style={{
            position: "absolute", top: -1, right: -1, bottom: -1, left: -1,
            borderRadius: 14, pointerEvents: "none",
            background: "linear-gradient(145deg, rgba(108,99,255,0.15), transparent 60%)",
          }} />

          <div style={{
            position: "absolute", top: -11, left: "clamp(12px, 4vw, 20px)",
            background: "linear-gradient(90deg, #6c63ff, #9c8fff)",
            borderRadius: 6, padding: "2px 12px",
            fontSize: "clamp(10px, 2vw, 11px)", color: "#fff", fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase", letterSpacing: "0.07em",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <IcoStar size={10} /> Most popular
          </div>

          {currentPlan === "pro" && (
            <div style={{
              position: "absolute", top: -11, right: "clamp(12px, 4vw, 20px)",
              background: "var(--bg2)", border: "1px solid rgba(108,99,255,0.3)",
              borderRadius: 6, padding: "2px 10px",
              fontSize: "clamp(10px, 2vw, 11px)", color: "var(--accent2)", fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Current plan
            </div>
          )}

          <div style={{ marginBottom: 20, position: "relative" }}>
            <div style={{
              fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600, color: "var(--accent2)",
              fontFamily: "'DM Mono', monospace", textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: 10,
            }}>
              Pro
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(32px, 8vw, 40px)", fontWeight: 800, color: "var(--text)", fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>$12</span>
              <span style={{ fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text3)" }}>/ month</span>
            </div>
            <p style={{ fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text3)", marginTop: 10, lineHeight: 1.6, position: "relative" }}>
              For analysts and professionals who work with larger files and need more power — including XGBoost, SVM, time-series forecasting, JSON/Parquet uploads, and longer sessions.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, position: "relative" }}>
            {[
              "CSV, TSV, XLSX, JSON, and Parquet files (50 MB max)",
              "Up to 500,000 rows per dataset",
              "Everything in Free plan",
              "Unlimited AI insights queries",
              "Compare mode — analyze multiple datasets side by side",
              "XGBoost & SVM algorithms",
              "Time-series forecasting (Holt-Winters, seasonality detection, confidence bands)",
              "Multiple trained models per session (60 min memory)",
              "Save and download models (.pkl)",
              "Score new files and datasets",
              "PDF and Jupyter notebook exports",
              "12-hour session duration",
              "Cloud backup (files + workspace metadata + trained models)",
              "Workspace restore (files + workspace metadata + trained models)",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text2)" }}>
                <span style={{ color: "var(--accent2)", flexShrink: 0 }}><IcoCheck size={14} /></span>
                {f}
              </div>
            ))}
          </div>

          <button
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", position: "relative", gap: 8 }}
            onClick={currentPlan !== "pro" ? handleUpgrade : undefined}
            disabled={currentPlan === "pro" || upgrading}
          >
            {currentPlan === "pro"
              ? "Current plan"
              : upgrading
                ? "Redirecting to checkout…"
                : <><span>Upgrade to Pro</span> <IcoArrow size={14} /></>}
          </button>
          {upgradeError && (
            <div style={{
              marginTop: 10, fontSize: 12.5, color: "var(--red, #e5484d)",
              textAlign: "center", lineHeight: 1.5,
            }}>
              {upgradeError}
            </div>
          )}
        </div>
      </div>

      {/* ── Comparison Table Toggle ── */}
      <div style={{ textAlign: "center", marginBottom: showTable ? 24 : 0 }}>
        <button
          className="btn-secondary"
          style={{ fontSize: "clamp(12px, 2vw, 13px)", gap: 8 }}
          onClick={() => setShowTable(v => !v)}
        >
          {showTable ? "Hide" : "See full"} feature comparison
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ transition: "transform 0.2s", transform: showTable ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* ── Feature Table ── */}
      {showTable && (
        <div className="card" style={{ padding: 0, overflow: "auto", marginBottom: 36 }}>
          {/* header row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 80px 80px",
            padding: "clamp(10px, 3vw, 14px) clamp(12px, 3vw, 20px)", background: "var(--bg3)",
            borderBottom: "1px solid var(--border)",
            position: "sticky", top: 0, zIndex: 2,
          }}>
            <div style={{ fontSize: "clamp(10px, 2vw, 12px)", color: "var(--text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis" }}>Feature</div>
            <div style={{ fontSize: "clamp(10px, 2vw, 12px)", color: "var(--text3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis" }}>Free</div>
            <div style={{ fontSize: "clamp(10px, 2vw, 12px)", color: "var(--accent2)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis" }}>Pro</div>
          </div>

          {FEATURES.map(({ category, rows }, ci) => (
            <div key={category}>
              <div style={{
                padding: "clamp(8px, 2vw, 10px) clamp(12px, 3vw, 20px) clamp(4px, 1.5vw, 6px)",
                fontSize: "clamp(10px, 1.8vw, 11px)", color: "var(--text3)", fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: "rgba(108,99,255,0.04)",
                borderBottom: "1px solid var(--border)",
              }}>
                {category}
              </div>
              {rows.map(({ label, free, pro }, ri) => (
                <div
                  key={label}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px",
                    padding: "clamp(8px, 2vw, 11px) clamp(12px, 3vw, 20px)",
                    borderBottom: ci === FEATURES.length - 1 && ri === rows.length - 1
                      ? "none"
                      : "1px solid var(--border)",
                    background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  }}
                >
                  <span style={{ fontSize: "clamp(12px, 2vw, 13px)", color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <Cell value={free} isPro={false} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <Cell value={pro} isPro={true} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Trust signals ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "clamp(10px, 3vw, 14px)",
        marginTop: showTable ? 0 : "clamp(24px, 6vw, 36px)",
      }}>
        {[
          { icon: <IcoShield size={18} />, title: "No lock-in",      body: "Cancel anytime. Export your data before you go." },
          { icon: <IcoZap size={18} />,    title: "Instant access",   body: "Upgrade takes effect immediately. No waiting, no delays." },
          { icon: <IcoGlobe size={18} />,  title: "Built to scale",   body: "From solo analysts to consulting teams. Grows with your workflow." },
        ].map(({ icon, title, body }) => (
          <div key={title} className="card" style={{ padding: "clamp(14px, 4vw, 18px) clamp(14px, 4vw, 20px)", textAlign: "center" }}>
            <div style={{ color: "var(--accent2)", marginBottom: 10, display: "flex", justifyContent: "center" }}>{icon}</div>
            <div style={{ fontSize: "clamp(12px, 2vw, 13px)", fontWeight: 600, color: "var(--text)", marginBottom: 6, fontFamily: "'Syne', sans-serif" }}>{title}</div>
            <div style={{ fontSize: "clamp(11px, 1.8vw, 12px)", color: "var(--text3)", lineHeight: 1.6 }}>{body}</div>
          </div>
        ))}
      </div>

      {/* ── FAQ ── */}
      <div style={{ marginTop: "clamp(32px, 8vw, 48px)" }}>
        <h2 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(18px, 4vw, 20px)", fontWeight: 700,
          color: "var(--text)", marginBottom: 20, textAlign: "center",
        }}>
          Common questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(8px, 2vw, 10px)" }}>
          {[
            {
              q: "Can I stay on the free plan forever?",
              a: "Yes. The free plan has no time limit. You only upgrade when you need more.",
            },
            {
              q: "What happens to my data if I downgrade?",
              a: "Your cloud sessions stay accessible for 7 days after downgrading, then expire. You can export everything before then.",
            },
            {          
              q: "What payment methods are supported?",
              a: "We support card payments, bank transfers, and other local payment methods through Flutterwave. More payment options are coming soon.",
            },
            {
              q: "Is there a team or enterprise plan?",
              a: "Not yet — but it's on the roadmap. If you have a team use case, reach out via the feedback button and we'll prioritize it.",
            },
          ].map(({ q, a }) => (
            <FAQItem key={q} question={q} answer={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FAQ accordion item ─────────────────────────────────────────────────────────
function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card"
      style={{
        padding: "clamp(12px, 3vw, 16px) clamp(14px, 3vw, 20px)", cursor: "pointer", transition: "border-color 0.2s",
        borderColor: open ? "rgba(108,99,255,0.3)" : "var(--border)",
      }}
      onClick={() => setOpen(v => !v)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "clamp(8px, 2vw, 16px)" }}>
        <span style={{ fontSize: "clamp(12px, 2vw, 13.5px)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{question}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{
            flexShrink: 0, color: "var(--text3)",
            transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && (
        <div style={{
          fontSize: "clamp(12px, 1.8vw, 13px)", color: "var(--text3)", lineHeight: 1.7,
          marginTop: "clamp(8px, 2vw, 12px)", paddingTop: "clamp(8px, 2vw, 12px)", borderTop: "1px solid var(--border)",
        }}>
          {answer}
        </div>
      )}
    </div>
  );
}