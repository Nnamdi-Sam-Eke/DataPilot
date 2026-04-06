import { useMemo, useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot } from "../DataPilotContext.jsx";

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

function Atmosphere() {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(108,99,255,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(108,99,255,0.045) 1px, transparent 1px)
          `,
          backgroundSize: "38px 38px",
          maskImage: "radial-gradient(ellipse 72% 62% at 50% 38%, black 28%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 72% 62% at 50% 38%, black 28%, transparent 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-18%",
          left: "-8%",
          width: "50%",
          height: "60%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(108,99,255,0.13) 0%, transparent 65%)",
          filter: "blur(10px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          right: "-6%",
          width: "44%",
          height: "54%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 65%)",
          filter: "blur(14px)",
        }}
      />
    </div>
  );
}

function OptionCard({ active, onClick, icon, label, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        width: "100%",
        padding: "14px 14px",
        borderRadius: 14,
        border: active ? "1px solid rgba(108,99,255,0.45)" : "1px solid var(--border)",
        background: active
          ? "linear-gradient(135deg, rgba(108,99,255,0.10), rgba(167,139,250,0.04))"
          : "rgba(255,255,255,0.02)",
        color: "var(--text)",
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: active ? "0 10px 26px rgba(108,99,255,0.16)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "rgba(108,99,255,0.16)" : "rgba(255,255,255,0.04)",
            color: active ? "#a78bfa" : "var(--text2)",
            flexShrink: 0,
          }}
        >
          <SvgIcon d={icon} size={13} />
        </div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: "'Syne', sans-serif",
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.65, color: "var(--text2)" }}>{sub}</div>
    </button>
  );
}

const ROLES = [
  { value: "analyst", label: "Analyst", sub: "Explore datasets, find patterns, report insights.", icon: Icons.predict },
  { value: "student", label: "Student", sub: "Learn analysis, modeling, and workflows faster.", icon: Icons.file },
  { value: "founder", label: "Founder / Operator", sub: "Make business decisions from raw data quickly.", icon: Icons.cpu },
  { value: "developer", label: "Developer", sub: "Analyze, prototype, and export reproducible code.", icon: Icons.upload },
  { value: "other", label: "Other", sub: "Something else — still welcome in the beta.", icon: Icons.wand },
];

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const USE_CASES = [
  { value: "analysis", label: "Data analysis" },
  { value: "visualization", label: "Visualization" },
  { value: "cleaning", label: "Data cleaning" },
  { value: "ml", label: "Model training / prediction" },
  { value: "reporting", label: "Reporting" },
  { value: "learning", label: "Learning / practice" },
];

export default function PageBetaProfile({ onContinue, onSkip, saving = false }) {
  const { userProfile } = useDataPilot();

  const firstName = useMemo(() => {
    const raw = String(userProfile?.firstName || userProfile?.displayName || "").trim();
    return raw ? raw.split(" ")[0] : null;
  }, [userProfile]);

  const [role, setRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [useCase, setUseCase] = useState("");
  const [notes, setNotes] = useState("");

  const canContinue = role && experienceLevel && useCase;

  const submit = () => {
    if (!canContinue || saving) return;
    onContinue({
      role,
      experienceLevel,
      primaryUseCase: useCase,
      notes: notes.trim(),
    });
  };

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
        @media (max-width: 1040px) {
          .bp-main-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .bp-shell { padding: 18px !important; border-radius: 20px !important; }
          .bp-title { font-size: 26px !important; }
          .bp-role-grid { grid-template-columns: 1fr !important; }
          .bp-row { grid-template-columns: 1fr !important; }
          .bp-cta-row { flex-direction: column !important; }
          .bp-cta-row button { width: 100% !important; justify-content: center !important; }
        }
      `}</style>

      <div
        className="bp-shell"
        style={{
          position: "relative",
          flex: 1,
          maxWidth: 1180,
          margin: "0 auto",
          width: "100%",
          borderRadius: 26,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.011) 100%), var(--bg2)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.38)",
          padding: "30px 26px",
        }}
      >
        <Atmosphere />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid rgba(108,99,255,0.26)",
                background: "rgba(108,99,255,0.08)",
                color: "#a78bfa",
                fontSize: 10.5,
                fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ fontSize: 8 }}>✦</span>
              Beta profile
            </span>
          </div>

          <div
            className="bp-main-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 360px",
              gap: 18,
              alignItems: "start",
            }}
          >
            <div
              style={{
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.022)",
                padding: "22px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div>
                <h1
                  className="bp-title"
                  style={{
                    margin: 0,
                    fontSize: 34,
                    lineHeight: 1.06,
                    letterSpacing: "-0.03em",
                    fontWeight: 800,
                    fontFamily: "'Syne', sans-serif",
                    color: "var(--text)",
                  }}
                >
                  {firstName ? <>Welcome, {firstName}.<br />Let’s tailor your beta.</> : <>Let’s tailor your<br />beta access.</>}
                </h1>
                <p
                  style={{
                    margin: "13px 0 0",
                    fontSize: 13.5,
                    lineHeight: 1.82,
                    color: "var(--text2)",
                    maxWidth: 620,
                  }}
                >
                  You’re part of the early <strong style={{ color: "var(--text)" }}>DataPilot Beta</strong>.
                  This quick setup helps us understand who’s using the product and what matters most.
                </p>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 10,
                    fontFamily: "'Syne', sans-serif",
                  }}
                >
                  What best describes you?
                </div>
                <div className="bp-role-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {ROLES.map((item) => (
                    <OptionCard
                      key={item.value}
                      active={role === item.value}
                      onClick={() => setRole(item.value)}
                      icon={item.icon}
                      label={item.label}
                      sub={item.sub}
                    />
                  ))}
                </div>
              </div>

              <div className="bp-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: 8,
                      fontFamily: "'Syne', sans-serif",
                    }}
                  >
                    Experience level
                  </label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "var(--text)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  >
                    <option value="">Select level</option>
                    {LEVELS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: 8,
                      fontFamily: "'Syne', sans-serif",
                    }}
                  >
                    Primary use case
                  </label>
                  <select
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                      color: "var(--text)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  >
                    <option value="">Select use case</option>
                    {USE_CASES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 8,
                    fontFamily: "'Syne', sans-serif",
                  }}
                >
                  What are you hoping to do with DataPilot? <span style={{ color: "var(--text3)", fontWeight: 500 }}>(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="e.g. clean client data faster, test models, generate reports, explore datasets..."
                  style={{
                    width: "100%",
                    resize: "vertical",
                    minHeight: 110,
                    padding: "13px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.03)",
                    color: "var(--text)",
                    fontSize: 13,
                    lineHeight: 1.7,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div
                className="bp-cta-row"
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
              >
                <button
                  onClick={submit}
                  disabled={!canContinue || saving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "13px 20px",
                    borderRadius: 12,
                    border: "1px solid rgba(108,99,255,0.36)",
                    background: !canContinue || saving
                      ? "rgba(108,99,255,0.16)"
                      : "linear-gradient(135deg, #6c63ff, #8f7dff)",
                    color: "#fff",
                    fontSize: 13.5,
                    fontWeight: 700,
                    fontFamily: "'Syne', sans-serif",
                    cursor: !canContinue || saving ? "not-allowed" : "pointer",
                    boxShadow: !canContinue || saving ? "none" : "0 10px 26px rgba(108,99,255,0.28)",
                    opacity: !canContinue || saving ? 0.7 : 1,
                  }}
                >
                  <SvgIcon d={Icons.upload} size={14} />
                  {saving ? "Saving..." : "Continue"}
                </button>

                <button
                  onClick={onSkip}
                  disabled={saving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 16px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text3)",
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 0.85,
                    fontSize: 12.5,
                  }}
                >
                  Skip for now
                </button>
              </div>
            </div>

            <div
              style={{
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)",
                padding: "18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "var(--text)",
                    fontFamily: "'Syne', sans-serif",
                  }}
                >
                  Why we ask this
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4, lineHeight: 1.7 }}>
                  We’re shaping DataPilot with real beta feedback. This helps us understand who is using the
                  product and what workflows matter most.
                </div>
              </div>

              {[
                {
                  title: "Better product decisions",
                  text: "We can prioritize the right workflows, features, and polish for real users.",
                },
                {
                  title: "Smarter beta support",
                  text: "We’ll know whether you’re using DataPilot for learning, business analysis, reporting, or modeling.",
                },
                {
                  title: "One-time setup",
                  text: "You only do this once. After that, you’ll continue straight into onboarding and the app.",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "14px 14px",
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: 6,
                      fontFamily: "'Syne', sans-serif",
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "var(--text2)" }}>{item.text}</div>
                </div>
              ))}

              <div
                style={{
                  padding: "12px 13px",
                  borderRadius: 13,
                  background: "rgba(108,99,255,0.08)",
                  border: "1px solid rgba(108,99,255,0.20)",
                  color: "var(--text2)",
                  fontSize: 11.5,
                  lineHeight: 1.7,
                }}
              >
                <strong style={{ color: "var(--text)" }}>You’re part of the early beta.</strong> Your feedback directly shapes what DataPilot becomes next.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}