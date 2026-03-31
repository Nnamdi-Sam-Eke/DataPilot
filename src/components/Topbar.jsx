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

export default function Topbar({ page, onMenuClick }) {
  const { userProfile, logout } = useDataPilot();
  const [menuOpen, setMenuOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const menuRef = useRef(null);

  const displayName = userProfile?.displayName || userProfile?.email || "User";
  const email = userProfile?.email || "";
  const avatarLetter = displayName.charAt(0).toUpperCase() || "U";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => setBackendOnline(r.ok))
      .catch(() => setBackendOnline(false));
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
        <div className="status-pill">
          <div className="status-dot" style={{ background: backendOnline ? undefined : "var(--red)" }} />
          <span style={{ color: backendOnline ? undefined : "var(--red)" }}>
            {backendOnline ? "Backend online" : "Backend offline"}
          </span>
        </div>

        <div className="topbar-btn" title="Search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d={Icons.search} />
          </svg>
        </div>

        <div className="topbar-btn" title="Notifications">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d={Icons.bell} />
          </svg>
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