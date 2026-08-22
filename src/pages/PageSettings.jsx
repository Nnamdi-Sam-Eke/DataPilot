import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import { saveUserProfile } from "../services/firestore";


// ── icons ─────────────────────────────────────────────────────────────────────
const Ico = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const IcoKey      = () => <Ico d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />;
const IcoUser     = () => <Ico d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z" />;
const IcoTrash    = () => <Ico d="M3 6h18 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6 M9 6V4h6v2" />;
const IcoCheck    = () => <Ico d="M20 6L9 17l-5-5" />;
const IcoEye      = () => <Ico d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" />;
const IcoEyeOff   = () => <Ico d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24 M1 1l22 22" />;
const IcoCopy     = () => <Ico d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z" />;
const IcoStar     = () => <Ico d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
const IcoShield   = () => <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const IcoLogOut   = () => <Ico d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9" />;
const IcoRefresh  = () => <Ico d="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />;
const IcoDatabase = () => <Ico d="M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2z M2 6.5C2 8.98 6.48 11 12 11s10-2.02 10-4.5 M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5" />;

// ── section card ──────────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent2)", flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", fontFamily: "'Syne', sans-serif" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── field row ─────────────────────────────────────────────────────────────────
function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text2)" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 220 }}>
        {children}
      </div>
    </div>
  );
}

// ── plan badge ────────────────────────────────────────────────────────────────
const PLAN_COLORS = {
  free:       { bg: "rgba(100,100,120,0.15)", border: "rgba(100,100,120,0.3)", text: "#9ca3af" },
  pro:        { bg: "rgba(108,99,255,0.12)",  border: "rgba(108,99,255,0.3)",  text: "#a78bfa" },
  team:       { bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.25)", text: "#34d399" },
  enterprise: { bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.25)", text: "#fbbf24" },
};

function PlanBadge({ plan }) {
  const c = PLAN_COLORS[plan?.toLowerCase()] || PLAN_COLORS.free;
  return (
    <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em", background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {plan || "Free"}
    </span>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function PageSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const ctx = useDataPilot();
  const { user, logout } = ctx;

  // Extract context values with fallbacks
  const userProfile    = ctx.userProfile    ?? { displayName: "", email: "", plan: "free" };
  const setUserProfile = ctx.setUserProfile ?? (() => {});
  const theme          = ctx.theme          ?? "dark";
  const toggleTheme    = ctx.toggleTheme    ?? (() => {});
  const accentColor    = ctx.accentColor    ?? "#6c63ff";
  const setAccentColor = ctx.setAccentColor ?? (() => {});
  const reset          = ctx.reset          ?? (() => {});
  const sessions       = ctx.sessions       ?? [];
  const savedPlots     = ctx.savedPlots     ?? [];
  const trainResults   = ctx.trainResults   ?? null;
  const chatMessages   = ctx.chatMessages   ?? [];

  // Highlight the "Your Plan" card, but ONLY when we arrived here via an
  // "Upgrade to Pro" CTA elsewhere in the app. That CTA passes
  // setPage("/settings", { state: { highlightSection: "manage-subscription" } }).
  // Regular navigation (sidebar, back button, refresh, typing the URL) never
  // sets this state, so the scroll/pulse never fires for organic visits.
  const planCardRef = useRef(null);
  const [highlightPlanCard, setHighlightPlanCard] = useState(false);

  useEffect(() => {
    if (location.state?.highlightSection === "manage-subscription") {
      planCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

      setHighlightPlanCard(true);
      const timer = setTimeout(() => setHighlightPlanCard(false), 2400);

      // Clear the state right away so a refresh, re-render, or navigating
      // back to this same history entry doesn't re-trigger the highlight.
      navigate(location.pathname, { replace: true, state: {} });

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local state for form inputs
  const [displayName,  setDisplayName]  = useState(userProfile?.displayName || "");
  const [email,        setEmail]        = useState(userProfile?.email       || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Platform status state
  const [backendStatus,  setBackendStatus]  = useState(null); // null | "online" | "offline"
  const [statusChecking, setStatusChecking] = useState(false);


  // Sync local form state with context (so displayName loads from Firestore)
  useEffect(() => {
    setDisplayName(userProfile?.displayName || "");
    setEmail(userProfile?.email || "");
  }, [userProfile]);

  // Handlers
 const handleSaveProfile = async () => {
  try {
    setUserProfile({
      ...userProfile,
      displayName,
      email,
    });

    if (user?.uid) {
      await saveUserProfile(user, {
        displayName,
        email,
      });
    }

    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  } catch (err) {
    console.error("Failed to save profile:", err);
  }
};

  // Platform status check
  const handleCheckStatus = async () => {
    setStatusChecking(true);
    setBackendStatus(null);
    try {
      const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      setBackendStatus(res.ok ? "online" : "offline");
    } catch {
      setBackendStatus("offline");
    } finally {
      setStatusChecking(false);
    }
  };

  const handleResetData = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    reset();
    setConfirmReset(false);
  };

  // Data stats
  const statsItems = [
    { label: "Uploaded datasets",  value: sessions?.length || 0 },
    { label: "Generated charts",   value: savedPlots?.filter(p => p.image)?.length || 0 },
    { label: "Models trained",     value: trainResults ? 1 : 0 },
    { label: "AI conversations",   value: chatMessages?.filter(m => m.role === "user")?.length || 0 },
  ];

  const plan = (userProfile?.plan || "free").toLowerCase();
  const isPro = plan === "pro";

  const planFeatures = isPro
    ? [
        "Unlimited local datasets",
        "Up to 500,000 rows per file",
        "Unlimited AI insight queries",
        "All ML models (RF, LR, XGBoost, SVM)",
        "Full code export (Python, Jupyter, MD)",
        "Cloud backup + trained model restore",
        "12-hour sessions",
      ]
    : [
        "Unlimited local datasets",
        "Up to 20,000 rows per file",
        "15 AI insight queries per day",
        "RF + Logistic Regression (1 model/session)",
        "Python code export",
        "Cloud backup (files + workspace metadata)",
        "90-minute sessions",
      ];

  const planAction = isPro
    ? { label: "Manage Subscription", path: "/billing" }
    : { label: "Upgrade to Pro", path: "/pricing" };

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your profile, API keys, appearance, and workspace data</div>
        </div>
        <PlanBadge plan={userProfile?.plan || "free"} />
      </div>
      

      <div className="settings-layout">
        {/* LEFT COLUMN ── Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Profile */}
          <Section icon={<IcoUser size={16} />} title="Profile" subtitle="Your display name and email shown across the app">
            <FieldRow label="Display Name" hint="Shown in the sidebar and exports">
              <input 
                className="input-field" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)}
                style={{ width: "100%", fontSize: 13 }} 
              />
            </FieldRow>
            <FieldRow label="Email" hint="Used for account recovery (auth coming soon)">
              <input 
                className="input-field" 
                type="email"
                value={email} 
                onChange={e => setEmail(e.target.value)}
                style={{ width: "100%", fontSize: 13 }} 
              />
            </FieldRow>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn-primary" onClick={handleSaveProfile}>
                {profileSaved ? <><IcoCheck /> Saved</> : "Save Profile"}
              </button>
            </div>
           <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10 }}>
  Signed in as <span style={{ color: "var(--text2)" }}>{user?.email}</span>
</div>
          </Section>

          {/* Platform Status */}
          <Section
            icon={<IcoDatabase size={16} />}
            title="Platform Status"
            subtitle="Live connection status and AI configuration for this DataPilot instance.">

            <FieldRow label="Backend server" hint="">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                  background: backendStatus === "online" ? "var(--green)" : backendStatus === "offline" ? "var(--red)" : "var(--text3)",
                  boxShadow: backendStatus === "online" ? "0 0 6px var(--green)" : "none",
                }} />
                <span style={{ fontSize: 12.5, color: backendStatus === "online" ? "var(--green)" : backendStatus === "offline" ? "var(--red)" : "var(--text2)", fontFamily: "'DM Mono', monospace" }}>
                  {backendStatus === "online" ? "Online" : backendStatus === "offline" ? "Offline / sleeping" : "Not checked yet"}
                </span>
                <button
                  className="btn-secondary"
                  onClick={handleCheckStatus}
                  disabled={statusChecking}
                  style={{ padding: "5px 12px", fontSize: 11, marginLeft: "auto" }}>
                  {statusChecking
                    ? <><svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Checking…</>
                    : <><IcoRefresh /> Check now</>
                  }
                </button>
              </div>
            </FieldRow>

            <FieldRow label="AI model" hint="Served via Groq — fastest open-source inference available">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ padding: "4px 10px", borderRadius: 6, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.25)", fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: "var(--accent2)" }}>
                  openai/gpt-oss-120b
                </div>
              </div>
            </FieldRow>

            <FieldRow label="Inference provider" hint="All AI queries are processed server-side. Your data never leaves our backend">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Provider", value: "Groq Cloud" },
                  { label: "Data handling", value: "Server-side only" },
                  { label: "Latency", value: "200-500ms per query" },

                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--bg3)", borderRadius: 7, border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{label}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text2)", fontFamily: "'DM Mono', monospace" }}>{value}</span>
                  </div>
                ))}
              </div>
            </FieldRow>

            <FieldRow label="Send feedback" hint="Found a bug or want a feature? We're available 24/7 and reading everything.">
              <div style={{ fontSize: 12.5, color: "var(--text2)" }}>
                Use the feedback button          </div>
            </FieldRow>
          </Section>

          {/* Data Management */}
          <Section
            icon={<IcoDatabase size={16} />}
            title="Data Management"
            subtitle="Manage workspace sessions, charts, models, and cached data">

            <FieldRow label="Workspace Stats" hint="All data stored locally in your browser">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {statsItems.map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>{value}</span>
                  </div>
                ))}
              </div>
            </FieldRow>

            <FieldRow
              label="Reset Workspace"
              hint="Clears all sessions, charts, models, conversations, and cached state. Cannot be undone.">
              <button
                onClick={handleResetData}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  background: confirmReset ? "rgba(248,113,113,0.12)" : "var(--bg3)",
                  color: confirmReset ? "var(--red)" : "var(--text2)",
                  border: `1px solid ${confirmReset ? "rgba(248,113,113,0.35)" : "var(--border)"}`,
                  transition: "all 0.2s",
                }}
              >
                <IcoTrash size={16} />
                {confirmReset ? "Click again to confirm" : "Reset All Data"}
              </button>
            </FieldRow>
          </Section>
        </div>

        {/* RIGHT COLUMN ── Sidebar-like info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Plan Overview */}
          <div
            ref={planCardRef}
            className={`card${highlightPlanCard ? " highlight-pulse" : ""}`}
            style={{ background: "linear-gradient(135deg, rgba(108,99,255,0.08) 0%, rgba(108,99,255,0.02) 100%)", border: "1px solid rgba(108,99,255,0.2)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <IcoStar size={16} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Your Plan</span>
            </div>
            <PlanBadge plan={userProfile?.plan || "free"} />
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {planFeatures.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text2)" }}>
                  <IcoCheck size={14} />
                  {f}
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
              onClick={() => navigate(planAction.path)}
            >
              {planAction.label}
            </button>
          </div>

          {/* Appearance */}
          <div className="card">
            <div className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M2 12h20" />
              </svg>
              Appearance
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
              <span style={{ fontSize: 13 }}>Dark Mode</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={theme === "light"}
                  onChange={toggleTheme}
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Accent Color</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[
                  "#6c63ff", "#3b82f6", "#22d3ee", "#14b8a6",
                  "#10b981", "#f59e0b", "#f97316", "#ef4444",
                  "#ec4899", "#8b5cf6"
                ].map(color => (
                  <button
                    key={color}
                    onClick={() => setAccentColor(color)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: color,
                      border: accentColor === color ? "3px solid var(--text)" : "2px solid var(--border)",
                      boxShadow: accentColor === color ? `0 0 0 4px var(--accent-glow)` : "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Security & About */}
          <div className="card">
            <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Security & About
            </div>
            {[
              { label: "API key storage", value: "Browser only" },
              { label: "Version",         value: "0.9.0-beta" },
              { label: "AI Model", value: "gpt-oss-120b" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ color: "var(--text3)" }}>{label}</span>
                <span style={{ color: "var(--text2)", fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{value}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingTop: 12 }}>
              <button type="button" onClick={() => navigate("/privacy")} style={{ background: "none", border: "none", padding: 0, color: "var(--accent2)", cursor: "pointer", fontSize: 12 }}>
                Privacy Policy
              </button>
              <button type="button" onClick={() => navigate("/terms")} style={{ background: "none", border: "none", padding: 0, color: "var(--accent2)", cursor: "pointer", fontSize: 12 }}>
                Terms of Service
              </button>
              <a href="mailto:hello@datapilot.ai" style={{ color: "var(--accent2)", fontSize: 12, textDecoration: "none" }}>
                Contact
              </a>
            </div>
          </div>

          {/* Sign Out */}
        <button
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "center", color: "var(--text3)", borderColor: "var(--border)" }}
              onClick={logout}
            >
              <IcoLogOut size={16} />
              Sign Out
        </button>
        </div>
      </div>
    </div>
  );
}