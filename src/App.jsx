import { useState, useEffect } from "react";
import { styles } from "./styles.jsx";
import { DataPilotProvider, useDataPilot } from "./DataPilotContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import PageAuth from "./pages/PageAuth.jsx";
import PageDashboard from "./pages/PageDashboard.jsx";
import PageUpload from "./pages/PageUpload.jsx";
import PageOverview from "./pages/PageOverview.jsx";
import PageInsights from "./pages/PageInsights.jsx";
import PageVisualization from "./pages/PageVisualization.jsx";
import PageTrain from "./pages/PageTrain.jsx";
import PageReport from "./pages/PageReport.jsx";
import PagePredictions from "./pages/PagePredictions.jsx";
import PageCleaning from "./pages/PageCleaning.jsx";
import PageCodeGen from "./pages/PageCodeGen.jsx";
import PageSettings from "./pages/PageSettings.jsx";

function renderPage(page, setPage) {
  switch (page) {
    case "dashboard":
      return <PageDashboard setPage={setPage} />;
    case "upload":
      return <PageUpload setPage={setPage} />;
    case "overview":
      return <PageOverview />;
    case "insights":
      return <PageInsights />;
    case "visualization":
      return <PageVisualization />;
    case "train":
      return <PageTrain />;
    case "report":
      return <PageReport />;
    case "predictions":
      return <PagePredictions />;
    case "cleaning":
      return <PageCleaning />;
    case "codegen":
      return <PageCodeGen />;
    case "settings":
      return <PageSettings />;
    default:
      return <PageDashboard setPage={setPage} />;
  }
}

function AppShell() {
  const { user, authLoading } = useDataPilot();

  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (p) => {
    setPage(p);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const savedTheme =
      localStorage.getItem("theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    const savedAccent = localStorage.getItem("accentColor") || "#6c63ff";

    document.documentElement.setAttribute("data-theme", savedTheme);
    document.documentElement.setAttribute("data-accent", savedAccent);
  }, []);

  if (authLoading) {
    return (
      <>
        <style>{styles}</style>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#0b0f19",
            color: "#fff",
            fontSize: "1rem",
          }}
        >
          Loading...
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <style>{styles}</style>
        <PageAuth />
      </>
    );
  }

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
          <Topbar
            page={page}
            onMenuClick={() => setSidebarOpen((o) => !o)}
          />
          <main className="page-content" key={page}>
            {renderPage(page, navigate)}
          </main>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <DataPilotProvider>
      <AppShell />
    </DataPilotProvider>
  );
}