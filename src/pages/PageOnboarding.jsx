/**
 * PageOnboarding.jsx — DataPilot
 *
 * Rendered by AppShell when the authenticated user has not yet set
 * onboardingSeen: true in Firestore. App.jsx owns the flag check and
 * the markSeen() write — this component is pure UI + UX.
 *
 * Props
 *   onStart  () => void   → "Upload your first dataset"
 *   onSkip   () => void   → "Skip for now"
 */

import { useMemo } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot } from "../DataPilotContext.jsx";

// ─── Workflow steps ────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "upload",
    num: "01",
    title: "Upload",
    desc: "Drop in a CSV or Excel file. DataPilot reads the schema and previews your data immediately.",
    icon: Icons.upload,
    color: "#6c63ff",
    glow: "rgba(108,99,255,0.16)",
  },
  {
    id: "clean",
    num: "02",
    title: "Clean",
    desc: "Fix nulls, rename columns, cast types, and encode features — without writing a line of code.",
    icon: Icons.wand,
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.14)",
  },
  {
    id: "analyze",
    num: "03",
    title: "Analyze & Chat",
    desc: "Ask plain-English questions. Get AI-driven summaries, correlations, and anomaly flags.",
    icon: Icons.brain,
    color: "#34d399",
    glow: "rgba(52,211,153,0.13)",
  },
  {
    id: "visualize",
    num: "04",
    title: "Visualize",
    desc: "Pick from 17 chart types — histogram, scatter, heatmap, pair plot — in a single click.",
    icon: Icons.predict,
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.13)",
  },
  {
    id: "model",
    num: "05",
    title: "Train & Export",
    desc: "Train RF, XGBoost, LR, or SVM. Score new data. Export reproducible Python or Jupyter code.",
    icon: Icons.cpu,
    color: "#fb923c",
    glow: "rgba(251,146,60,0.13)",
  },
];

// ─── Atoms ────────────────────────────────────────────────────────────────────

function SvgIcon({ d, size = 14, strokeWidth = 1.75 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// ─── Background — mirrors PageAuth GridBackground ─────────────────────────────

function Atmosphere() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(108,99,255,0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(108,99,255,0.045) 1px, transparent 1px)
        `,
        backgroundSize: "38px 38px",
        maskImage: "radial-gradient(ellipse 72% 62% at 50% 38%, black 28%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 72% 62% at 50% 38%, black 28%, transparent 100%)",
      }} />
      <div style={{
        position: "absolute", top: "-18%", left: "-8%",
        width: "50%", height: "60%", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(108,99,255,0.13) 0%, transparent 65%)",
        filter: "blur(10px)",
      }} />
      <div style={{
        position: "absolute", bottom: "-20%", right: "-6%",
        width: "44%", height: "54%", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 65%)",
        filter: "blur(14px)",
      }} />
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
        padding: "13px 15px",
        borderRadius: 13,
        border: "1px solid var(--border)",
        background: "linear-gradient(135deg, rgba(255,255,255,0.032), rgba(255,255,255,0.012))",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${step.color}55`;
        e.currentTarget.style.boxShadow = `0 4px 20px ${step.glow}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(circle at top right, ${step.glow}, transparent 55%)`,
      }} />
      <div style={{
        flexShrink: 0,
        width: 34, height: 34, borderRadius: 9,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${step.color}18`,
        border: `1px solid ${step.color}30`,
        color: step.color,
        position: "relative",
      }}>
        <SvgIcon d={step.icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontFamily: "'DM Mono', monospace",
            color: step.color, letterSpacing: "0.12em",
            textTransform: "uppercase", fontWeight: 700, flexShrink: 0,
          }}>{step.num}</span>
          <div style={{ flex: 1, height: 1, background: `${step.color}20` }} />
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "var(--text)",
          fontFamily: "'Syne', sans-serif", marginBottom: 4, lineHeight: 1.2,
        }}>{step.title}</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "var(--text2)" }}>{step.desc}</div>
      </div>
    </div>
  );
}

// ─── Highlight tile ───────────────────────────────────────────────────────────

function Tile({ emoji, title, text }) {
  return (
    <div style={{
      padding: "13px 14px",
      borderRadius: 13,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
        <span style={{
          fontSize: 12.5, fontWeight: 700, color: "var(--text)",
          fontFamily: "'Syne', sans-serif",
        }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.72, color: "var(--text2)" }}>{text}</div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PageOnboarding({ onStart, onSkip }) {
  const { userProfile } = useDataPilot();

  const firstName = useMemo(() => {
    const raw = String(
      userProfile?.firstName || userProfile?.displayName || ""
    ).trim();
    if (!raw) return null;
    return raw.split(" ")[0];
  }, [userProfile]);

  return (
    <div
      className="page-enter"
      style={{
        minHeight: "calc(100vh - var(--header-h, 56px) - 32px)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "24px 0 16px",
      }}
    >
      <style>{`
        @media (max-width: 1080px) {
          .ob-main-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .ob-shell    { padding: 18px !important; border-radius: 20px !important; }
          .ob-headline { font-size: 26px !important; }
          .ob-tile-grid { grid-template-columns: 1fr !important; }
          .ob-cta-row  { flex-direction: column !important; }
          .ob-cta-row button { width: 100% !important; justify-content: center !important; }
        }
        .ob-btn-primary { transition: transform 0.15s, box-shadow 0.15s; }
        .ob-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 36px rgba(108,99,255,0.34) !important;
        }
        .ob-btn-ghost { transition: border-color 0.18s, color 0.18s; }
        .ob-btn-ghost:hover {
          border-color: rgba(108,99,255,0.35) !important;
          color: var(--text) !important;
        }
      `}</style>

      <div
        className="ob-shell"
        style={{
          position: "relative", flex: 1,
          maxWidth: 1200, margin: "0 auto", width: "100%",
          borderRadius: 26, overflow: "hidden",
          border: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.011) 100%), var(--bg2)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.38)",
          padding: "30px 26px",
        }}
      >
        <Atmosphere />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* badge */}
          <div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "6px 12px", borderRadius: 999,
              border: "1px solid rgba(108,99,255,0.26)",
              background: "rgba(108,99,255,0.08)",
              color: "#a78bfa",
              fontSize: 10.5, fontWeight: 700,
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              <span style={{ fontSize: 8 }}>✦</span>
              Welcome to DataPilot
            </span>
          </div>

          {/* 2-col grid */}
          <div
            className="ob-main-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 400px",
              gap: 18,
              alignItems: "start",
            }}
          >
            {/* ── LEFT ── */}
            <div style={{
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.022)",
              padding: "22px 20px",
              display: "flex", flexDirection: "column", gap: 18,
            }}>
              <div>
                <h1
                  className="ob-headline"
                  style={{
                    margin: 0, fontSize: 34, lineHeight: 1.06,
                    letterSpacing: "-0.03em", fontWeight: 800,
                    fontFamily: "'Syne', sans-serif", color: "var(--text)",
                  }}
                >
                  {firstName
                    ? <>Hey {firstName}.<br />Let's put your data to work.</>
                    : <>Let's put your<br />data to work.</>
                  }
                </h1>
                <p style={{
                  margin: "13px 0 0", fontSize: 13.5, lineHeight: 1.82,
                  color: "var(--text2)", maxWidth: 540,
                }}>
                  <strong style={{ color: "var(--text)", fontWeight: 600 }}>DataPilot</strong>{" "}
                  is an end-to-end analysis workspace. Upload a file, clean it, explore with AI,
                  visualize patterns, train a model, and export reproducible code — no notebooks,
                  no setup.
                </p>
              </div>

              <div
                className="ob-tile-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}
              >
                <Tile
                  emoji="🗂"
                  title="One project at a time"
                  text="Focused, single-dataset workflows. Clean pipelines without clutter."
                />
                <Tile
                  emoji="⚡"
                  title="Upload to insight fast"
                  text="No environment to configure. Everything runs in your browser session."
                />
                <Tile
                  emoji="✦"
                  title="AI throughout"
                  text="Ask questions, get summaries, and generate chart code at every stage."
                />
              </div>

              <div
                className="ob-cta-row"
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
              >
                <button
                  className="ob-btn-primary"
                  onClick={onStart}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 9,
                    padding: "13px 20px", borderRadius: 12,
                    border: "1px solid rgba(108,99,255,0.36)",
                    background: "linear-gradient(135deg, #6c63ff, #8f7dff)",
                    color: "#fff", fontSize: 13.5, fontWeight: 700,
                    fontFamily: "'Syne', sans-serif", cursor: "pointer",
                    boxShadow: "0 10px 26px rgba(108,99,255,0.28)",
                    letterSpacing: "0.01em",
                  }}
                >
                  <SvgIcon d={Icons.upload} size={14} />
                  Upload your first dataset
<span style={{ opacity: 0.7, fontWeight: 500 }}>
  → Start analyzing in seconds
</span>
                </button>

                <button
                  className="ob-btn-ghost"
                  onClick={onSkip}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "13px 16px", borderRadius: 12,
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--text3)", fontSize: 13, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: 0.6, fontSize: 12.5
                  }}
                >
                  Skip for now
                </button>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                paddingTop: 10, borderTop: "1px solid var(--border)",
              }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 11px", borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  color: "var(--text3)", fontSize: 11,
                  fontFamily: "'DM Mono', monospace", flexShrink: 0,
                }}>
                  <SvgIcon d={Icons.file} size={12} />
                  .csv · .xlsx
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text3)", lineHeight: 1.5 }}>
                  Start with any spreadsheet — DataPilot handles the rest.
                </span>
              </div>
            </div>

            {/* ── RIGHT ── */}
            <div style={{
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.02)",
              padding: "18px 16px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: 2,
              }}>
                <div>
                  <div style={{
                    fontSize: 13.5, fontWeight: 700, color: "var(--text)",
                    fontFamily: "'Syne', sans-serif",
                  }}>Your workflow</div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 3 }}>
                    5 stages, one workspace.
                  </div>
                </div>
                <span style={{
                  padding: "4px 9px", borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--text3)",
                  fontSize: 9.5, fontFamily: "'DM Mono', monospace",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                }}>V1 Flow</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {STEPS.map((step) => (
                  <StepCard key={step.id} step={step} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}