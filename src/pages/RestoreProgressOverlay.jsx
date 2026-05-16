// RestoreProgressOverlay.jsx
//
// Non-dismissible full-screen overlay that shows during Backblaze B2
// workspace restoration on login. Mounts in PageDashboard.
//
// Props:
//   progress: {
//     active:      boolean   — whether the overlay is visible
//     total:       number    — total sessions needing restore
//     done:        number    — sessions successfully restored so far
//     currentFile: string   — file name currently being restored
//     completed:   boolean  — all restores finished (triggers success state)
//   }

import { useEffect, useState } from "react";

// ── Keyframe injection (once per page) ───────────────────────────────────────
const STYLE_ID = "restore-overlay-keyframes";

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes _ro_fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes _ro_slideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    @keyframes _ro_shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    @keyframes _ro_pulse {
      0%, 100% { opacity: 1;   transform: scale(1);    }
      50%       { opacity: 0.6; transform: scale(0.92); }
    }
    @keyframes _ro_spinRing {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes _ro_checkPop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      70%  { transform: scale(1.18) rotate(4deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg);  opacity: 1; }
    }
    @keyframes _ro_successGlow {
      0%   { box-shadow: 0 0 0   0px var(--accent-glow, rgba(108, 99, 255, 0));   }
      50%  { box-shadow: 0 0 32px 8px var(--accent-dim, rgba(108, 99, 255, 0.35)); }
      100% { box-shadow: 0 0 0   0px var(--accent-glow, rgba(108, 99, 255, 0));   }
    }
    @keyframes _ro_barShine {
      0%   { left: -60%; }
      100% { left: 110%; }
    }
    @keyframes _ro_dotBounce {
      0%, 80%, 100% { transform: translateY(0);    opacity: 0.5; }
      40%            { transform: translateY(-5px); opacity: 1;   }
    }
    @keyframes _ro_shrinkOut {
      0%   { opacity: 1; transform: scale(1)    translateY(0);   }
      100% { opacity: 0; transform: scale(0.82) translateY(12px); }
    }
    @keyframes _ro_fadeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SpinRing() {
  return (
    <div style={{
      width: 52, height: 52,
      borderRadius: "50%",
      border: "2px solid var(--accent-medium, rgba(108,99,255,0.15))",
      borderTop: "2px solid var(--accent, #6c63ff)",
      animation: "_ro_spinRing 0.9s linear infinite",
      flexShrink: 0,
    }} />
  );
}

function CheckIcon() {
  return (
    <div style={{
      width: 52, height: 52,
      borderRadius: "50%",
      background: "linear-gradient(135deg, var(--accent-dim, rgba(108,99,255,0.2)), var(--accent-low, rgba(108,99,255,0.05)))",
      border: "1px solid var(--accent-high, rgba(108,99,255,0.45))",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "_ro_checkPop 0.45s cubic-bezier(0.175,0.885,0.32,1.275) forwards, _ro_successGlow 1.8s ease-in-out 0.45s",
      flexShrink: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <polyline
          points="4,11 9,16 18,6"
          stroke="var(--accent, #6c63ff)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function BounceDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 5, height: 5,
            borderRadius: "50%",
            background: "var(--accent, #6c63ff)",
            opacity: 0.5,
            animation: `_ro_dotBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ pct, indeterminate }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: 6,
      borderRadius: 99,
      background: "var(--accent-low, rgba(108,99,255,0.12))",
      overflow: "hidden",
    }}>
      {indeterminate ? (
        // Scanning shimmer for the "checking" phase
        <div style={{
          position: "absolute",
          top: 0, bottom: 0,
          width: "45%",
          background: "linear-gradient(90deg, transparent, var(--accent-medium, rgba(108,99,255,0.55)), transparent)",
          animation: "_ro_barShine 1.4s ease-in-out infinite",
          borderRadius: 99,
        }} />
      ) : (
        <>
          {/* Fill */}
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent-medium, rgba(108,99,255,0.7)) 0%, var(--accent, #6c63ff) 100%)",
            borderRadius: 99,
            transition: "width 0.55s cubic-bezier(0.25,0.46,0.45,0.94)",
          }} />
          {/* Shine sweep — only when animating */}
          {pct > 0 && pct < 100 && (
            <div style={{
              position: "absolute",
              top: 0, bottom: 0,
              width: "40%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
              animation: "_ro_barShine 1.8s ease-in-out infinite",
              borderRadius: 99,
            }} />
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RestoreProgressOverlay({ progress }) {
  injectKeyframes();

  const { active, phase, total, done, currentFile, completed } = progress || {};

  // Smoothly animate pct — never let it jump to 100 before completed flag
  const rawPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const pct    = completed ? 100 : clamp(rawPct, done > 0 ? 5 : 0, 99);

  const isChecking = phase === "checking" && !completed;

  // `closing` triggers the shrink-out animation; `visible` controls mount/unmount
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (active) {
      setClosing(false);
      setVisible(true);
    } else if (visible) {
      // Play shrink animation first, then unmount after it finishes (500ms)
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  // ── Label strings ──────────────────────────────────────────────────────
  const titleText = completed
    ? "Workspace ready!"
    : isChecking
      ? "Checking your workspace…"
      : "Restoring your workspace…";

  const bodyText = completed
    ? `${total} dataset${total !== 1 ? "s" : ""} restored — you can continue right where you left off.`
    : isChecking
      ? "Verifying your sessions, one moment…"
      : currentFile
        ? `Fetching "${currentFile}" from storage…`
        : "Reconnecting your files from cloud storage, please wait.";

  const subText = !completed && !isChecking && total > 1
    ? `${done} of ${total} files restored`
    : null;

  // ── Styles ─────────────────────────────────────────────────────────────
  const overlayStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "var(--overlay-dark, rgba(0,0,0,0.72))",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: closing ? "_ro_fadeOut 0.3s ease forwards" : "_ro_fadeIn 0.25s ease",
    padding: 16,
  };

  const cardStyle = {
    background: "var(--bg2, #18181f)",
    border: "1px solid var(--accent-high, rgba(108,99,255,0.22))",
    borderRadius: 20,
    padding: "32px 28px 28px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 32px 80px var(--overlay-dark, rgba(0,0,0,0.55)), 0 0 0 1px var(--accent-low, rgba(108,99,255,0.08)) inset",
    animation: closing
      ? "_ro_shrinkOut 0.3s cubic-bezier(0.4,0,0.2,1) forwards"
      : "_ro_slideUp 0.3s cubic-bezier(0.16,1,0.3,1)",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  };

  const iconRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  };

  const titleStyle = {
    fontFamily: "'Syne', 'DM Mono', monospace, sans-serif",
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text, #f0f0f5)",
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    marginBottom: 4,
  };

  const bodyStyle = {
    fontFamily: "'DM Mono', 'Syne', monospace, sans-serif",
    fontSize: 13,
    color: "var(--text2, rgba(240,240,245,0.6))",
    lineHeight: 1.55,
  };

  const subStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "var(--accent-medium, rgba(108,99,255,0.75))",
    marginTop: 4,
    letterSpacing: "0.04em",
  };

  const progressRowStyle = {
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const pctRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const pctLabelStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "var(--text3, rgba(240,240,245,0.45))",
    letterSpacing: "0.04em",
  };

  const pctValueStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    color: completed ? "var(--accent, #6c63ff)" : "var(--text, #f0f0f5)",
    letterSpacing: "-0.01em",
    transition: "color 0.3s ease",
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Icon + text */}
        <div style={iconRowStyle}>
          {completed ? <CheckIcon /> : <SpinRing />}
          <div>
            <div style={titleStyle}>{titleText}</div>
            <div style={bodyStyle}>{bodyText}</div>
            {subText && <div style={subStyle}>{subText}</div>}
          </div>
        </div>

        {/* Progress bar */}
        <div style={progressRowStyle}>
          <div style={pctRowStyle}>
            <span style={pctLabelStyle}>
              {completed ? "Complete" : isChecking ? "Scanning" : "Progress"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!completed && <BounceDots />}
              {!isChecking && <span style={pctValueStyle}>{pct}%</span>}
            </div>
          </div>
          <ProgressBar pct={pct} indeterminate={isChecking} />
        </div>

        {/* Footer note */}
        
      </div>
    </div>
  );
}