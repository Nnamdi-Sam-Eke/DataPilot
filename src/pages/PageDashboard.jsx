import { useEffect, useMemo, useState } from "react";
import { SparkLine } from "../shared/charts.jsx";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot } from "../DataPilotContext.jsx";
import * as dashboardService from "../services/dashboard";
import * as firestoreService from "../services/firestore";

const RESPONSIVE_CSS = `
  @media (max-width: 640px) {
    .dashboard-panels { grid-template-columns: 1fr !important; }
    .dashboard-actions { flex-wrap: wrap; }
    .dashboard-stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .project-summary-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 400px) {
    .project-row-cta { display: none; }
    .activity-row { flex-wrap: wrap; }
    .activity-timestamp { width: 100%; text-align: left; padding-left: 40px; }
  }
`;

const EMPTY_SPARK = [0, 0, 0, 0, 0, 0, 0, 0];

const STATIC_STATS = [
  { label: "Models Trained", value: "—", sub: "Coming soon", color: "var(--cyan)", spark: EMPTY_SPARK },
  { label: "Avg. Accuracy", value: "—", sub: "Across all models", color: "var(--green)", spark: EMPTY_SPARK },
];

const TAG_CLASS = {
  Classification: "tag-blue",
  Regression: "tag-green",
  "Time Series": "tag-amber",
};

function timeAgo(ts) {
  if (!ts) return "";
  const millis = typeof ts?.toMillis === "function" ? ts.toMillis() : new Date(ts).getTime();
  if (!millis) return "";
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 2) return "Yesterday";
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(ts) {
  const value = ts?.toDate?.() || ts;
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function TrashIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function getSessionMap(sessions = []) {
  const map = new Map();
  sessions.forEach((session) => {
    if (session?.sessionId) map.set(session.sessionId, session);
  });
  return map;
}

function isDatasetExpired(dataset, sessionMap) {
  if (!dataset) return false;
  if (dataset.expired === true) return true;
  if (!dataset.sessionId) return true;
  const linked = sessionMap.get(dataset.sessionId);
  return linked?.expired === true;
}

function getProjectExpiry(projectDatasets, sessionMap) {
  if (!projectDatasets.length) return { allExpired: false, someExpired: false, activeCount: 0, expiredCount: 0 };
  const expiredCount = projectDatasets.filter((d) => isDatasetExpired(d, sessionMap)).length;
  const activeCount = projectDatasets.length - expiredCount;
  return {
    allExpired: expiredCount === projectDatasets.length,
    someExpired: expiredCount > 0 && activeCount > 0,
    activeCount,
    expiredCount,
  };
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  animation: "fadeIn 0.2s ease",
  padding: 16,
};

const modalBoxStyle = {
  background: "var(--bg2)",
  border: "1px solid var(--border-bright)",
  borderRadius: 16,
  padding: "24px",
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
  animation: "slideUp 0.25s ease",
};

export default function PageDashboard({ setPage }) {
  const {
  user,
  userProfile,
  projects,
  setProjects,
  switchSession,
  sessions,
  removeProjectSessions,
  resetWorkspaceState,
} = useDataPilot();


  const [datasets, setDatasets] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDatasets, setProjectDatasets] = useState([]);
  const [projectDatasetsLoading, setProjectDatasetsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubProjects = firestoreService.subscribeToUserProjects?.(user.uid, (data) => {
      setProjects(data || []);
    });

    const unsubDatasets = dashboardService.subscribeToUserDatasets?.(user.uid, (data) => {
      setDatasets(data || []);
      setLoading(false);
    });

    const unsubActivity = dashboardService.subscribeToUserActivity?.(user.uid, (data) => {
      setActivity(data || []);
    });

    return () => {
      unsubProjects?.();
      unsubDatasets?.();
      unsubActivity?.();
    };
  }, [user?.uid, setProjects]);

  useEffect(() => {
    if (!user?.uid || !selectedProject?.id || !firestoreService.getProjectDatasets) {
      setProjectDatasets([]);
      return;
    }

    let cancelled = false;

    const loadProjectDatasets = async () => {
      setProjectDatasetsLoading(true);
      try {
        const data = await firestoreService.getProjectDatasets(user.uid, selectedProject.id);
        if (!cancelled) setProjectDatasets(data || []);
      } catch (err) {
        console.error("Failed to load project datasets:", err);
        if (!cancelled) setProjectDatasets([]);
      } finally {
        if (!cancelled) setProjectDatasetsLoading(false);
      }
    };

    loadProjectDatasets();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, selectedProject?.id]);

  const sessionMap = useMemo(() => getSessionMap(sessions), [sessions]);

  const datasetsWithStatus = useMemo(
    () => datasets.map((dataset) => ({ ...dataset, isExpired: isDatasetExpired(dataset, sessionMap) })),
    [datasets, sessionMap]
  );

  const projectIds = useMemo(() => new Set((projects || []).map((project) => project.id)), [projects]);

  const standaloneDatasets = useMemo(
    () =>
      datasetsWithStatus.filter(
        (dataset) => !dataset.projectId || !projectIds.has(dataset.projectId)
      ),
    [datasetsWithStatus, projectIds]
  );

  const activeDatasetCount = datasetsWithStatus.filter((dataset) => !dataset.isExpired).length;
  const totalDatasets = datasets.length;

  const rowsProcessed = useMemo(
    () =>
      datasetsWithStatus.reduce(
        (sum, dataset) => sum + (Number(dataset.rowCount) || 0),
        0
      ),
    [datasetsWithStatus]
  );

  const projectDatasetMap = useMemo(() => {
    const map = new Map();

    datasetsWithStatus.forEach((dataset) => {
      if (!dataset.projectId) return;
      if (!projectIds.has(dataset.projectId)) return;

      if (!map.has(dataset.projectId)) map.set(dataset.projectId, []);
      map.get(dataset.projectId).push(dataset);
    });

    return map;
  }, [datasetsWithStatus, projectIds]);

  const datasetSpark = datasets.length
    ? [...datasets].reverse().slice(-8).map((_, index) => index + 1)
    : EMPTY_SPARK;

  const rowsSpark = datasets.length
    ? (() => {
        const sorted = [...datasets].reverse().slice(-8);
        let running = 0;
        return sorted.map((dataset) => {
          running += dataset.rowCount || 0;
          return running;
        });
      })()
    : EMPTY_SPARK;

  const liveStats = [
    {
      label: "Total Datasets",
      value: loading ? "—" : String(totalDatasets),
      sub: loading ? "Loading…" : `${activeDatasetCount} active · ${totalDatasets - activeDatasetCount} expired`,
      color: "var(--accent)",
      spark: datasetSpark,
    },
    ...STATIC_STATS,
    {
      label: "Total Rows Processed",
      value: loading
        ? "—"
        : rowsProcessed >= 1_000_000
        ? `${(rowsProcessed / 1_000_000).toFixed(1)}M`
        : rowsProcessed >= 1000
        ? `${Math.round(rowsProcessed / 1000)}K`
        : String(rowsProcessed),
      sub: "Rows across current datasets",
      color: "var(--amber)",
      spark: rowsSpark,
    },
  ];

  const displayName = userProfile?.firstName || userProfile?.displayName?.split(" ")[0] || "there";

  const logDeleteActivity = async (action, detail) => {
    if (!user?.uid || !dashboardService.logActivity) return;
    await dashboardService.logActivity(user.uid, {
      action,
      detail,
      color: "var(--red)",
    });
  };

  const clearProjectContextIfNeeded = (projectId) => {
    const currentProjectId = localStorage.getItem("dp_current_project_id");
    if (currentProjectId && currentProjectId === projectId) {
      localStorage.removeItem("dp_current_project_id");
      localStorage.removeItem("dp_current_project_name");
      localStorage.removeItem("dp_current_project_id_from_dashboard");
    }
  };

  const closeDeleteDialog = () => {
    if (!deleting) setConfirmDelete(null);
  };

 const handleCreateProject = async () => {
  const name = newProjectName.trim();
  if (!name || !user?.uid || !firestoreService.createProject) return;

  try {
    await firestoreService.createProject(user.uid, name);

    if (dashboardService.logActivity) {
      await dashboardService.logActivity(user.uid, {
        action: "Project created",
        detail: name,
        color: "var(--accent)",
      });
    }

    setShowNewProject(false);
    setNewProjectName("");
  } catch (err) {
    console.error("Failed to create project:", err);
    alert("Failed to create project. Please try again.");
  }
};

  const handleAddDatasetToProject = (project) => {
    localStorage.setItem("dp_current_project_id", project.id);
    localStorage.setItem("dp_current_project_name", project.name);
    localStorage.setItem("dp_current_project_id_from_dashboard", "true");
    setSelectedProject(null);
    setPage("/upload");
  };

  const handleOpenDataset = async (dataset, project = null) => {
    if (!dataset?.sessionId) return;

    if (project?.id) {
      localStorage.setItem("dp_current_project_id", project.id);
      localStorage.setItem("dp_current_project_name", project.name);
      localStorage.setItem("dp_current_project_id_from_dashboard", "true");
    } else {
      localStorage.removeItem("dp_current_project_id");
      localStorage.removeItem("dp_current_project_name");
      localStorage.removeItem("dp_current_project_id_from_dashboard");
    }

    const sessionIndex = sessions.findIndex((session) => session.sessionId === dataset.sessionId);
    if (sessionIndex !== -1) {
      await switchSession(sessionIndex);
      setSelectedProject(null);
      setPage("/overview");
      return;
    }

    setSelectedProject(null);
    setPage("/upload");
  };

  const handleDeleteStandaloneDataset = async (dataset) => {
    if (!user?.uid) return;
    if (typeof firestoreService.deleteDataset !== "function") {
      alert("deleteDataset is not exported from services/firestore yet.");
      return;
    }

    setDeleting(true);
    try {
      await firestoreService.deleteDataset(user.uid, dataset.id, dataset.projectId || null);
      await logDeleteActivity("Dataset deleted", dataset.fileName || "Untitled dataset");
      setConfirmDelete(null);
      setSelectedProject((prev) => (prev ? prev : null));
    } catch (err) {
      console.error("Failed to delete dataset:", err);
      alert("Failed to delete dataset. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteProjectDataset = async (dataset) => {
    if (!user?.uid) return;
    if (typeof firestoreService.deleteDataset !== "function") {
      alert("deleteDataset is not exported from services/firestore yet.");
      return;
    }

    setDeleting(true);
    try {
      await firestoreService.deleteDataset(user.uid, dataset.id, dataset.projectId || null);
      await logDeleteActivity(
        "Dataset deleted",
        `${dataset.fileName || "Untitled dataset"}${selectedProject?.name ? ` · ${selectedProject.name}` : ""}`
      );
      setProjectDatasets((prev) => prev.filter((item) => item.id !== dataset.id));
      setConfirmDelete(null);
    } catch (err) {
      console.error("Failed to delete project dataset:", err);
      alert("Failed to delete dataset. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

 const handleDeleteProject = async (project) => {
  if (!user?.uid) return;
  if (typeof firestoreService.deleteProject !== "function") {
    alert("deleteProject is not exported from services/firestore yet.");
    return;
  }

  setDeleting(true);
  try {
    const activeProjectId = localStorage.getItem("dp_current_project_id");

    await firestoreService.deleteProject(user.uid, project.id);
    await logDeleteActivity("Project deleted", project.name || "Untitled project");

    clearProjectContextIfNeeded(project.id);

    if (typeof removeProjectSessions === "function") {
      removeProjectSessions(project.id);
    } else if (activeProjectId === project.id && typeof resetWorkspaceState === "function") {
      resetWorkspaceState();
    }

    setSelectedProject(null);
    setConfirmDelete(null);
    setPage("/dashboard");
  } catch (err) {
    console.error("Failed to delete project:", err);
    alert("Failed to delete project. Please try again.");
  } finally {
    setDeleting(false);
  }
};
  return (
    <div className="page-enter">
      <style>{RESPONSIVE_CSS}</style>

      <div className="flex items-center justify-between mb-6" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-title">Welcome back, {displayName} 👋</div>
          <div className="page-subtitle">
            Your workspace · {activeDatasetCount} active dataset{activeDatasetCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex gap-2 dashboard-actions">
          <button
            className="btn-secondary"
            onClick={() => {
              localStorage.removeItem("dp_current_project_id");
              localStorage.removeItem("dp_current_project_name");
              localStorage.removeItem("dp_current_project_id_from_dashboard");
              setPage("/upload");
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={Icons.upload} />
            </svg>
            Upload Data
          </button>
          <button className="btn-primary" onClick={() => setShowNewProject(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={Icons.plus} />
            </svg>
            New Project
          </button>
        </div>
      </div>

      <div className="grid-4 dashboard-stats-grid mb-5 fade-up">
        {liveStats.map((stat, index) => (
          <div key={index} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="stat-label">{stat.label}</div>
              <SparkLine values={stat.spark} color={stat.color} width={60} height={28} />
            </div>
            <div className="stat-value" style={{ fontSize: 20, color: stat.color }}>
              {stat.value}
            </div>
            <div className="stat-sub">{stat.sub}</div>
          </div>
        ))}
      </div>

    <div className="grid-2 dashboard-panels fade-up fade-up-1">
        {/* Merged & Improved Recent Projects & Datasets Card */}
        <div className="card" style={{ minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 380 }}>
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={Icons.layers} />
            </svg>
            Recent Projects & Datasets
            {(projects.length + standaloneDatasets.length) > 0 && (
              <span className="tag tag-blue" style={{ marginLeft: "auto" }}>
                {projects.length} project{projects.length !== 1 ? "s" : ""}
                {standaloneDatasets.length > 0 ? ` • ${standaloneDatasets.length} standalone` : ""}
              </span>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              paddingRight: 4,
              paddingBottom: 4,
              scrollbarGutter: "stable",
            }}
          >
            {loading && projects.length === 0 && datasets.length === 0 ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="skeleton" style={{ height: 52, borderRadius: 9, flexShrink: 0 }} />
              ))
            ) : (
              <>
                {projects.map((project) => {
                  const linkedDatasets = projectDatasetMap.get(project.id) || [];
                  const expiry = getProjectExpiry(linkedDatasets, sessionMap);

                  return (
                    <div
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        background: "var(--bg3)",
                        borderRadius: 9,
                        border: `1px solid ${
                          expiry.allExpired
                            ? "rgba(248,113,113,0.25)"
                            : expiry.someExpired
                            ? "rgba(251,191,36,0.28)"
                            : "var(--border)"
                        }`,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        minWidth: 0,
                        overflow: "hidden",
                        flexShrink: 0,
                        marginBottom: 10,
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor = expiry.allExpired
                          ? "rgba(248,113,113,0.4)"
                          : expiry.someExpired
                          ? "rgba(251,191,36,0.45)"
                          : "var(--border-bright)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = expiry.allExpired
                          ? "rgba(248,113,113,0.25)"
                          : expiry.someExpired
                          ? "rgba(251,191,36,0.28)"
                          : "var(--border)";
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          flexShrink: 0,
                          background: "var(--accent-dim)",
                          border: "1px solid rgba(108,99,255,0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={Icons.layers} />
                        </svg>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "var(--text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {project.name}
                          </div>
                          {expiry.allExpired ? (
                            <span className="tag tag-red" style={{ flexShrink: 0 }}>All Expired</span>
                          ) : expiry.someExpired ? (
                            <span className="tag tag-amber" style={{ flexShrink: 0 }}>Some Expired</span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--text3)",
                            fontFamily: "'DM Mono', monospace",
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {linkedDatasets.length} dataset{linkedDatasets.length !== 1 ? "s" : ""} · Created {formatDate(project.createdAt)}
                        </div>
                      </div>

                      <span className="project-row-cta" style={{ fontSize: 11, color: "var(--accent2)", flexShrink: 0 }}>
                        Open →
                      </span>
                    </div>
                  );
                })}

                {standaloneDatasets
                  .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                  .map((dataset) => (
                    <div
                      key={dataset.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        background: "var(--bg3)",
                        borderRadius: 9,
                        border: `1px solid ${dataset.isExpired ? "rgba(248,113,113,0.25)" : "var(--border)"}`,
                        minWidth: 0,
                        overflow: "hidden",
                        flexShrink: 0,
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: dataset.isExpired ? "var(--red)" : "var(--green)",
                          flexShrink: 0,
                        }}
                      />

                      <div onClick={() => handleOpenDataset(dataset)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "var(--text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {dataset.fileName}
                          </div>
                          <span className={`tag ${dataset.isExpired ? "tag-red" : "tag-green"}`} style={{ flexShrink: 0 }}>
                            {dataset.isExpired ? "Expired" : "Active"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--text3)",
                            fontFamily: "'DM Mono', monospace",
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {dataset.rowCount?.toLocaleString()} rows · {timeAgo(dataset.createdAt)}
                        </div>
                      </div>

                      <span
                        className={`tag ${TAG_CLASS[dataset.tag] || "tag-blue"}`}
                        style={{
                          flexShrink: 0,
                          maxWidth: 80,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dataset.tag || "Dataset"}
                      </span>

                      <button
                        aria-label={`Delete ${dataset.fileName}`}
                        onClick={() =>
                          setConfirmDelete({
                            type: "standalone-dataset",
                            title: "Delete dataset?",
                            description: `This will permanently remove ${dataset.fileName || "this dataset"} from your dashboard workspace.`,
                            item: dataset,
                          })
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text3)",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.color = "var(--red)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.color = "var(--text3)";
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}

                {projects.length === 0 && standaloneDatasets.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "40px 0" }}>
                    No projects or standalone datasets yet.{" "}
                    <span style={{ color: "var(--accent2)", cursor: "pointer" }} onClick={() => setShowNewProject(true)}>
                      Create your first project →
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Recent Activity Card (unchanged) */}
        <div className="card" style={{ minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 380 }}>
          <div className="card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={Icons.predict} />
            </svg>
            Recent Activity
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", paddingRight: 4, paddingBottom: 4 }}>
            {activity.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "40px 0" }}>
                No activity yet. Actions you take will appear here.
              </div>
            ) : (
              activity.map((item, index) => (
                <div
                  key={item.id}
                  className="activity-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 2px",
                    borderBottom: index < activity.length - 1 ? "1px solid var(--border)" : "none",
                    minWidth: 0,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.action}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.detail}
                    </div>
                  </div>
                  <div className="activity-timestamp" style={{ fontSize: 10, color: "var(--text3)", fontFamily: "'DM Mono', monospace", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {timeAgo(item.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showNewProject && (
        <div style={overlayStyle} onClick={() => setShowNewProject(false)}>
          <div style={modalBoxStyle} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={Icons.plus} />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>New Project</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>Give your project a name to get started</div>
              </div>
            </div>

            <input
              type="text"
              placeholder="e.g. Customer Churn Analysis"
              value={newProjectName}
              autoFocus
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newProjectName.trim()) handleCreateProject();
              }}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 9, background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", transition: "border-color 0.15s", marginBottom: 20 }}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => { setShowNewProject(false); setNewProjectName(""); }}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!newProjectName.trim()} onClick={handleCreateProject} style={{ opacity: newProjectName.trim() ? 1 : 0.45 }}>
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProject && (
        <div style={overlayStyle} onClick={() => setSelectedProject(null)}>
          <div style={{ ...modalBoxStyle, maxWidth: 760, padding: "24px 24px 20px" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={Icons.layers} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{selectedProject.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Created {formatDate(selectedProject.createdAt)}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    setConfirmDelete({
                      type: "project",
                      title: "Delete project?",
                      description: `This will remove ${selectedProject.name || "this project"}${projectDatasets.length ? ` and its ${projectDatasets.length} dataset${projectDatasets.length !== 1 ? "s" : ""}` : ""}.`,
                      item: selectedProject,
                    })
                  }
                  style={{ color: "var(--red)" }}
                >
                  <TrashIcon />
                  Delete Project
                </button>
                <button className="btn-secondary" onClick={() => setSelectedProject(null)}>
                  Close
                </button>
              </div>
            </div>

            {(() => {
              const expiry = getProjectExpiry(projectDatasets, sessionMap);
              return (
                <div className="project-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Datasets</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{projectDatasets.length}</div>
                  </div>
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Active</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--green)" }}>{expiry.activeCount}</div>
                  </div>
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Expired</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--red)" }}>{expiry.expiredCount}</div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Project datasets</div>
              <button className="btn-primary" onClick={() => handleAddDatasetToProject(selectedProject)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={Icons.upload} />
                </svg>
                Add Dataset
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
              {projectDatasetsLoading ? (
                Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton" style={{ height: 66, borderRadius: 10 }} />)
              ) : projectDatasets.length > 0 ? (
                projectDatasets.map((dataset) => {
                  const expired = isDatasetExpired(dataset, sessionMap);
                  return (
                    <div
                      key={dataset.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        background: "var(--bg3)",
                        borderRadius: 10,
                        border: `1px solid ${expired ? "rgba(248,113,113,0.25)" : "var(--border)"}`,
                        opacity: expired ? 0.78 : 1,
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: expired ? "var(--red)" : "var(--green)", flexShrink: 0 }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {dataset.fileName || "Untitled dataset"}
                          </div>
                          <span className={`tag ${expired ? "tag-red" : "tag-green"}`}>{expired ? "Expired" : "Active"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {(dataset.rowCount || 0).toLocaleString()} rows · {(dataset.columns || []).length} cols
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        onClick={() => (expired ? handleAddDatasetToProject(selectedProject) : handleOpenDataset(dataset, selectedProject))}
                        style={{ padding: "8px 12px" }}
                      >
                        {expired ? "Re-upload" : "Open"}
                      </button>

                      <button
                        aria-label={`Delete ${dataset.fileName}`}
                        onClick={() =>
                          setConfirmDelete({
                            type: "project-dataset",
                            title: "Delete dataset?",
                            description: `This will remove ${dataset.fileName || "this dataset"} from ${selectedProject.name}.`,
                            item: dataset,
                          })
                        }
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.color = "var(--red)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.color = "var(--text3)";
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "18px 16px", borderRadius: 10, background: "var(--bg3)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>No datasets yet</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
                    Upload a CSV, XLSX, or JSON file to begin working inside this project.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={overlayStyle} onClick={closeDeleteDialog}>
          <div style={modalBoxStyle} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.22)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)" }}>
                <TrashIcon size={16} color="var(--red)" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{confirmDelete.title}</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, lineHeight: 1.6 }}>{confirmDelete.description}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={closeDeleteDialog} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn-secondary"
                disabled={deleting}
                onClick={() => {
                  if (confirmDelete.type === "standalone-dataset") return handleDeleteStandaloneDataset(confirmDelete.item);
                  if (confirmDelete.type === "project-dataset") return handleDeleteProjectDataset(confirmDelete.item);
                  if (confirmDelete.type === "project") return handleDeleteProject(confirmDelete.item);
                }}
                style={{ color: "var(--red)", opacity: deleting ? 0.65 : 1 }}
              >
                <TrashIcon />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}