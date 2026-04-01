// DataPilotContext.jsx - FINAL CLEAN & COMPLETE VERSION

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  signUpUser,
  signInUser,
  signOutUser,
  observeAuthState,
} from "./services/auth";
import {
  saveUserProfile,
  getUserDatasets,
  getUserProjects,
  deleteDataset,
} from "./services/firestore";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./services/firebase";
import { fetchSessionData } from "./services/data";

const DataPilotContext = createContext(null);

const LS_KEY = "datapilot_state";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

function clearState() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

export function DataPilotProvider({ children }) {
  const p = loadState();

  // ── Theme & Accent ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });

  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("accentColor") || "#6c63ff");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accentColor);
    localStorage.setItem("theme", theme);
    localStorage.setItem("accentColor", accentColor);
  }, [theme, accentColor]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // ── Auth & User ────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [userProfile, setUserProfileRaw] = useState(
    p?.userProfile || { displayName: "", email: "", plan: "Pro" }
  );

  // ── Projects ───────────────────────────────────────────────────────────
  const [projects, setProjectsRaw] = useState(p?.projects || []);

  // ── Active session & multi-file ────────────────────────────────────────
  const [sessionId, setSessionIdRaw] = useState(p?.sessionId || null);
  const [columns, setColumnsRaw] = useState(p?.columns || []);
  const [summary, setSummaryRaw] = useState(p?.summary || null);
  const [fileName, setFileNameRaw] = useState(p?.fileName || "");
  const [rowCount, setRowCountRaw] = useState(p?.rowCount || 0);

  const [sessions, setSessionsRaw] = useState(p?.sessions || []);
  const [activeIdx, setActiveIdxRaw] = useState(p?.activeIdx ?? null);

  // ── Other states ───────────────────────────────────────────────────────
  const [cleanPreview, setCleanPreviewRaw] = useState(p?.cleanPreview || null);
  const [previewLoading, setPreviewLoadingRaw] = useState(false);

  const [modelId, setModelIdRaw] = useState(p?.modelId || null);
  const [modelMeta, setModelMetaRaw] = useState(p?.modelMeta || null);

  const [trainResults, setTrainResultsRaw] = useState(p?.trainResults || null);
  const [trainConfig, setTrainConfigRaw] = useState(p?.trainConfig || { selectedModel: "rf", targetCol: "", testSize: 0.2 });
  const [savedPlots, setSavedPlotsRaw] = useState(p?.savedPlots || []);
  const [predictionResults, setPredictionResultsRaw] = useState(p?.predictionResults || null);
  const [predictionFileName, setPredictionFileNameRaw] = useState(p?.predictionFileName || "");
  const [savedReport, setSavedReportRaw] = useState(p?.savedReport || null);
  const [reportFormat, setReportFormatRaw] = useState(p?.reportFormat || "HTML");
  const [reportChecked, setReportCheckedRaw] = useState(p?.reportChecked || null);
  const [chatMessages, setChatMessagesRaw] = useState(p?.chatMessages || null);

  const [cleanOpLog, setCleanOpLogRaw] = useState(p?.cleanOpLog || []);
  const [cleanFillStrategies, setCleanFillStrategiesRaw] = useState(p?.cleanFillStrategies || {});
  const [cleanRenameMap, setCleanRenameMapRaw] = useState(p?.cleanRenameMap || {});
 // After the cleanCastMap line (around line 106)
const [cleanCastMap, setCleanCastMapRaw] = useState(p?.cleanCastMap || {});
const [cleanEncodeMap, setCleanEncodeMapRaw] = useState(p?.cleanEncodeMap || {});   // ← Added
const [cleanPromoted, setCleanPromotedRaw] = useState(p?.cleanPromoted || false);
  const [groqKey, setGroqKeyRaw] = useState(p?.groqKey || "");

  // ── Auth actions ───────────────────────────────────────────────────────
  const signup = async (email, password, profile = {}) => {
    const cred = await signUpUser(email, password);
    const firstName = (profile.firstName || "").trim();
    const lastName = (profile.lastName || "").trim();
    const displayName = `${firstName} ${lastName}`.trim();

    if (cred?.user) {
      await saveUserProfile(cred.user, { firstName, lastName, displayName });
      setUserProfileRaw((prev) => ({
        ...prev,
        firstName,
        lastName,
        displayName,
        email: cred.user.email || email || "",
      }));
    }
    return cred;
  };

  const login = async (email, password) => await signInUser(email, password);

  const logout = async () => {
    await signOutUser();
    reset();
  };

  // ── Helper ─────────────────────────────────────────────────────────────
  const updateSessionPreview = (idx, previewData) => {
    setSessionsRaw((prev) =>
      prev.map((sess, i) =>
        i === idx
          ? {
              ...sess,
              preview: {
                columns: previewData.columns || sess.columns || [],
                rows: previewData.rows || [],
              },
            }
          : sess
      )
    );
  };

  // ── Auth listener ──────────────────────────────────────────────────────
  useEffect(() => {
  const unsubscribe = observeAuthState(async (firebaseUser) => {
    setUser(firebaseUser);

    if (firebaseUser) {
      // Load profile
      try {
        const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        let profileData = {
          displayName: "",
          email: firebaseUser.email || "",
          plan: "Pro",
        };

        if (userSnap.exists()) {
          const data = userSnap.data();
          profileData = {
            ...profileData,
            displayName:
              data.displayName ||
              `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            firstName: data.firstName || "",
            lastName: data.lastName || "",
          };
        }

        setUserProfileRaw(profileData);
      } catch (err) {
        console.error("Failed to load profile:", err);
      }

      // Load projects
      try {
        const projectsData = await getUserProjects(firebaseUser.uid);
        setProjectsRaw(projectsData);
      } catch (err) {
        console.error("Failed to load projects:", err);
      }

      // Restore sessions
      try {
        const datasets = await getUserDatasets(firebaseUser.uid);

        const restoredSessions = datasets.map((d) => ({
          id: d.id,
          sessionId: d.sessionId || d.id,
          fileName: d.fileName || "",
          fileSize: d.fileSize || 0,
          lastModified: d.lastModified || 0,
          rowCount: d.rowCount || 0,
          columns: d.columns || [],
          summary: d.summary || null,
          projectId: d.projectId || null,
          preview: null,
        }));

        // ── Proactive validation: ping backend for ALL sessions concurrently ──
        // This catches sessions whose backend cache has expired (3hr TTL) before
        // the user clicks into them, so the UI never shows a false "Active" badge.
        // We use limit=1 so each probe is a minimal fetch — just confirming the
        // session still exists in the backend in-memory cache.
        const probeSession = async (sid) => {
          const res = await fetch(`${API_BASE}/data/${sid}?limit=1&offset=0`);
          if (res.status === 404) {
            const err = new Error("Session expired");
            err.code = "SESSION_EXPIRED";
            throw err;
          }
          if (!res.ok) throw new Error("Backend error");
          return res.json();
        };

        const validationResults = await Promise.allSettled(
          restoredSessions.map((s) => probeSession(s.sessionId))
        );

        const validatedSessions = restoredSessions.map((s, i) => {
          const result = validationResults[i];
          const isExpired =
            result.status === "rejected" && result.reason?.code === "SESSION_EXPIRED";
          return isExpired ? { ...s, expired: true } : s;
        });

        setSessionsRaw(validatedSessions);

        if (validatedSessions.length > 0) {
          // Prefer the first non-expired session; fall back to first overall
          const firstLiveIdx = validatedSessions.findIndex((s) => !s.expired);
          const idx = firstLiveIdx !== -1 ? firstLiveIdx : 0;
          const first = validatedSessions[idx];

          setActiveIdxRaw(idx);
          setSessionIdRaw(first.sessionId);
          setColumnsRaw(first.columns || []);
          setSummaryRaw(first.summary || null);
          setFileNameRaw(first.fileName || "");
          setRowCountRaw(first.rowCount || 0);

          if (first.expired) {
            // Active session is expired — no preview to load
            setCleanPreviewRaw(null);
          } else {
            setPreviewLoadingRaw(true);
            try {
              // Re-use the already-fetched probe data for the active session
              const probeResult = validationResults[idx];
              if (probeResult.status === "fulfilled") {
                const data = probeResult.value;
                const previewRows = data.data || [];
                const previewCols = data.columns || first.columns || [];

                setCleanPreviewRaw(previewRows);
                updateSessionPreview(idx, { columns: previewCols, rows: previewRows });
                if (previewCols.length) setColumnsRaw(previewCols);
              }
            } catch (err) {
              console.error("Failed to rehydrate first dataset:", err);
              setCleanPreviewRaw(null);
            } finally {
              setPreviewLoadingRaw(false);
            }
          }
        } else {
          setActiveIdxRaw(null);
          setCleanPreviewRaw(null);
        }
      } catch (err) {
        console.error("Failed to restore sessions:", err);
      }
    } else {
      setProjectsRaw([]);
      setSessionsRaw([]);
      setActiveIdxRaw(null);
      setCleanPreviewRaw(null);
    }

    setAuthLoading(false);
  });

  return unsubscribe;
}, []);

function removeProjectSessions(projectId) {
  setSessionsRaw((prev) => {
    const activeSession = activeIdx !== null ? prev[activeIdx] : null;
    const remaining = prev.filter((s) => s.projectId !== projectId);
    const activeWasDeleted = activeSession?.projectId === projectId;

    if (activeWasDeleted) {
      queueMicrotask(() => {
        resetWorkspaceState();
      });
    } else {
      const nextIdx = activeSession
        ? remaining.findIndex((s) => s.sessionId === activeSession.sessionId)
        : null;

      queueMicrotask(() => {
        setActiveIdxRaw(nextIdx === -1 ? null : nextIdx);
      });
    }

    return remaining;
  });
}
  // ── Safe Persistence (excludes groqKey and cleanPreview) ───────────────
  useEffect(() => {
    const safeState = {
      sessionId,
      columns,
      summary,
      fileName,
      rowCount,
      modelId,
      modelMeta,
      sessions,
      activeIdx,
      trainResults,
      trainConfig,
      savedPlots,
      savedReport,
      reportFormat,
      reportChecked,
      chatMessages,
      predictionResults,
      predictionFileName,
      cleanOpLog,
      cleanFillStrategies,
      cleanRenameMap,
      cleanCastMap,
      cleanEncodeMap,
      cleanPromoted,
      userProfile,
      projects,
    };
    saveState(safeState);
  }, [
    sessionId, columns, summary, fileName, rowCount,
    modelId, modelMeta, sessions, activeIdx,
    trainResults, trainConfig, savedPlots,
    savedReport, reportFormat, reportChecked,
    chatMessages, predictionResults, predictionFileName,
    cleanOpLog, cleanFillStrategies, cleanRenameMap,
    cleanCastMap, cleanEncodeMap, cleanPromoted,
    userProfile, projects,
  ]);

  // ── Setters ────────────────────────────────────────────────────────────
  const setSessionId = (v) => setSessionIdRaw(v);
  const setColumns = (v) => setColumnsRaw(v);
  const setSummary = (v) => setSummaryRaw(v);
  const setFileName = (v) => setFileNameRaw(v);
  const setRowCount = (v) => setRowCountRaw(v);
  const setModelId = (v) => setModelIdRaw(v);
  const setModelMeta = (v) => setModelMetaRaw(v);
  const setSessions = (v) => setSessionsRaw(v);
  const setActiveIdx = (v) => setActiveIdxRaw(v);
  const setTrainResults = (v) => setTrainResultsRaw(v);
  const setTrainConfig = (v) => setTrainConfigRaw(v);
  const setSavedPlots = (v) => setSavedPlotsRaw(v);
  const setPredictionResults = (v) => setPredictionResultsRaw(v);
  const setPredictionFileName = (v) => setPredictionFileNameRaw(v);
  const setSavedReport = (v) => setSavedReportRaw(v);
  const setReportFormat = (v) => setReportFormatRaw(v);
  const setReportChecked = (v) => setReportCheckedRaw(v);
  const setChatMessages = (v) => setChatMessagesRaw(v);
  const setCleanOpLog = (v) => setCleanOpLogRaw(v);
  const setCleanFillStrategies = (v) => setCleanFillStrategiesRaw(v);
  const setCleanRenameMap = (v) => setCleanRenameMapRaw(v);
  const setCleanCastMap = (v) => setCleanCastMapRaw(v);
  const setCleanEncodeMap = (v) => setCleanEncodeMapRaw(v);
  const setCleanPreview = (v) => setCleanPreviewRaw(v);
  const setCleanPromoted = (v) => setCleanPromotedRaw(v);
  const setPreviewLoading = (v) => setPreviewLoadingRaw(v);
  const setGroqKey = (v) => setGroqKeyRaw(v);
  const setUserProfile = (v) => setUserProfileRaw(v);

  const resetClean = () => {
  setCleanOpLogRaw([]);
  setCleanFillStrategiesRaw({});
  setCleanRenameMapRaw({});
  setCleanCastMapRaw({});
  setCleanEncodeMapRaw({});      // ← Added
  setCleanPreviewRaw(null);
  setCleanPromotedRaw(false);
};

  const markSessionExpired = (sessionIdToExpire) => {
  if (!sessionIdToExpire) return;

  setSessionsRaw((prev) =>
    prev.map((s) =>
      s.sessionId === sessionIdToExpire ? { ...s, expired: true } : s
    )
  );

  if (sessionIdToExpire === sessionId) {
    setCleanPreviewRaw(null);
  }
};

  // ── Session Management Functions (copied from your original) ───────────
const switchSession = async (idx) => {
  const s = sessions[idx];
  if (!s) return;

  setActiveIdxRaw(idx);
  setSessionIdRaw(s.sessionId);
  setColumnsRaw(s.columns || []);
  setSummaryRaw(s.summary || null);
  setFileNameRaw(s.fileName || "");
  setRowCountRaw(s.rowCount || 0);

  setModelIdRaw(null);
  setModelMetaRaw(null);
  setTrainResultsRaw(null);
  setTrainConfigRaw({ selectedModel: "rf", targetCol: "", testSize: 0.2 });
  setSavedPlotsRaw([]);
  setSavedReportRaw(null);
  setChatMessagesRaw(null);
  setPredictionResultsRaw(null);
  setPredictionFileNameRaw("");
  resetClean();

  if (!s.sessionId) return;

  setPreviewLoadingRaw(true);
  try {
    const data = await fetchSessionData(s.sessionId);
    const previewRows = data.data || [];
    const previewCols = data.columns || s.columns || [];

    setCleanPreviewRaw(previewRows);
    updateSessionPreview(idx, { columns: previewCols, rows: previewRows });

    if (previewCols.length) setColumnsRaw(previewCols);
  } catch (err) {
    if (err?.code === "SESSION_EXPIRED") {
      console.warn("Session expired");
      markSessionExpired(s.sessionId);
    } else {
      console.error(`Failed to load preview for session ${s.sessionId}:`, err);
      setCleanPreviewRaw(null);
    }
  } finally {
    setPreviewLoadingRaw(false);
  }
};

  const addSession = async (newSession) => {
  let resolvedIdx = -1;
  let isReplacement = false;

  // Derive the next state synchronously so we know the true index immediately
  setSessionsRaw((prev) => {
    const existsAt = prev.findIndex((s) => s.fileName === newSession.fileName);

    if (existsAt !== -1) {
      isReplacement = true;
      resolvedIdx   = existsAt;
      const updated = [...prev];
      updated[existsAt] = newSession;
      return updated;
    }

    const updated   = [...prev, newSession];
    resolvedIdx     = updated.length - 1;   // safe: derived from same updated array
    return updated;
  });

  // Give React one tick so sessions state is stable before we read resolvedIdx
  await Promise.resolve();

  if (resolvedIdx === -1) return;

  if (isReplacement) {
    await switchSession(resolvedIdx);
    return;
  }

  setActiveIdxRaw(resolvedIdx);
  setSessionIdRaw(newSession.sessionId);
  setColumnsRaw(newSession.columns || []);
  setSummaryRaw(newSession.summary || null);
  setFileNameRaw(newSession.fileName || "");
  setRowCountRaw(newSession.rowCount || 0);

  if (!newSession.sessionId) return;

  setPreviewLoadingRaw(true);
  try {
    const data = await fetchSessionData(newSession.sessionId);
    const previewRows = data.data || [];
    const previewCols = data.columns || newSession.columns || [];

    setCleanPreviewRaw(previewRows);
    // Update by sessionId — immune to concurrent index shifts
    setSessionsRaw((prev) =>
      prev.map((sess) =>
        sess.sessionId === newSession.sessionId
          ? { ...sess, preview: { columns: previewCols, rows: previewRows } }
          : sess
      )
    );

    if (previewCols.length) setColumnsRaw(previewCols);
  } catch (err) {
    if (err?.code === "SESSION_EXPIRED") {
      markSessionExpired(newSession.sessionId);
    } else {
      console.error("Failed to load preview for new session:", err);
      setCleanPreviewRaw(null);
    }
  } finally {
    setPreviewLoadingRaw(false);
  }
};

  const removeSession = async (idx) => {
  const sessionToRemove = sessions[idx];
  const updated = sessions.filter((_, i) => i !== idx);

  // ── 1. Evict from backend in-memory cache (fire-and-forget) ──────────
  if (sessionToRemove?.sessionId) {
    fetch(`${API_BASE}/session/${sessionToRemove.sessionId}`, { method: "DELETE" })
      .catch(() => {}); // non-blocking — cache will expire anyway
  }

  // ── 2. Delete from Firestore so it doesn't rehydrate on next login ───
  if (sessionToRemove?.sessionId) {
    const currentUser = user; // capture current user ref
    if (currentUser?.uid) {
      deleteDataset(currentUser.uid, sessionToRemove.sessionId)
        .catch((err) => console.error("Failed to delete dataset from Firestore:", err));
    }
  }

  // ── 3. Update local state ─────────────────────────────────────────────
  setSessionsRaw(updated);

  if (updated.length === 0) {
    setActiveIdxRaw(null);
    setSessionIdRaw(null);
    setColumnsRaw([]);
    setSummaryRaw(null);
    setFileNameRaw("");
    setRowCountRaw(0);
    setCleanPreviewRaw(null);
    setModelIdRaw(null);
    setModelMetaRaw(null);
    setTrainResultsRaw(null);
    setTrainConfigRaw({ selectedModel: "rf", targetCol: "", testSize: 0.2 });
    setSavedPlotsRaw([]);
    setSavedReportRaw(null);
    setChatMessagesRaw(null);
    setPredictionResultsRaw(null);
    setPredictionFileNameRaw("");
    resetClean();
    return;
  }

  const newIdx = Math.min(idx, updated.length - 1);
  const s = updated[newIdx];

  setActiveIdxRaw(newIdx);
  setSessionIdRaw(s.sessionId);
  setColumnsRaw(s.columns || []);
  setSummaryRaw(s.summary || null);
  setFileNameRaw(s.fileName || "");
  setRowCountRaw(s.rowCount || 0);

  setModelIdRaw(null);
  setModelMetaRaw(null);
  setTrainResultsRaw(null);
  setTrainConfigRaw({ selectedModel: "rf", targetCol: "", testSize: 0.2 });
  setSavedPlotsRaw([]);
  setSavedReportRaw(null);
  setChatMessagesRaw(null);
  setPredictionResultsRaw(null);
  setPredictionFileNameRaw("");
  resetClean();

  if (!s.sessionId) return;

  setPreviewLoadingRaw(true);
  try {
    const data = await fetchSessionData(s.sessionId);
    const previewRows = data.data || [];
    const previewCols = data.columns || s.columns || [];

    setCleanPreviewRaw(previewRows);
    updateSessionPreview(newIdx, { columns: previewCols, rows: previewRows });

    if (previewCols.length) setColumnsRaw(previewCols);
  } catch (err) {
    if (err?.code === "SESSION_EXPIRED") {
      markSessionExpired(s.sessionId);
    } else {
      console.error(`Failed to load preview for session ${s.sessionId}:`, err);
      setCleanPreviewRaw(null);
    }
  } finally {
    setPreviewLoadingRaw(false);
  }
};

  const reset = () => {
    clearState();
    setSessionIdRaw(null);
    setColumnsRaw([]);
    setSummaryRaw(null);
    setFileNameRaw("");
    setRowCountRaw(0);
    setCleanPreviewRaw(null);
    setPreviewLoadingRaw(false);
    setModelIdRaw(null);
    setModelMetaRaw(null);
    setSessionsRaw([]);
    setActiveIdxRaw(null);
    setTrainResultsRaw(null);
    setTrainConfigRaw({ selectedModel: "rf", targetCol: "", testSize: 0.2 });
    setSavedPlotsRaw([]);
    setSavedReportRaw(null);
    setReportFormatRaw("HTML");
    setReportCheckedRaw(null);
    setChatMessagesRaw(null);
    setPredictionResultsRaw(null);
    setPredictionFileNameRaw("");
    resetClean();
    setGroqKeyRaw("");
    setUserProfileRaw({ displayName: "", email: "", plan: "Pro" });
    setTheme("dark");
    setAccentColor("#6c63ff");
    setProjectsRaw([]);
  };

  // ── Derived: is the currently active session expired? ─────────────────
  // Pages use this alongside sessionId to decide whether to show content
  // or the expired-session prompt. sessionId alone is never cleared on expiry
  // (it stays in context so the UI has the ID available), so pages must check
  // this flag explicitly.
  const activeSessionExpired = activeIdx !== null
    ? (sessions[activeIdx]?.expired === true)
    : false;

  // ── Context Value ──────────────────────────────────────────────────────
  const contextValue = useMemo(() => ({
    user,
    authLoading,
    signup,
    login,
    logout,

    sessionId, setSessionId,
    activeSessionExpired,
    columns, setColumns,
    summary, setSummary,
    fileName, setFileName,
    rowCount, setRowCount,

    cleanPreview, setCleanPreview,
    previewLoading, setPreviewLoading,

    modelId, setModelId,
    modelMeta, setModelMeta,

    sessions, setSessions,
    activeIdx, setActiveIdx,
    switchSession, addSession, removeSession,

    markSessionExpired, 


    trainResults, setTrainResults,
    trainConfig, setTrainConfig,
    savedPlots, setSavedPlots,

    savedReport, setSavedReport,
    reportFormat, setReportFormat,
    reportChecked, setReportChecked,

    chatMessages, setChatMessages,

    predictionResults, setPredictionResults,
    predictionFileName, setPredictionFileName,

    cleanOpLog, setCleanOpLog,
    cleanFillStrategies, setCleanFillStrategies,
    cleanRenameMap, setCleanRenameMap,
    cleanCastMap, setCleanCastMap,
    cleanPromoted, setCleanPromoted,

    groqKey, setGroqKey,
    userProfile, setUserProfile,

    theme, setTheme, toggleTheme,
    accentColor, setAccentColor,

    projects,
    setProjects: setProjectsRaw,

    cleanEncodeMap, setCleanEncodeMap,

    
    reset,
  }), [
    user, authLoading, sessionId, activeSessionExpired, columns, summary, fileName, rowCount,
    cleanPreview, previewLoading, modelId, modelMeta, sessions, activeIdx,
    trainResults, trainConfig, savedPlots, savedReport, reportFormat,
    reportChecked, chatMessages, predictionResults, predictionFileName,
    cleanOpLog, cleanFillStrategies, cleanRenameMap, cleanCastMap,
    cleanEncodeMap, cleanPromoted, groqKey, userProfile, theme, accentColor, projects,
  ]);


function resetWorkspaceState() {
  setSessionIdRaw(null);
  setFileNameRaw("");
  setColumnsRaw([]);
  setSummaryRaw(null);
  setRowCountRaw(0);

  setActiveIdxRaw(null);
  setCleanPreviewRaw(null);
  setPreviewLoadingRaw(false);

  setModelIdRaw(null);
  setModelMetaRaw(null);

  setTrainResultsRaw(null);
  setTrainConfigRaw({ selectedModel: "rf", targetCol: "", testSize: 0.2 });
  setSavedPlotsRaw([]);
  setPredictionResultsRaw(null);
  setPredictionFileNameRaw("");
  setSavedReportRaw(null);
  setReportFormatRaw("HTML");
  setReportCheckedRaw(null);
  setChatMessagesRaw(null);

  setCleanOpLogRaw([]);
  setCleanFillStrategiesRaw({});
  setCleanRenameMapRaw({});
  setCleanCastMapRaw({});
  setCleanEncodeMapRaw({});      // ← Added
  setCleanPromotedRaw(false);
}
 
  
 
  
  

const extendedValue = {
  ...contextValue,
  resetWorkspaceState,
  removeProjectSessions,
};

return (
  <DataPilotContext.Provider value={extendedValue}>
    {children}
  </DataPilotContext.Provider>
);
}

export function useDataPilot() {
  const ctx = useContext(DataPilotContext);
  if (!ctx) throw new Error("useDataPilot must be used within DataPilotProvider");
  return ctx;
}

const isLocalhost =
  typeof window !== "undefined" &&
  window.location.hostname === "localhost";

export const API_BASE = isLocalhost
  ? "http://localhost:8000"
  : "https://datapilot-mz5j.onrender.com";