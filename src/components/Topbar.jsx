import { useEffect, useRef, useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext";

export const PAGE_LABELS = {
  dashboard: "Dashboard",
  upload: "Upload Data",
  overview: "Data Overview",
  insights: "Ask DataPilot",
  visualization: "Visualizations",
  train: "Train Model",
  report: "Reports",
  predictions: "Predictions",
  cleaning: "Data Cleaning",
  codegen: "Code Export",
  settings: "Settings",
};

function LogOutIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

const ACCENT_COLORS = ["#6c63ff", "#3b82f6", "#22d3ee", "#10b981", "#6366f1", "#ec4899", "#f59e0b"];

export default function Topbar({ page, onMenuClick }) {
  const { userProfile, logout, theme, toggleTheme, accentColor, setAccentColor } = useDataPilot();
  const [menuOpen, setMenuOpen]   = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const menuRef  = useRef(null);
  const themeRef = useRef(null);

  const displayName = userProfile?.displayName || userProfile?.email || "User";
  const email = userProfile?.email || "";
  const avatarLetter = displayName.charAt(0).toUpperCase() || "U";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target))  setMenuOpen(false);
      if (!themeRef.current?.contains(event.target)) setThemeOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); setThemeOpen(false); }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // FIX: Poll every 15 s so the status pill updates if the backend goes
  // down mid-session, not just once on mount.
  useEffect(() => {
    const check = () => {
      fetch(`${API_BASE}/health`, { cache: "no-store" })
        .then((r) => setBackendOnline(r.ok))
        .catch(() => setBackendOnline(false));
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  const handleAvatarClick = () => {
    if (window.innerWidth <= 768) return;
    setMenuOpen((prev) => !prev);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
  };

  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenuClick} aria-label="Toggle menu">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="topbar-breadcrumb">
        datapilot / <span>{PAGE_LABELS[page]}</span>
      </div>

      <div className="topbar-right">

        {/* ── Theme popover ── */}
        <div ref={themeRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => { setThemeOpen(p => !p); setMenuOpen(false); }}
            title="Theme"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
              background: themeOpen ? "var(--bg3)" : "transparent",
              cursor: "pointer", color: "var(--text2)", transition: "background 0.15s",
            }}
          >
            {theme === "light" ? (
              /* sun */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1"  x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              /* moon */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            )}
          </button>

          {themeOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "var(--bg2)", border: "1px solid var(--border-bright)",
              borderRadius: 12, padding: "14px 16px", zIndex: 200,
              boxShadow: "0 16px 40px var(--overlay-dark)",
              display: "flex", flexDirection: "column", gap: 12, minWidth: 180,
              backdropFilter: "blur(8px)",
            }}>
              {/* Dark / Light toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text2)" }}>
                  {theme === "light" ? "Light mode" : "Dark mode"}
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                    background: theme === "light" ? "var(--accent)" : "var(--bg3)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2,
                    left: theme === "light" ? 18 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  }} />
                </button>
              </div>

              {/* Accent swatches */}
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  fontFamily: "'DM Mono', monospace" }}>
                  Accent
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ACCENT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccentColor(color)}
                      title={color}
                      style={{
                        width: 20, height: 20, borderRadius: 6, border: "none",
                        cursor: "pointer", background: color, flexShrink: 0,
                        outline: accentColor === color ? `3px solid var(--text)` : "none",
                        outlineOffset: 2,
                        boxShadow: accentColor === color ? `0 0 0 1px var(--bg2)` : "none",
                        transition: "outline 0.15s",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="status-pill">
          <div className="status-dot" style={{ background: backendOnline ? undefined : "var(--red)" }} />
          <span style={{ color: backendOnline ? undefined : "var(--red)" }}>
            {backendOnline ? "Backend online" : "Backend offline"}
          </span>
        </div>

        <div className="topbar-avatar-wrap" ref={menuRef}>
          <button
            type="button"
            className="avatar topbar-avatar-btn"
            title={displayName}
            onClick={handleAvatarClick}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              width: 28,
              height: 28,
              fontSize: 11,
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            }}
          >
            {avatarLetter}
          </button>

          {menuOpen && (
            <div className="topbar-dropdown" role="menu">
              <div className="topbar-dropdown-header">
                <div className="topbar-dropdown-name">{displayName}</div>
                {email ? <div className="topbar-dropdown-email">{email}</div> : null}
              </div>

              <button
                type="button"
                className="topbar-dropdown-item danger"
                onClick={handleSignOut}
                role="menuitem"
              >
                <LogOutIcon />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}