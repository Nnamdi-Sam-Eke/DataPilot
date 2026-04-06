// DataPilotContext.jsx

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
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
import { doc, getDoc, serverTimestamp, enableNetwork } from "firebase/firestore";
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

  // ── Theme & Accent ────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });

  const [accentColor, setAccentColor] = useState(
    () => localStorage.getItem("accentColor") || "#6c63ff"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", accentColor);
    localStorage.setItem("theme", theme);
    localStorage.setItem("accentColor", accentColor);
  }, [theme, accentColor]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // ── Auth ──────────────────────────────────────────────────────────────
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [userProfile, setUserProfileRaw] = useState(
    p?.userProfile || { displayName: "", email: "", plan: "Pro" }
  );

  // ── Projects ──────────────────────────────────────────────────────────
  const [projects, setProjectsRaw] = useState(p?.projects || []);

  // ── Session ───────────────────────────────────────────────────────────
  const [sessionId,  setSessionIdRaw]  = useState(p?.sessionId  || null);
  const [columns,    setColumnsRaw]    = useState(p?.columns    || []);
  const [summary,    setSummaryRaw]    = useState(p?.summary    || null);
  const [fileName,   setFileNameRaw]   = useState(p?.fileName   || "");
  const [rowCount,   setRowCountRaw]   = useState(p?.rowCount   || 0);
  const [totalRowsProcessed, setTotalRowsProcessedRaw] = useState(p?.totalRowsProcessed || 0);
  const [sessions,   setSessionsRaw]   = useState(p?.sessions   || []);
  const [activeIdx,  setActiveIdxRaw]  = useState(p?.activeIdx  ?? null);

  // ── Other state ───────────────────────────────────────────────────────
  const [cleanPreview,    setCleanPreviewRaw]    = useState(p?.cleanPreview    || null);
  const [previewLoading,  setPreviewLoadingRaw]  = useState(false);
  // ── Offline / Network state ─────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [retryingConnection, setRetryingConnection] = useState(false);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const retryConnection = useCallback(async () => {
    try {
      setRetryingConnection(true);
      await enableNetwork(db);

      // bump the retry key and let the next Firestore call confirm connectivity
      setConnectionRetryKey((prev) => prev + 1);
    } catch (error) {
      console.error("Retry failed:", error);
      setIsOffline(true);
    } finally {
      setRetryingConnection(false);
    }
  }, []);

  // Auto-retry while offline
  useEffect(() => {
    if (!isOffline) return;

    const iv = setInterval(() => {
      retryConnection();
    }, 5000);

    return () => clearInterval(iv);
  }, [isOffline, retryConnection]);

  const markOfflineIfFirestoreErr = useCallback((error) => {
    try {
      if (
        error?.code === "unavailable" ||
        error?.code === "failed-precondition" ||
        (error?.message && String(error.message).toLowerCase().includes("offline"))
      ) {
        setIsOffline(true);
      }
    } catch {}
  }, []);
  const [modelId,         setModelIdRaw]         = useState(p?.modelId         || null);
  const [modelMeta,       setModelMetaRaw]       = useState(p?.modelMeta       || null);
  const [trainResults,    setTrainResultsRaw]    = useState(p?.trainResults    || null);
  const [trainConfig,     setTrainConfigRaw]     = useState(p?.trainConfig     || { selectedModel: "rf", targetCol: "", testSize: 0.2 });
  const [savedPlots,      setSavedPlotsRaw]      = useState(p?.savedPlots      || []);
  const [predictionResults,   setPredictionResultsRaw]   = useState(p?.predictionResults   || null);
  const [predictionFileName,  setPredictionFileNameRaw]  = useState(p?.predictionFileName  || "");
  const [savedReport,     setSavedReportRaw]     = useState(p?.savedReport     || null);
  const [reportFormat,    setReportFormatRaw]    = useState(p?.reportFormat    || "HTML");
  const [reportChecked,   setReportCheckedRaw]   = useState(p?.reportChecked   || null);
  const [chatMessages,    setChatMessagesRaw]    = useState(p?.chatMessages    || null);
  const [cleanOpLog,          setCleanOpLogRaw]          = useState(p?.cleanOpLog          || []);
  const [cleanFillStrategies, setCleanFillStrategiesRaw] = useState(p?.cleanFillStrategies || {});
  const [cleanRenameMap,      setCleanRenameMapRaw]      = useState(p?.cleanRenameMap      || {});
  const [cleanCastMap,        setCleanCastMapRaw]        = useState(p?.cleanCastMap        || {});
  const [cleanEncodeMap,      setCleanEncodeMapRaw]      = useState(p?.cleanEncodeMap      || {});
  const [cleanPromoted,       setCleanPromotedRaw]       = useState(p?.cleanPromoted       || false);
  const [groqKey,         setGroqKeyRaw]         = useState(p?.groqKey         || "");

  // ── Persistence ───────────────────────────────────────────────────────
  useEffect(() => {
    saveState({
      sessionId, columns, summary, fileName, rowCount,
      totalRowsProcessed,
      modelId, modelMeta, sessions, activeIdx,
      trainResults, trainConfig, savedPlots,
      savedReport, reportFormat, reportChecked,
      chatMessages, predictionResults, predictionFileName,
      cleanOpLog, cleanFillStrategies, cleanRenameMap,
      cleanCastMap, cleanEncodeMap, cleanPromoted,
      userProfile, projects,
    });
  }, [
    sessionId, columns, summary, fileName, rowCount, totalRowsProcessed,
    modelId, modelMeta, sessions, activeIdx,
    trainResults, trainConfig, savedPlots,
    savedReport, reportFormat, reportChecked,
    chatMessages, predictionResults, predictionFileName,
    cleanOpLog, cleanFillStrategies, cleanRenameMap,
    cleanCastMap, cleanEncodeMap, cleanPromoted,
    userProfile, projects,
  ]);

  // ── Internal helpers ──────────────────────────────────────────────────
  const updateSessionPreview = (idx, previewData) => {
    setSessionsRaw((prev) =>
      prev.map((sess, i) =>
        i === idx
          ? {
              ...sess,
              preview: {
                columns: previewData.columns || sess.columns || [],
                rows:    previewData.rows    || [],
              },
            }
          : sess
      )
    );
  };

  // ── resetClean ────────────────────────────────────────────────────────
  const resetClean = useCallback(() => {
    setCleanOpLogRaw([]);
    setCleanFillStrategiesRaw({});
    setCleanRenameMapRaw({});
    setCleanCastMapRaw({});
    setCleanEncodeMapRaw({});
    setCleanPreviewRaw(null);
    setCleanPromotedRaw(false);
  }, []);

  // ── resetWorkspaceState ───────────────────────────────────────────────
  // Defined before any function that calls it.
  const resetWorkspaceState = useCallback(() => {
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
    setCleanEncodeMapRaw({});
    setCleanPromotedRaw(false);
  }, []);

  // ── markSessionExpired ────────────────────────────────────────────────
  const markSessionExpired = useCallback((sessionIdToExpire) => {
    if (!sessionIdToExpire) return;
    setSessionsRaw((prev) =>
      prev.map((s) =>
        s.sessionId === sessionIdToExpire ? { ...s, expired: true } : s
      )
    );
    if (sessionIdToExpire === sessionId) {
      setCleanPreviewRaw(null);
    }
  }, [sessionId]);

  // ── removeProjectSessions ─────────────────────────────────────────────
  // Defined after resetWorkspaceState so the reference is stable.
  const removeProjectSessions = useCallback((projectId) => {
    setSessionsRaw((prev) => {
      const activeSession = activeIdx !== null ? prev[activeIdx] : null;
      const remaining = prev.filter((s) => s.projectId !== projectId);
      const activeWasDeleted = activeSession?.projectId === projectId;

      if (activeWasDeleted) {
        queueMicrotask(() => resetWorkspaceState());
      } else {
        const nextIdx = activeSession
          ? remaining.findIndex((s) => s.sessionId === activeSession.sessionId)
          : null;
        queueMicrotask(() => setActiveIdxRaw(nextIdx === -1 ? null : nextIdx));
      }

      return remaining;
    });
  }, [activeIdx, resetWorkspaceState]);

  // ── Auth listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = observeAuthState(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Load profile
        try {
          const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
          let profileData = { displayName: "", email: firebaseUser.email || "", plan: "Pro" };
          if (userSnap.exists()) {
            const data = userSnap.data();
            profileData = {
              ...profileData,
              displayName: data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
              firstName:   data.firstName || "",
              lastName:    data.lastName  || "",
            };
            // Initialize persisted totalRowsProcessed if present
            const persistedTotal = data?.totalRowsProcessed || data?.total_rows_processed || 0;
            setTotalRowsProcessedRaw(persistedTotal);
          }
          setUserProfileRaw(profileData);
        } catch (err) {
          console.error("Failed to load profile:", err);
          markOfflineIfFirestoreErr(err);
        }

        // Load projects
        try {
          const projectsData = await getUserProjects(firebaseUser.uid);
          setProjectsRaw(projectsData);
        } catch (err) {
          console.error("Failed to load projects:", err);
          markOfflineIfFirestoreErr(err);
        }

        // Restore & validate sessions
        try {
          const datasets = await getUserDatasets(firebaseUser.uid);

          const restoredSessions = datasets.map((d) => ({
            id:            d.id,
            sessionId:     d.sessionId || d.id,
            fileName:      d.fileName      || "",
            fileSize:      d.fileSize      || 0,
            lastModified:  d.lastModified  || 0,
            rowCount:      d.rowCount      || 0,
            columns:       d.columns       || [],
            summary:       d.summary       || null,
            projectId:     d.projectId     || null,
            uploadedAt:    d.uploadedAt    || null,
            expiryMinutes: d.expiryMinutes || 180,
            preview:       null,
          }));

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
              setCleanPreviewRaw(null);
            } else {
              setPreviewLoadingRaw(true);
              try {
                const probeResult = validationResults[idx];
                if (probeResult.status === "fulfilled") {
                  const data = probeResult.value;
                  const previewRows = data.data    || [];
                  const previewCols = data.columns || first.columns || [];
                  setCleanPreviewRaw(previewRows);
                  updateSessionPreview(idx, { columns: previewCols, rows: previewRows });
                  if (previewCols.length) setColumnsRaw(previewCols);
                }
              } catch (err) {
                console.error("Failed to rehydrate first dataset:", err);
                markOfflineIfFirestoreErr(err);
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
          markOfflineIfFirestoreErr(err);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth actions ──────────────────────────────────────────────────────
  const signup = async (email, password, profile = {}) => {
    const cred = await signUpUser(email, password);
    const firstName   = (profile.firstName || "").trim();
    const lastName    = (profile.lastName  || "").trim();
    const displayName = `${firstName} ${lastName}`.trim();
    if (cred?.user) {
      await saveUserProfile(cred.user, {
        firstName,
        lastName,
        displayName,
        createdAt: serverTimestamp(),
      });
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

  const login  = async (email, password) => signInUser(email, password);
  const logout = async () => { await signOutUser(); reset(); };

  // ── Session management ────────────────────────────────────────────────
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
      const previewRows = data.data    || [];
      const previewCols = data.columns || s.columns || [];
      setCleanPreviewRaw(previewRows);
      updateSessionPreview(idx, { columns: previewCols, rows: previewRows });
      if (previewCols.length) setColumnsRaw(previewCols);
    } catch (err) {
      if (err?.code === "SESSION_EXPIRED") {
        markSessionExpired(s.sessionId);
      } else {
        console.error(`Failed to load preview for session ${s.sessionId}:`, err);
        markOfflineIfFirestoreErr(err);
        setCleanPreviewRaw(null);
      }
    } finally {
      setPreviewLoadingRaw(false);
    }
  };

  const addSession = async (newSession) => {
    let resolvedIdx = -1;
    let isReplacement = false;

    setSessionsRaw((prev) => {
      const existsAt = prev.findIndex((s) => s.fileName === newSession.fileName);
      if (existsAt !== -1) {
        isReplacement = true;
        resolvedIdx   = existsAt;
        const updated = [...prev];
        updated[existsAt] = newSession;
        return updated;
      }
      const updated = [...prev, newSession];
      resolvedIdx   = updated.length - 1;
      return updated;
    });

    await Promise.resolve();

    if (resolvedIdx === -1) return;
    if (isReplacement) { await switchSession(resolvedIdx); return; }

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
      const previewRows = data.data    || [];
      const previewCols = data.columns || newSession.columns || [];
      setCleanPreviewRaw(previewRows);
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
        markOfflineIfFirestoreErr(err);
        setCleanPreviewRaw(null);
      }
    } finally {
      setPreviewLoadingRaw(false);
    }
  };

  const removeSession = async (idx) => {
    const sessionToRemove = sessions[idx];
    const updated = sessions.filter((_, i) => i !== idx);

    if (sessionToRemove?.sessionId) {
      fetch(`${API_BASE}/session/${sessionToRemove.sessionId}`, { method: "DELETE" }).catch(() => {});
    }

    if (sessionToRemove?.sessionId && user?.uid) {
      deleteDataset(user.uid, sessionToRemove.sessionId).catch((err) => {
        console.error("Failed to delete dataset from Firestore:", err);
        try { markOfflineIfFirestoreErr(err); } catch {}
      });
    }

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
      const previewRows = data.data    || [];
      const previewCols = data.columns || s.columns || [];
      setCleanPreviewRaw(previewRows);
      updateSessionPreview(newIdx, { columns: previewCols, rows: previewRows });
      if (previewCols.length) setColumnsRaw(previewCols);
    } catch (err) {
      if (err?.code === "SESSION_EXPIRED") {
        markSessionExpired(s.sessionId);
      } else {
        console.error(`Failed to load preview for session ${s.sessionId}:`, err);
        markOfflineIfFirestoreErr(err);
        setCleanPreviewRaw(null);
      }
    } finally {
      setPreviewLoadingRaw(false);
    }
  };

  // ── reset (full sign-out wipe) ────────────────────────────────────────
  const reset = () => {
    clearState();
    resetWorkspaceState();
    setSessionsRaw([]);
    setGroqKeyRaw("");
    setUserProfileRaw({ displayName: "", email: "", plan: "Pro" });
    setTheme("dark");
    setAccentColor("#6c63ff");
    setProjectsRaw([]);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const activeSessionExpired =
    activeIdx !== null ? sessions[activeIdx]?.expired === true : false;

  // ── Context value ─────────────────────────────────────────────────────
  const contextValue = useMemo(
    () => ({
      user, authLoading, signup, login, logout,

      sessionId,     setSessionId:     setSessionIdRaw,
      activeSessionExpired,
      columns,       setColumns:       setColumnsRaw,
      summary,       setSummary:       setSummaryRaw,
      fileName,      setFileName:      setFileNameRaw,
      rowCount,      setRowCount:      setRowCountRaw,

      cleanPreview,  setCleanPreview:  setCleanPreviewRaw,
      previewLoading, setPreviewLoading: setPreviewLoadingRaw,

      modelId,       setModelId:       setModelIdRaw,
      modelMeta,     setModelMeta:     setModelMetaRaw,

      sessions,      setSessions:      setSessionsRaw,
      activeIdx,     setActiveIdx:     setActiveIdxRaw,
      switchSession, addSession, removeSession,

      markSessionExpired,
      resetWorkspaceState,
      removeProjectSessions,

      trainResults,  setTrainResults:  setTrainResultsRaw,
      trainConfig,   setTrainConfig:   setTrainConfigRaw,
      savedPlots,    setSavedPlots:    setSavedPlotsRaw,

      savedReport,   setSavedReport:   setSavedReportRaw,
      reportFormat,  setReportFormat:  setReportFormatRaw,
      reportChecked, setReportChecked: setReportCheckedRaw,

      chatMessages,  setChatMessages:  setChatMessagesRaw,

      totalRowsProcessed, setTotalRowsProcessed: setTotalRowsProcessedRaw,

      predictionResults,  setPredictionResults:  setPredictionResultsRaw,
      predictionFileName, setPredictionFileName: setPredictionFileNameRaw,

      cleanOpLog,          setCleanOpLog:          setCleanOpLogRaw,
      cleanFillStrategies, setCleanFillStrategies: setCleanFillStrategiesRaw,
      cleanRenameMap,      setCleanRenameMap:      setCleanRenameMapRaw,
      cleanCastMap,        setCleanCastMap:        setCleanCastMapRaw,
      cleanEncodeMap,      setCleanEncodeMap:      setCleanEncodeMapRaw,
      cleanPromoted,       setCleanPromoted:       setCleanPromotedRaw,

      groqKey,       setGroqKey:       setGroqKeyRaw,
      userProfile,   setUserProfile:   setUserProfileRaw,

      theme, setTheme, toggleTheme,
      accentColor, setAccentColor,

      projects,
      setProjects: setProjectsRaw,

      // Offline/network state
      isOffline,
      setIsOffline,
      retryConnection,
      retryingConnection,
      connectionRetryKey,

      reset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user, authLoading, sessionId, activeSessionExpired, columns, summary, fileName, rowCount,
      totalRowsProcessed,
      cleanPreview, previewLoading, modelId, modelMeta, sessions, activeIdx,
      trainResults, trainConfig, savedPlots, savedReport, reportFormat,
      reportChecked, chatMessages, predictionResults, predictionFileName,
      cleanOpLog, cleanFillStrategies, cleanRenameMap, cleanCastMap,
      cleanEncodeMap, cleanPromoted, groqKey, userProfile, theme, accentColor, projects,
      markSessionExpired, resetWorkspaceState, removeProjectSessions,
      isOffline, retryingConnection, retryConnection, setIsOffline,
    ]
  );

  return (
    <DataPilotContext.Provider value={contextValue}>
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
  typeof window !== "undefined" && window.location.hostname === "localhost";

export const API_BASE = isLocalhost
  ? "http://localhost:8000"
  : "https://datapilot-mz5j.onrender.com";