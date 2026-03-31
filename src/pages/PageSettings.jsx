import { useState, useEffect } from "react";   // ← Fixed: added useEffect
import { useDataPilot } from "../DataPilotContext.jsx";
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
  const ctx = useDataPilot();
  const { user, logout } = ctx;

  // Extract context values with fallbacks
  const groqKey       = ctx.groqKey       ?? "";
  const setGroqKey    = ctx.setGroqKey    ?? (() => {});
  const userProfile = ctx.userProfile ?? { displayName: "", email: "", plan: "Pro" };
  const setUserProfile = ctx.setUserProfile ?? (() => {});
  const theme         = ctx.theme         ?? "dark";
  const toggleTheme   = ctx.toggleTheme   ?? (() => {});
  const accentColor   = ctx.accentColor   ?? "#6c63ff";
  const setAccentColor= ctx.setAccentColor?? (() => {});
  const reset         = ctx.reset         ?? (() => {});
  const sessions      = ctx.sessions      ?? [];
  const savedPlots    = ctx.savedPlots    ?? [];
  const trainResults  = ctx.trainResults  ?? null;
  const chatMessages  = ctx.chatMessages  ?? [];

  // Local state for form inputs
 const [displayName, setDisplayName] = useState(userProfile?.displayName || "");
 const [email,       setEmail]       = useState(userProfile?.email       || "");
 const [profileSaved, setProfileSaved] = useState(false);

  const [keyInput,    setKeyInput]    = useState(groqKey || "");
  const [showKey,     setShowKey]     = useState(false);
  const [keySaved,    setKeySaved]    = useState(false);
  const [keyCopied,   setKeyCopied]   = useState(false);
  const [keyTesting,  setKeyTesting]  = useState(false);
  const [keyStatus,   setKeyStatus]   = useState(null); // null | "ok" | "fail"

  const [confirmReset, setConfirmReset] = useState(false);

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

  const handleSaveKey = () => {
    setGroqKey(keyInput.trim());
    setKeySaved(true);
    setKeyStatus(null);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const handleRemoveKey = () => {
    setKeyInput("");
    setGroqKey("");
    setKeyStatus(null);
  };

  const handleCopyKey = () => {
    if (!keyInput) return;
    navigator.clipboard.writeText(keyInput).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  };

  const handleTestKey = async () => {
    const k = keyInput.trim();
    if (!k) return;
    setKeyTesting(true);
    setKeyStatus(null);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${k}` },
      });
      setKeyStatus(res.ok ? "ok" : "fail");
    } catch {
      setKeyStatus("fail");
    } finally {
      setKeyTesting(false);
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

  const maskedKey = keyInput 
    ? keyInput.slice(0, 8) + "•".repeat(Math.max(0, keyInput.length - 12)) + keyInput.slice(-4) 
    : "";

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your profile, API keys, appearance, and workspace data</div>
        </div>
        <PlanBadge plan={userProfile?.plan || "Pro"} />
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

          {/* Groq API Key */}
          <Section
            icon={<IcoKey size={16} />}
            title="Groq API Key"
            subtitle="Powers Ask DataPilot AI. Your own key gives higher limits and privacy.">

            {/* Status feedback */}
            {keyStatus === "ok" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 9, fontSize: 12, color: "var(--green)", marginBottom: 14 }}>
                <IcoCheck /> Key is valid and working
              </div>
            )}
            {keyStatus === "fail" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 9, fontSize: 12, color: "var(--red)", marginBottom: 14 }}>
                ✕ Invalid key — check and try again
              </div>
            )}

            <FieldRow
              label="API Key"
              hint={<>Get your key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent2)" }}>console.groq.com</a>. Free tier is generous.</>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <input
                    className="input-field"
                    type={showKey ? "text" : "password"}
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); setKeyStatus(null); }}
                    placeholder="gsk_••••••••••••••••••••••••••••••••"
                    style={{ width: "100%", fontSize: 13, paddingRight: 44, fontFamily: "'DM Mono', monospace" }}
                  />
                  <button 
                    onClick={() => setShowKey(v => !v)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 2 }}
                  >
                    {showKey ? <IcoEyeOff size={16} /> : <IcoEye size={16} />}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-primary" onClick={handleSaveKey} disabled={!keyInput.trim()}>
                    {keySaved ? <><IcoCheck /> Saved</> : "Save Key"}
                  </button>
                  <button className="btn-secondary" onClick={handleTestKey} disabled={!keyInput.trim() || keyTesting}>
                    {keyTesting ? <><svg className="spin" width="12" height="12" viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> Testing…</> : <><IcoRefresh /> Test</>}
                  </button>
                  <button className="btn-secondary" onClick={handleCopyKey} disabled={!keyInput}>
                    {keyCopied ? <IcoCheck /> : <IcoCopy />}
                  </button>
                  {keyInput && (
                    <button className="btn-secondary" onClick={handleRemoveKey}
                      style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </FieldRow>

            {/* How it works */}
            <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg3)", borderRadius: 9, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'DM Mono', monospace" }}>
                How it works
              </div>
              {[
                { step: "1", text: "Your key is stored only in your browser — never sent to our servers" },
                { step: "2", text: "Passed directly from your browser to Groq on each AI query" },
                { step: "3", text: "No key? Uses shared server key (rate-limited)" },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent2)", flexShrink: 0, fontFamily: "'DM Mono', monospace" }}>
                    {step}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>{text}</div>
                </div>
              ))}
            </div>
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
          <div className="card" style={{ background: "linear-gradient(135deg, rgba(108,99,255,0.08) 0%, rgba(108,99,255,0.02) 100%)", border: "1px solid rgba(108,99,255,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <IcoStar size={16} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Your Plan</span>
            </div>
            <PlanBadge plan={userProfile?.plan || "Pro"} />
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "Unlimited local datasets",
                "Up to 500K rows per file",
                "Unlimited AI queries (with your key)",
                "All ML models + predictions",
                "Full code export (Python, Jupyter, MD)",
                "Sessions persist in browser",
              ].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text2)" }}>
                  <IcoCheck size={14} />
                  {f}
                </div>
              ))}
            </div>
            <button className="btn-secondary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
              Manage Subscription
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
                  "#6c63ff", "#3b82f6", "#22d3ee", "#10b981",
                  "#6366f1", "#ec4899", "#f59e0b"
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
              { label: "Data location",   value: "Local storage" },
              { label: "Version",         value: "0.9.0-beta" },
              { label: "Stack",           value: "React + FastAPI" },
              { label: "AI Model", value: "llama-3.3-70b" },
              { label: "Build date",      value: new Date().toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ color: "var(--text3)" }}>{label}</span>
                <span style={{ color: "var(--text2)", fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>{value}</span>
              </div>
            ))}
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