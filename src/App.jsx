/**
 * App.jsx — DataPilot
 *
 * Routing: React Router DOM v6
 * Each page has its own URL (e.g. /cleaning, /insights, /upload).
 * Users can bookmark pages and navigate directly via URL.
 * Auth guard redirects unauthenticated users to /auth.
 * Onboarding logic and session banners are fully preserved.
 */

import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { Analytics } from "@vercel/analytics/next"
import { doc, getDoc, setDoc }  from "firebase/firestore";
import { db }                   from "./services/firebase";
import { saveUserProfile }      from "./services/firestore";
import { styles }               from "./styles.jsx";
import { DataPilotProvider, useDataPilot, API_BASE } from "./DataPilotContext.jsx";
import Sidebar      from "./components/Sidebar.jsx";
import Topbar       from "./components/Topbar.jsx";
import PageAuth     from "./pages/PageAuth.jsx";
import PageOnboarding   from "./pages/PageOnboarding.jsx";
import PageBetaProfile  from "./pages/PageBetaProfile.jsx";
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

// ── Route → page name map (for Sidebar/Topbar active state) ───────────────────

const PATH_TO_PAGE = {
  "/dashboard":    "dashboard",
  "/upload":       "upload",
  "/overview":     "overview",
  "/insights":     "insights",
  "/visualization":"visualization",
  "/train":        "train",
  "/report":       "report",
  "/predictions":  "predictions",
  "/cleaning":     "cleaning",
  "/codegen":      "codegen",
  "/settings":     "settings",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function minutesRemaining(session) {
  if (!session?.uploadedAt || session.expired) return null;
  const expiryMinutes = session.expiryMinutes || 180;
  const expiresMs = new Date(session.uploadedAt).getTime() + expiryMinutes * 60 * 1000;
  return Math.floor((expiresMs - Date.now()) / 60000);
}

// ── Banner 1: live expiry countdown across ALL sessions ────────────────────────

function SessionExpiryBanner() {
  const { sessions } = useDataPilot();
  const navigate     = useNavigate();
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
          onClick={() => navigate("/upload")}
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

function ReturnNotificationBanner() {
  const { sessions } = useDataPilot();
  const navigate     = useNavigate();
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
          onClick={() => navigate("/upload")}
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

// ── AppShell ───────────────────────────────────────────────────────────────────

function AppShell() {
  const {
    user,
    authLoading,
    isOffline,
    setIsOffline,
    retryConnection,
    retryingConnection,
    connectionRetryKey,
  } = useDataPilot();
  const navigate              = useNavigate();
  const location              = useLocation();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBetaProfile, setShowBetaProfile] = useState(false);
  const [betaSaving, setBetaSaving] = useState(false);

  // Derive active page name from current URL path
  const currentPage = PATH_TO_PAGE[location.pathname] || "dashboard";

  // ── Theme init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const savedTheme =
      localStorage.getItem("theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const savedAccent = localStorage.getItem("accentColor") || "#6c63ff";
    document.documentElement.setAttribute("data-theme", savedTheme);
    document.documentElement.setAttribute("data-accent", savedAccent);
  }, []);

  // ── Backend keep-alive (Render free tier anti-sleep) ───────────────────
  useEffect(() => {
    const ping = () => fetch(`${API_BASE}/health`).catch(() => {});
    ping();
    const interval = setInterval(ping, 9 * 60 * 1000); // every 9 min
    return () => clearInterval(interval);
  }, []);

  // ── Load betaProfile + onboarding flags; retry-aware ─────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadFlags = async () => {
      if (authLoading) return;

      if (!user) {
        if (!cancelled) {
          setFlagsLoading(false);
          setShowBetaProfile(false);
          setShowOnboarding(false);
        }
        return;
      }

      try {
        setFlagsLoading(true);

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};

        if (!cancelled) {
          setShowBetaProfile(!data?.betaProfileSeen);
          setShowOnboarding(!data?.onboardingSeen);
          setFlagsLoading(false);
        }
      } catch (err) {
        console.error("Could not read beta/onboarding flags:", err);

        if (
          err?.code === "unavailable" ||
          err?.code === "failed-precondition" ||
          err?.message?.toLowerCase().includes("offline")
        ) {
          setIsOffline(true);
        }

        if (!cancelled) {
          setFlagsLoading(false);
        }
      }
    };

    loadFlags();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, connectionRetryKey, setIsOffline]);

  // ── Mark onboarding as done in Firestore ────────────────────────────────
  const markOnboardingSeen = async () => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { onboardingSeen: true },
        { merge: true }
      );
    } catch (err) {
      console.error("Failed to persist onboardingSeen:", err);
    }
    setShowOnboarding(false);
  };

  const markBetaProfileSeen = async (payload = {}) => {
    if (!user) return;
    setBetaSaving(true);
    try {
      await saveUserProfile(user, {
        betaProfileSeen: true,
        role: payload.role,
        experienceLevel: payload.experienceLevel,
        primaryUseCase: payload.primaryUseCase,
        notes: payload.notes,
      });

      setShowBetaProfile(false);
    } catch (err) {
      console.error("Failed to save beta profile:", err);
    } finally {
      setBetaSaving(false);
    }
  };

  const goTo = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  // ── Loading screen ──────────────────────────────────────────────────────
    // Build the body based on current state but always render the OfflinePopup at top-level
    let body = null;

    if (authLoading || flagsLoading) {
      body = (
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: "#0b0f19", color: "#fff", fontSize: "1rem",
        }}>
          Loading...
        </div>
      );
    } else if (!user) {
      body = <PageAuth />;
    } else if (showBetaProfile) {
      body = (
        <div className="app-wrap">
          <div className="grid-bg" />
          <div
            className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar page="dashboard" setPage={goTo} isOpen={sidebarOpen} />
          <div className="main-area">
            <Topbar page="dashboard" onMenuClick={() => setSidebarOpen((o) => !o)} />
            <main className="page-content">
              <PageBetaProfile
                saving={betaSaving}
                onContinue={async (payload) => { await markBetaProfileSeen(payload); }}
                onSkip={async () => { await markBetaProfileSeen({}); }}
              />
            </main>
          </div>
        </div>
      );
    } else if (showOnboarding) {
      body = (
        <div className="app-wrap">
          <div className="grid-bg" />
          <div
            className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar page="dashboard" setPage={goTo} isOpen={sidebarOpen} />
          <div className="main-area">
            <Topbar page="dashboard" onMenuClick={() => setSidebarOpen((o) => !o)} />
            <main className="page-content">
              <PageOnboarding
                onStart={async () => { await markOnboardingSeen(); goTo("/upload"); }}
                onSkip={async ()  => { await markOnboardingSeen(); goTo("/dashboard"); }}
              />
            </main>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="app-wrap">
          <div className="grid-bg" />
          <div
            className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar page={currentPage} setPage={goTo} isOpen={sidebarOpen} />
          <div className="main-area">
            <Topbar page={currentPage} onMenuClick={() => setSidebarOpen((o) => !o)} />
            <SessionExpiryBanner />
            <ReturnNotificationBanner />
            <main className="page-content" key={location.pathname}>
              <Routes>
  <Route path="/dashboard"     element={<PageDashboard setPage={goTo} />} />
  <Route path="/upload"        element={<PageUpload setPage={goTo} />} />
  <Route path="/overview"      element={<PageOverview setPage={goTo} />} />
  <Route path="/cleaning"      element={<PageCleaning setPage={goTo} />} />
  <Route path="/insights"      element={<PageInsights setPage={goTo} />} />
  <Route path="/visualization" element={<PageVisualization setPage={goTo} />} />
  <Route path="/train"         element={<PageTrain setPage={goTo} />} />
  <Route path="/predictions"   element={<PagePredictions setPage={goTo} />} />
  <Route path="/report"        element={<PageReport setPage={goTo} />} />
  <Route path="/codegen"       element={<PageCodeGen setPage={goTo} />} />
  <Route path="/settings"      element={<PageSettings />} />
  <Route path="*"              element={<Navigate to="/dashboard" replace />} />
</Routes>
            </main>
          </div>
        </div>
      );
    }

    return (
      <>
        <style>{styles}</style>
        <OfflinePopup
          open={isOffline}
          onRetry={retryConnection}
          retrying={retryingConnection}
        />
        {body}
      </>
    );
}

function OfflinePopup({ open, onRetry, retrying }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(9, 12, 20, 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(20, 24, 35, 0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: "24px 22px",
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          You are offline
        </div>

        <div
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.78)",
            marginBottom: 20,
          }}
        >
          DataPilot could not connect to the internet. Please check your connection and try again.
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={onRetry}
            disabled={retrying}
            style={{
              border: "none",
              borderRadius: 14,
              padding: "12px 18px",
              background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
              color: "#111827",
              fontWeight: 700,
              cursor: retrying ? "not-allowed" : "pointer",
              opacity: retrying ? 0.7 : 1,
            }}
          >
            {retrying ? "Retrying..." : "Retry connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <DataPilotProvider>
        <AppShell />
      </DataPilotProvider>
      <Analytics />
    </BrowserRouter>
  );
}