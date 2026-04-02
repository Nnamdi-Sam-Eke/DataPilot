/**
 * App.jsx — DataPilot
 *
 * What changed vs the previous version:
 *
 * 1. ONBOARDING — Firebase-backed flag (not localStorage).
 *    On every login, AppShell reads `users/{uid}.onboardingSeen` from Firestore.
 *    If it's missing or false, PageOnboarding is shown. markSeen() writes the
 *    flag with setDoc+merge so it's persistent across devices and browsers.
 *    Using the same `db` instance already imported in DataPilotContext, so
 *    there is no new Firebase init — just two extra Firestore calls.
 *
 * 2. PageOnboarding is imported and rendered inside AppShell before renderPage().
 *    It lives at the same level as the expiry banners, inside the authenticated
 *    shell, so Topbar, Sidebar, and theme are already applied.
 *
 * 3. No other logic changed. Banners, session probe, theme init, auth guard
 *    are all identical to the previous version.
 */

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc }  from "firebase/firestore";
import { db }                   from "./services/firebase";
import { styles }               from "./styles.jsx";
import { DataPilotProvider, useDataPilot } from "./DataPilotContext.jsx";
import Sidebar      from "./components/Sidebar.jsx";
import Topbar       from "./components/Topbar.jsx";
import PageAuth     from "./pages/PageAuth.jsx";
import PageOnboarding   from "./pages/PageOnboarding.jsx";
import PageDashboard    from "./pages/PageDashboard.jsx";
import PageUpload       from "./pages/PageUpload.jsx";
import PageOverview     from "./pages/PageOverview.jsx";
import PageInsights     from "./pages/PageInsights.jsx";
import PageVisualization from "./pages/PageVisualization.jsx";
import PageTrain        from "./pages/PageTrain.jsx";
import PageReport       from "./pages/PageReport.jsx";
import PagePredictions  from "./pages/PagePredictions.jsx";
import PageCleaning     from "./pages/PageCleaning.jsx";
import PageCodeGen      from "./pages/PageCodeGen.jsx";
import PageSettings     from "./pages/PageSettings.jsx";

// ── Constants ──────────────────────────────────────────────────────────────────

const WARN_AT_MINUTES = 30;

// ── Helpers ────────────────────────────────────────────────────────────────────

function minutesRemaining(session) {
  if (!session?.uploadedAt || session.expired) return null;
  const expiryMinutes = session.expiryMinutes || 180;
  const expiresMs = new Date(session.uploadedAt).getTime() + expiryMinutes * 60 * 1000;
  return Math.floor((expiresMs - Date.now()) / 60000);
}

// ── Banner 1: live expiry countdown across ALL sessions ────────────────────────

function SessionExpiryBanner({ setPage }) {
  const { sessions } = useDataPilot();
  const [, setTick]  = useState(0);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  const candidates = sessions
    .filter((s) => !s.expired && !dismissed.has(s.sessionId) && s.uploadedAt)
    .map((s) => ({ session: s, mins: minutesRemaining(s) }))
    .filter(({ mins }) => mins !== null && mins <= WARN_AT_MINUTES && mins > 0)
    .sort((a, b) => a.mins - b.mins);

  if (candidates.length === 0) return null;

  const { session: soonest, mins } = candidates[0];
  const othersCount = candidates.length - 1;
  const isUrgent    = mins <= 10;

  const bgColor     = isUrgent ? "rgba(220,53,69,0.15)"  : "rgba(255,165,0,0.12)";
  const borderColor = isUrgent ? "#dc3545"               : "#fd7e14";
  const iconColor   = isUrgent ? "#ff4d4d"               : "#ffa040";
  const timeLabel   = mins === 1 ? "1 minute"            : `${mins} minutes`;

  const fileLabel = candidates.length === 1
    ? <strong style={{ color: iconColor }}>{soonest.fileName}</strong>
    : (
      <>
        <strong style={{ color: iconColor }}>{soonest.fileName}</strong>
        {" and "}
        <strong style={{ color: iconColor }}>
          {othersCount} other {othersCount === 1 ? "session" : "sessions"}
        </strong>
      </>
    );

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      candidates.forEach(({ session: s }) => next.add(s.sessionId));
      return next;
    });
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      padding: "0.55rem 1.1rem",
      background: bgColor, borderBottom: `1px solid ${borderColor}`,
      fontSize: "0.82rem", color: "var(--text-primary, #e0e0e0)", flexShrink: 0,
    }}>
      <span style={{ color: iconColor, fontSize: "1rem", flexShrink: 0 }}>⏳</span>
      <span style={{ flex: 1 }}>
        {fileLabel}{" "}
        {candidates.length === 1 ? "expires" : "expire"} in{" "}
        <strong style={{ color: iconColor }}>{timeLabel}</strong>
        {" — dataset will be cleared from the server. "}
        <button
          onClick={() => setPage("upload")}
          style={{
            background: "none", border: "none", color: iconColor,
            cursor: "pointer", padding: 0, fontSize: "inherit",
            textDecoration: "underline", fontWeight: 600,
          }}
        >
          Re-upload now
        </button>
        {" to continue without interruption."}
      </span>
      <button
        onClick={dismissAll}
        title="Dismiss"
        style={{
          background: "none", border: "none",
          color: "var(--text-secondary, #888)",
          cursor: "pointer", fontSize: "1rem",
          lineHeight: 1, padding: "0 0.2rem", flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Banner 2: return notification for sessions that expired while away ─────────

function ReturnNotificationBanner({ setPage }) {
  const { sessions } = useDataPilot();
  const [dismissed, setDismissed] = useState(false);
  const [expiredNames, setExpiredNames] = useState([]);

  useEffect(() => {
    if (sessions.length === 0) return;
    const names = sessions
      .filter((s) => s.expired && s.fileName)
      .map((s) => s.fileName);
    if (names.length > 0) setExpiredNames(names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length > 0 ? "loaded" : "empty"]);

  if (dismissed || expiredNames.length === 0) return null;

  const label = expiredNames.length === 1
    ? <><strong style={{ color: "#ff4d4d" }}>{expiredNames[0]}</strong> expired while you were away.</>
    : (
      <>
        <strong style={{ color: "#ff4d4d" }}>{expiredNames.length} sessions</strong>
        {" expired while you were away: "}
        <strong style={{ color: "#ff4d4d" }}>{expiredNames.join(", ")}</strong>.
      </>
    );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      padding: "0.55rem 1.1rem",
      background: "rgba(220,53,69,0.1)", borderBottom: "1px solid #dc3545",
      fontSize: "0.82rem", color: "var(--text-primary, #e0e0e0)", flexShrink: 0,
    }}>
      <span style={{ color: "#ff4d4d", fontSize: "1rem", flexShrink: 0 }}>⚠️</span>
      <span style={{ flex: 1 }}>
        {label}{" "}
        <button
          onClick={() => setPage("upload")}
          style={{
            background: "none", border: "none", color: "#ff6b6b",
            cursor: "pointer", padding: 0, fontSize: "inherit",
            textDecoration: "underline", fontWeight: 600,
          }}
        >
          Re-upload to restore.
        </button>
      </span>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        style={{
          background: "none", border: "none",
          color: "var(--text-secondary, #888)",
          cursor: "pointer", fontSize: "1rem",
          lineHeight: 1, padding: "0 0.2rem", flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Page router ────────────────────────────────────────────────────────────────

function renderPage(page, setPage) {
  switch (page) {
    case "dashboard":    return <PageDashboard setPage={setPage} />;
    case "upload":       return <PageUpload setPage={setPage} />;
    case "overview":     return <PageOverview />;
    case "insights":     return <PageInsights />;
    case "visualization":return <PageVisualization />;
    case "train":        return <PageTrain />;
    case "report":       return <PageReport />;
    case "predictions":  return <PagePredictions />;
    case "cleaning":     return <PageCleaning />;
    case "codegen":      return <PageCodeGen />;
    case "settings":     return <PageSettings />;
    default:             return <PageDashboard setPage={setPage} />;
  }
}

// ── AppShell ───────────────────────────────────────────────────────────────────

function AppShell() {
  const { user, authLoading } = useDataPilot();

  const [page, setPage]             = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Onboarding state ────────────────────────────────────────────────────
  // null = not yet checked (loading), false = seen, true = show onboarding
  const [showOnboarding, setShowOnboarding] = useState(null);

  // ── Theme init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const savedTheme =
      localStorage.getItem("theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const savedAccent = localStorage.getItem("accentColor") || "#6c63ff";
    document.documentElement.setAttribute("data-theme", savedTheme);
    document.documentElement.setAttribute("data-accent", savedAccent);
  }, []);

  // ── Check Firestore for onboardingSeen whenever user resolves ───────────
  useEffect(() => {
    if (!user) {
      // Signed out — reset so next login re-checks cleanly
      setShowOnboarding(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        // Show onboarding when the document doesn't exist yet
        // or when onboardingSeen is explicitly false / missing
        const seen = snap.exists() && snap.data()?.onboardingSeen === true;
        setShowOnboarding(!seen);
      } catch (err) {
        // Network error or permissions issue — fail open (skip onboarding)
        console.error("Could not read onboardingSeen flag:", err);
        if (!cancelled) setShowOnboarding(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // ── Mark onboarding as done in Firestore ────────────────────────────────
  const markOnboardingSeen = async () => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { onboardingSeen: true },
        { merge: true }          // preserves firstName, lastName, etc.
      );
    } catch (err) {
      // Non-critical — user still proceeds; flag will be set next session
      console.error("Failed to persist onboardingSeen:", err);
    }
    setShowOnboarding(false);
  };

  const navigate = (p) => {
    setPage(p);
    setSidebarOpen(false);
  };

  // ── Loading screen ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <>
        <style>{styles}</style>
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: "#0b0f19", color: "#fff", fontSize: "1rem",
        }}>
          Loading...
        </div>
      </>
    );
  }

  // ── Auth wall ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <style>{styles}</style>
        <PageAuth />
      </>
    );
  }

  // ── Onboarding check loading (brief Firestore read) ─────────────────────
  // showOnboarding === null means we're still waiting for the Firestore check.
  // Render the shell skeleton (sidebar + topbar visible) but no page content
  // yet, so there's no flash of dashboard before onboarding appears.
  if (showOnboarding === null) {
    return (
      <>
        <style>{styles}</style>
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: "#0b0f19", color: "#fff", fontSize: "1rem",
        }}>
          Loading...
        </div>
      </>
    );
  }

  // ── Onboarding page ─────────────────────────────────────────────────────
  // Rendered inside the full authenticated shell so Topbar, theme, and sidebar
  // are already applied — consistent with every other page.
  if (showOnboarding) {
    return (
      <>
        <style>{styles}</style>
        <div className="app-wrap">
          <div className="grid-bg" />
          <div
            className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar page="dashboard" setPage={navigate} isOpen={sidebarOpen} />
          <div className="main-area">
            <Topbar page="dashboard" onMenuClick={() => setSidebarOpen((o) => !o)} />
            <main className="page-content">
              <PageOnboarding
                onStart={async () => {
                  await markOnboardingSeen();
                  navigate("upload");
                }}
                onSkip={async () => {
                  await markOnboardingSeen();
                  navigate("dashboard");
                }}
              />
            </main>
          </div>
        </div>
      </>
    );
  }

  // ── Main app ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>
      <div className="app-wrap">
        <div className="grid-bg" />
        <div
          className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar page={page} setPage={navigate} isOpen={sidebarOpen} />
        <div className="main-area">
          <Topbar page={page} onMenuClick={() => setSidebarOpen((o) => !o)} />
          <SessionExpiryBanner setPage={navigate} />
          <ReturnNotificationBanner setPage={navigate} />
          <main className="page-content" key={page}>
            {renderPage(page, navigate)}
          </main>
        </div>
      </div>
    </>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <DataPilotProvider>
      <AppShell />
    </DataPilotProvider>
  );
}