// ProGate.jsx
// Reusable upgrade wall shown when a free user hits a Pro-only feature.
// compact=true → inline banner (for toggles, buttons, tabs)
// compact=false (default) → full card (for locked pages / sections)

export default function ProGate({ feature, description, compact = false, icon = "🔒", onUpgrade }) {
  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 10,
        background: "linear-gradient(135deg, rgba(108,99,255,0.07), rgba(108,99,255,0.03))",
        border: "1px solid rgba(108,99,255,0.22)",
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 1 }}>
            {feature}
          </div>
          {description && (
            <div style={{ fontSize: 11.5, color: "var(--text3)", lineHeight: 1.45 }}>{description}</div>
          )}
        </div>
        <button
          onClick={onUpgrade}
          style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700,
            color: "var(--accent2)", background: "var(--accent-dim)",
            border: "1px solid rgba(108,99,255,0.3)",
            borderRadius: 6, padding: "3px 10px", letterSpacing: "0.04em",
            cursor: onUpgrade ? "pointer" : "default",
          }}
        >
          PRO
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16, padding: "60px 24px",
      borderRadius: 16, textAlign: "center",
      background: "linear-gradient(135deg, rgba(108,99,255,0.07), rgba(108,99,255,0.02))",
      border: "1px solid rgba(108,99,255,0.2)",
    }}>
      {/* Icon ring */}
      <div style={{
        width: 60, height: 60, borderRadius: 16,
        background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26,
      }}>
        {icon}
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          {feature}
        </div>
        {description && (
          <div style={{
            fontSize: 13, color: "var(--text3)", lineHeight: 1.6,
            maxWidth: 340, margin: "0 auto",
          }}>
            {description}
          </div>
        )}
      </div>

      <button
        onClick={onUpgrade}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 20px", borderRadius: 8,
          background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.35)",
          fontSize: 12.5, fontWeight: 600, color: "var(--accent2)",
          letterSpacing: "0.02em", cursor: onUpgrade ? "pointer" : "default",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Upgrade to Pro
      </button>

      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
        Unlock full access · Manage your plan in Settings
      </div>
    </div>
  );
}