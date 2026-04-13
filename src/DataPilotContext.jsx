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

// ── Workspace schema ──────────────────────────────────────────────────────────
// All per-dataset analysis state lives in a "workspace" object that is stored
// inside each session slot.  Switching sessions saves the outgoing workspace
// and restores the incoming one — so nothing is ever lost.

const EMPTY_WORKSPACE = {
  modelId:             null,
  modelMeta:           null,
  trainResults:        null,
  trainedModels:       [],   // all trained models for this session [{model_id, model_type, task, metrics, ...}]
  trainConfig:         { selectedModel: "rf", targetCol: "", testSize: 0.2 },
  savedPlots:          [],
  predictionResults:   null,
  predictionFileName:  "",
  savedReport:         null,
  reportFormat:        "HTML",
  reportChecked:       null,
  chatMessages:        null,
  cleanPreview:        null,
  cleanOpLog:          [],
  cleanFillStrategies: {},
  cleanRenameMap:      {},
  cleanCastMap:        {},
  cleanEncodeMap:      {},
  cleanPromoted:       false,
};

const freshWorkspace = () => ({
  ...EMPTY_WORKSPACE,
  trainConfig: { selectedModel: "rf", targetCol: "", testSize: 0.2 },
});

// ── LocalStorage ──────────────────────────────────────────────────────────────

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

// ── Provider ──────────────────────────────────────────────────────────────────

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

  // ── Sessions list + active pointer ────────────────────────────────────
  const [sessions,  setSessionsRaw]  = useState(p?.sessions  || []);
  const [activeIdx, setActiveIdxRaw] = useState(p?.activeIdx ?? null);

  // ── Active session identity ───────────────────────────────────────────
  const [sessionId, setSessionIdRaw] = useState(p?.sessionId || null);
  const [columns,   setColumnsRaw]   = useState(p?.columns   || []);
  const [summary,   setSummaryRaw]   = useState(p?.summary   || null);
  const [fileName,  setFileNameRaw]  = useState(p?.fileName  || "");
  const [rowCount,  setRowCountRaw]  = useState(p?.rowCount  || 0);
  const [totalRowsProcessed, setTotalRowsProcessedRaw] = useState(p?.totalRowsProcessed || 0);

  // ── Active workspace state ────────────────────────────────────────────
  // Restored from the persisted activeWorkspace on initial load.
  const savedWs = p?.activeWorkspace || {};
  const [modelId,             setModelIdRaw]             = useState(savedWs.modelId             ?? null);
  const [modelMeta,           setModelMetaRaw]           = useState(savedWs.modelMeta           ?? null);
  const [trainResults,        setTrainResultsRaw]        = useState(savedWs.trainResults        ?? null);
  const [trainedModels,       setTrainedModelsRaw]       = useState(savedWs.trainedModels       ?? []);
  const [trainConfig,         setTrainConfigRaw]         = useState(savedWs.trainConfig         ?? { selectedModel: "rf", targetCol: "", testSize: 0.2 });
  const [savedPlots,          setSavedPlotsRaw]          = useState(savedWs.savedPlots          ?? []);
  const [predictionResults,   setPredictionResultsRaw]   = useState(savedWs.predictionResults   ?? null);
  const [predictionFileName,  setPredictionFileNameRaw]  = useState(savedWs.predictionFileName  ?? "");
  const [savedReport,         setSavedReportRaw]         = useState(savedWs.savedReport         ?? null);
  const [reportFormat,        setReportFormatRaw]        = useState(savedWs.reportFormat        ?? "HTML");
  const [reportChecked,       setReportCheckedRaw]       = useState(savedWs.reportChecked       ?? null);
  const [chatMessages,        setChatMessagesRaw]        = useState(savedWs.chatMessages        ?? null);
  const [cleanPreview,        setCleanPreviewRaw]        = useState(savedWs.cleanPreview        ?? null);
  const [cleanOpLog,          setCleanOpLogRaw]          = useState(savedWs.cleanOpLog          ?? []);
  const [cleanFillStrategies, setCleanFillStrategiesRaw] = useState(savedWs.cleanFillStrategies ?? {});
  const [cleanRenameMap,      setCleanRenameMapRaw]      = useState(savedWs.cleanRenameMap      ?? {});
  const [cleanCastMap,        setCleanCastMapRaw]        = useState(savedWs.cleanCastMap        ?? {});
  const [cleanEncodeMap,      setCleanEncodeMapRaw]      = useState(savedWs.cleanEncodeMap      ?? {});
  const [cleanPromoted,       setCleanPromotedRaw]       = useState(savedWs.cleanPromoted       ?? false);

  // ── Transient UI ──────────────────────────────────────────────────────
  const [previewLoading, setPreviewLoadingRaw] = useState(false);
  const [groqKey,        setGroqKeyRaw]        = useState(p?.groqKey || "");

  // ── Offline / Network ─────────────────────────────────────────────────
  const [isOffline,          setIsOffline]          = useState(() => !navigator.onLine);
  const [retryingConnection, setRetryingConnection] = useState(false);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);

  useEffect(() => {
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const retryConnection = useCallback(async () => {
    try {
      setRetryingConnection(true);
      await enableNetwork(db);
      setConnectionRetryKey((prev) => prev + 1);
    } catch (error) {
      console.error("Retry failed:", error);
      setIsOffline(true);
    } finally {
      setRetryingConnection(false);
    }
  }, []);

  useEffect(() => {
    if (!isOffline) return;
    const iv = setInterval(() => retryConnection(), 5000);
    return () => clearInterval(iv);
  }, [isOffline, retryConnection]);

  const markOfflineIfFirestoreErr = useCallback((error) => {
    try {
      if (
        error?.code === "unavailable" ||
        error?.code === "failed-precondition" ||
        (error?.message && String(error.message).toLowerCase().includes("offline"))
      ) setIsOffline(true);
    } catch {}
  }, []);

  // ── applyWorkspace ────────────────────────────────────────────────────
  // Writes a workspace object into all live state setters atomically.
  const applyWorkspace = useCallback((ws) => {
    const w = { ...EMPTY_WORKSPACE, ...ws };
    setModelIdRaw(w.modelId);
    setModelMetaRaw(w.modelMeta);
    setTrainResultsRaw(w.trainResults);
    setTrainedModelsRaw(w.trainedModels);
    setTrainConfigRaw(w.trainConfig);
    setSavedPlotsRaw(w.savedPlots);
    setPredictionResultsRaw(w.predictionResults);
    setPredictionFileNameRaw(w.predictionFileName);
    setSavedReportRaw(w.savedReport);
    setReportFormatRaw(w.reportFormat);
    setReportCheckedRaw(w.reportChecked);
    setChatMessagesRaw(w.chatMessages);
    setCleanPreviewRaw(w.cleanPreview);
    setCleanOpLogRaw(w.cleanOpLog);
    setCleanFillStrategiesRaw(w.cleanFillStrategies);
    setCleanRenameMapRaw(w.cleanRenameMap);
    setCleanCastMapRaw(w.cleanCastMap);
    setCleanEncodeMapRaw(w.cleanEncodeMap);
    setCleanPromotedRaw(w.cleanPromoted);
  }, []);

  // ── saveWorkspaceToSession ────────────────────────────────────────────
  // Writes a workspace snapshot into sessions[idx].workspace in-place.
  const saveWorkspaceToSession = useCallback((idx, ws) => {
    if (idx === null || idx === undefined) return;
    setSessionsRaw((prev) => {
      if (!prev[idx]) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], workspace: ws };
      return updated;
    });
  }, []);

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

  // ── resetWorkspaceState (full wipe, used on logout/empty) ─────────────
  const resetWorkspaceState = useCallback(() => {
    setSessionIdRaw(null);
    setFileNameRaw("");
    setColumnsRaw([]);
    setSummaryRaw(null);
    setRowCountRaw(0);
    setActiveIdxRaw(null);
    setPreviewLoadingRaw(false);
    applyWorkspace(freshWorkspace());
  }, [applyWorkspace]);

  // ── markSessionExpired ────────────────────────────────────────────────
  const markSessionExpired = useCallback((sessionIdToExpire) => {
    if (!sessionIdToExpire) return;
    setSessionsRaw((prev) =>
      prev.map((s) =>
        s.sessionId === sessionIdToExpire ? { ...s, expired: true } : s
      )
    );
    if (sessionIdToExpire === sessionId) setCleanPreviewRaw(null);
  }, [sessionId]);

  // ── updateSessionPreview ──────────────────────────────────────────────
  const updateSessionPreview = (idx, previewData) => {
    setSessionsRaw((prev) =>
      prev.map((sess, i) =>
        i === idx
          ? { ...sess, preview: { columns: previewData.columns || sess.columns || [], rows: previewData.rows || [] } }
          : sess
      )
    );
  };

  // ── removeProjectSessions ─────────────────────────────────────────────
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

  // ── Persistence ───────────────────────────────────────────────────────
  // We persist sessions (each containing its workspace) plus a snapshot of
  // the currently-active workspace so a hard refresh restores everything.
  const activeWorkspace = useMemo(() => ({
    modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
    predictionResults, predictionFileName, savedReport, reportFormat,
    reportChecked, chatMessages, cleanPreview, cleanOpLog,
    cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
  }), [
    modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
    predictionResults, predictionFileName, savedReport, reportFormat,
    reportChecked, chatMessages, cleanPreview, cleanOpLog,
    cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
  ]);

  useEffect(() => {
    saveState({
      sessionId, columns, summary, fileName, rowCount, totalRowsProcessed,
      sessions, activeIdx,
      activeWorkspace,
      userProfile, projects, groqKey,
    });
  }, [
    sessionId, columns, summary, fileName, rowCount, totalRowsProcessed,
    sessions, activeIdx, activeWorkspace, userProfile, projects, groqKey,
  ]);

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

          // Build a map of workspaces saved in localStorage so we can merge them back
          const lsSessionsMap = {};
          (p?.sessions || []).forEach((s) => {
            if (s.sessionId) lsSessionsMap[s.sessionId] = s;
          });

          const restoredSessions = datasets.map((d) => {
            const lsSession = lsSessionsMap[d.sessionId || d.id] || {};
            return {
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
              // Merge saved workspace from localStorage
              workspace:     lsSession.workspace || freshWorkspace(),
            };
          });

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

            // If this is the same session that was active when the page was last closed,
            // use the persisted activeWorkspace (more up-to-date); otherwise use the
            // workspace stored inside the session slot.
            const wsToRestore = (p?.sessionId === first.sessionId && p?.activeWorkspace)
              ? p.activeWorkspace
              : (first.workspace || freshWorkspace());
            applyWorkspace(wsToRestore);

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
                  // Only overwrite cleanPreview if the workspace didn't already restore one
                  if (!wsToRestore.cleanPreview) setCleanPreviewRaw(previewRows);
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
            applyWorkspace(freshWorkspace());
          }
        } catch (err) {
          console.error("Failed to restore sessions:", err);
          markOfflineIfFirestoreErr(err);
        }
      } else {
        setProjectsRaw([]);
        setSessionsRaw([]);
        setActiveIdxRaw(null);
        applyWorkspace(freshWorkspace());
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
        firstName, lastName, displayName,
        createdAt: serverTimestamp(),
      });
      setUserProfileRaw((prev) => ({
        ...prev, firstName, lastName, displayName,
        email: cred.user.email || email || "",
      }));
    }
    return cred;
  };

  const login  = async (email, password) => signInUser(email, password);
  const logout = async () => { await signOutUser(); reset(); };

  // ── Session management ────────────────────────────────────────────────

  /**
   * _doSwitch — the single path for all session transitions.
   *
   * 1. Captures the live workspace and writes it back into the outgoing slot.
   * 2. Applies the incoming session's identity and workspace synchronously.
   * 3. Refreshes cleanPreview from the backend (async).
   *
   * Pass outgoingIdx = null when the outgoing session is being deleted
   * (we don't want to save its workspace back).
   */
  const _doSwitch = useCallback(async ({
    nextIdx,
    nextSession,
    outgoingIdx,
    // snapshot of the outgoing workspace — must be passed in as a plain object
    // because React state hasn't flushed yet when this is called
    outgoingWorkspace,
  }) => {
    // 1. Persist outgoing workspace
    if (outgoingIdx !== null && outgoingIdx !== undefined && outgoingWorkspace) {
      saveWorkspaceToSession(outgoingIdx, outgoingWorkspace);
    }

    // 2. Switch identity
    setActiveIdxRaw(nextIdx);
    setSessionIdRaw(nextSession.sessionId);
    setColumnsRaw(nextSession.columns || []);
    setSummaryRaw(nextSession.summary || null);
    setFileNameRaw(nextSession.fileName || "");
    setRowCountRaw(nextSession.rowCount || 0);

    // 3. Restore workspace synchronously — pages will re-render with correct data
    applyWorkspace(nextSession.workspace || freshWorkspace());

    if (!nextSession.sessionId) return;

    // 4. Refresh cleanPreview from backend
    setPreviewLoadingRaw(true);
    try {
      const data = await fetchSessionData(nextSession.sessionId);
      const previewRows = data.data    || [];
      const previewCols = data.columns || nextSession.columns || [];
      setCleanPreviewRaw(previewRows);
      updateSessionPreview(nextIdx, { columns: previewCols, rows: previewRows });
      if (previewCols.length) setColumnsRaw(previewCols);
    } catch (err) {
      if (err?.code === "SESSION_EXPIRED") {
        markSessionExpired(nextSession.sessionId);
      } else {
        console.error(`Failed to load preview for session ${nextSession.sessionId}:`, err);
        markOfflineIfFirestoreErr(err);
        setCleanPreviewRaw(null);
      }
    } finally {
      setPreviewLoadingRaw(false);
    }
  }, [applyWorkspace, saveWorkspaceToSession, markSessionExpired, markOfflineIfFirestoreErr]);

  const switchSession = useCallback(async (idx) => {
    const s = sessions[idx];
    if (!s) return;
    // Capture current workspace before any state changes
    const outgoingWorkspace = {
      modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
      predictionResults, predictionFileName, savedReport, reportFormat,
      reportChecked, chatMessages, cleanPreview, cleanOpLog,
      cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
    };
    await _doSwitch({ nextIdx: idx, nextSession: s, outgoingIdx: activeIdx, outgoingWorkspace });
  }, [
    sessions, activeIdx, _doSwitch,
    modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
    predictionResults, predictionFileName, savedReport, reportFormat,
    reportChecked, chatMessages, cleanPreview, cleanOpLog,
    cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
  ]);

  const addSession = useCallback(async (newSession) => {
    // New uploads always start with a fresh workspace
    const sessionWithWorkspace = { ...newSession, workspace: freshWorkspace() };

    let resolvedIdx = -1;
    let isReplacement = false;

    setSessionsRaw((prev) => {
      const existsAt = prev.findIndex(
        (s) => s.sessionId === newSession.sessionId || s.fileName === newSession.fileName
      );
      if (existsAt !== -1) {
        isReplacement = true;
        resolvedIdx   = existsAt;
        const updated = [...prev];
        // Replace slot but give it a clean workspace — it's a fresh upload
        updated[existsAt] = sessionWithWorkspace;
        return updated;
      }
      const updated = [...prev, sessionWithWorkspace];
      resolvedIdx   = updated.length - 1;
      return updated;
    });

    await Promise.resolve();
    if (resolvedIdx === -1) return;

    // Capture outgoing workspace before switching
    const outgoingWorkspace = {
      modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
      predictionResults, predictionFileName, savedReport, reportFormat,
      reportChecked, chatMessages, cleanPreview, cleanOpLog,
      cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
    };

    // Save outgoing workspace to its slot (not the replacement slot)
    if (activeIdx !== null && !isReplacement) {
      saveWorkspaceToSession(activeIdx, outgoingWorkspace);
    } else if (activeIdx !== null && isReplacement && activeIdx !== resolvedIdx) {
      saveWorkspaceToSession(activeIdx, outgoingWorkspace);
    }

    // Switch identity and apply fresh workspace
    setActiveIdxRaw(resolvedIdx);
    setSessionIdRaw(sessionWithWorkspace.sessionId);
    setColumnsRaw(sessionWithWorkspace.columns || []);
    setSummaryRaw(sessionWithWorkspace.summary || null);
    setFileNameRaw(sessionWithWorkspace.fileName || "");
    setRowCountRaw(sessionWithWorkspace.rowCount || 0);
    applyWorkspace(freshWorkspace());

    if (!sessionWithWorkspace.sessionId) return;

    setPreviewLoadingRaw(true);
    try {
      const data = await fetchSessionData(sessionWithWorkspace.sessionId);
      const previewRows = data.data    || [];
      const previewCols = data.columns || sessionWithWorkspace.columns || [];
      setCleanPreviewRaw(previewRows);
      setSessionsRaw((prev) =>
        prev.map((sess) =>
          sess.sessionId === sessionWithWorkspace.sessionId
            ? { ...sess, preview: { columns: previewCols, rows: previewRows } }
            : sess
        )
      );
      if (previewCols.length) setColumnsRaw(previewCols);
    } catch (err) {
      if (err?.code === "SESSION_EXPIRED") {
        markSessionExpired(sessionWithWorkspace.sessionId);
      } else {
        console.error("Failed to load preview for new session:", err);
        markOfflineIfFirestoreErr(err);
        setCleanPreviewRaw(null);
      }
    } finally {
      setPreviewLoadingRaw(false);
    }
  }, [
    activeIdx, applyWorkspace, saveWorkspaceToSession, markSessionExpired, markOfflineIfFirestoreErr,
    modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
    predictionResults, predictionFileName, savedReport, reportFormat,
    reportChecked, chatMessages, cleanPreview, cleanOpLog,
    cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
  ]);

  const removeSession = useCallback(async (idx) => {
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
      applyWorkspace(freshWorkspace());
      return;
    }

    // Switch to neighbour — no need to save the deleted session's workspace
    const newIdx = Math.min(idx, updated.length - 1);
    await _doSwitch({
      nextIdx: newIdx,
      nextSession: updated[newIdx],
      outgoingIdx: null,        // don't save the deleted session's workspace
      outgoingWorkspace: null,
    });
  }, [sessions, user, applyWorkspace, _doSwitch, markOfflineIfFirestoreErr]);

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
      trainedModels, setTrainedModels: setTrainedModelsRaw,
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
      trainResults, trainConfig, trainedModels, savedPlots, savedReport, reportFormat,
      reportChecked, chatMessages, predictionResults, predictionFileName,
      cleanOpLog, cleanFillStrategies, cleanRenameMap, cleanCastMap,
      cleanEncodeMap, cleanPromoted, groqKey, userProfile, theme, accentColor, projects,
      markSessionExpired, resetWorkspaceState, removeProjectSessions,
      switchSession, addSession, removeSession,
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