// DataPilotContext.jsx

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  saveDataset,
  updateDatasetSessionId,
  updateDatasetOnPromote,
  saveWorkspaceData,
  loadWorkspaceData,
  deleteWorkspaceData,
} from "./services/firestore";
import { doc, getDoc, serverTimestamp, enableNetwork } from "firebase/firestore";
import { db } from "./services/firebase";
import { fetchSessionData } from "./services/data";
import {
  saveModelToCloud,
  restoreModelFromCloud,
} from "./services/workspaceSync";

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

  // ── B2 Restore Progress ───────────────────────────────────────────────
  // Drives the non-dismissible RestoreProgressOverlay on PageDashboard.
  // Set active:true before the parallel restore Promise.all, increment
  // done after each individual restore settles, then flip completed:true.
  const [restoreProgress, setRestoreProgress] = useState({
    active:      false,
    phase:       null,   // "checking" | "restoring"
    total:       0,
    done:        0,
    currentFile: "",
    completed:   false,
  });

  // Prevents auto-save effects from firing during session restore
  const cloudSyncEnabled = useRef(false);

  // ── Offline / Network ─────────────────────────────────────────────────
  const [isOffline,          setIsOffline]          = useState(() => !navigator.onLine);
  const [retryingConnection, setRetryingConnection] = useState(false);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);

  // ── Global API error (visible across all pages)
  const [globalApiError, setGlobalApiError] = useState(null);
  const [globalApiRetryKey, setGlobalApiRetryKey] = useState(0);

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

  const retryGlobalApi = useCallback(() => {
    setGlobalApiError(null);
    setGlobalApiRetryKey((k) => k + 1);
  }, []);

  // NOTE: No auto-retry interval here. The browser `online` event (above)
  // dismisses OfflinePopup in real time. Manual retry via the button calls
  // retryConnection() explicitly — polling was fighting the event listener
  // and causing the popup to flicker or fail to dismiss.

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
    cloudSyncEnabled.current = false;
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

  // ── Cloud workspace auto-save ─────────────────────────────────────────
  // Derives the active Firestore dataset doc ID — used as the workspace key
  const datasetDocId = activeIdx !== null ? (sessions[activeIdx]?.id || null) : null;

  // Small data → Firestore (debounced 2s to avoid hammering on every keystroke)
  useEffect(() => {
    if (!cloudSyncEnabled.current || !user?.uid || !datasetDocId) return;
    const timer = setTimeout(() => {
      saveWorkspaceData(user.uid, datasetDocId, {
        chatMessages,
        cleanOpLog,
        cleanFillStrategies,
        cleanRenameMap,
        cleanCastMap,
        cleanEncodeMap,
        cleanPromoted,
        trainConfig,
        reportFormat,
        predictionFileName,
      }).catch(err => console.warn("Workspace small-data save failed:", err));
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    chatMessages, cleanOpLog, cleanFillStrategies, cleanRenameMap,
    cleanCastMap, cleanEncodeMap, cleanPromoted, trainConfig,
    reportFormat, predictionFileName,
    user?.uid, datasetDocId,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trained models → R2  (fires when a new model is added to trainedModels)
  // Saves each model that doesn't yet have an r2Key
  const prevTrainedModelsLen = useRef(0);
  useEffect(() => {
    if (!cloudSyncEnabled.current || !datasetDocId || !user?.uid) return;
    if (trainedModels.length <= prevTrainedModelsLen.current) return;
    prevTrainedModelsLen.current = trainedModels.length;

    const newestModel = trainedModels[trainedModels.length - 1];
    if (!newestModel?.model_id || newestModel.r2Key) return;

    saveModelToCloud(datasetDocId, newestModel.model_id, API_BASE)
      .then(r2Key => {
        // Attach r2Key to the model entry and persist metadata to Firestore
        const updatedModels = trainedModels.map(m =>
          m.model_id === newestModel.model_id ? { ...m, r2Key } : m
        );
        setTrainedModelsRaw(updatedModels);
        saveWorkspaceData(user.uid, datasetDocId, {
          trainedModelsMetadata: updatedModels.map(({ model_id, model_type, task, metrics, feature_importance, r2Key: rk }) =>
            ({ model_id, model_type, task, metrics, feature_importance, r2Key: rk })
          ),
          activeModelId:     newestModel.model_id,
          activeModelR2Key:  r2Key,
          activeModelMeta:   modelMeta,
          activeTrainResults: trainResults,
        }).catch(() => {});
      })
      .catch(err => console.warn("Model R2 save failed:", err));
  }, [trainedModels.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = observeAuthState(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // ── Show checking overlay immediately on login ─────────────────────
        // Flip the overlay on right now — before any awaits — so the user
        // gets visual feedback within ~2 ms of the auth callback firing.
        setRestoreProgress({
          active:      true,
          phase:       "checking",
          total:       0,
          done:        0,
          currentFile: "",
          completed:   false,
        });

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

        // ── Unblock the UI immediately ─────────────────────────────────────
        // authLoading only needs to guard "are we logged in?" — not "is B2 done?".
        // Releasing it here lets the dashboard render at once while the session
        // restore loop runs behind the RestoreProgressOverlay.
        setAuthLoading(false);

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
              storageKey:    d.storageKey    || null,  // R2 key for cross-device restore
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

          // Overlay is already active (started at auth callback time).
          // If the user has no datasets at all, nothing to check — dismiss cleanly.
          if (restoredSessions.length === 0) {
            setRestoreProgress({ active: false, phase: null, total: 0, done: 0, currentFile: "", completed: false });
            setSessionsRaw([]);
            cloudSyncEnabled.current = true;
            return;
          }

          const validationResults = await Promise.allSettled(
            restoredSessions.map((s) => probeSession(s.sessionId))
          );

          // ── Auto-restore expired sessions from R2 ──────────────────────
          // For each expired session that has a storageKey in Firestore,
          // ask the backend to fetch the file from R2 and recreate the
          // DATA_CACHE session. The frontend just swaps session IDs — no
          // file bytes ever flow through the browser. Works on any device.

          // Count how many sessions actually need a B2 round-trip so we
          // can show an accurate progress overlay rather than guessing.
          const sessionsNeedingRestore = restoredSessions.filter((s, i) => {
            const r = validationResults[i];
            return (
              r.status === "rejected" &&
              r.reason?.code === "SESSION_EXPIRED" &&
              s.storageKey &&
              s.id &&
              firebaseUser?.uid
            );
          });

          if (sessionsNeedingRestore.length > 0) {
            // Transition from "checking" → "restoring" with known total
            setRestoreProgress({
              active:      true,
              phase:       "restoring",
              total:       sessionsNeedingRestore.length,
              done:        0,
              currentFile: sessionsNeedingRestore[0]?.fileName || "",
              completed:   false,
            });
          } else if (restoredSessions.length > 0) {
            // All sessions were alive — nothing to restore, dismiss immediately
            setRestoreProgress({
              active:      false,
              phase:       null,
              total:       restoredSessions.length,
              done:        restoredSessions.length,
              currentFile: "",
              completed:   true,
            });
          }

          const finalSessions = await Promise.all(
            restoredSessions.map(async (s, i) => {
              const result    = validationResults[i];
              const isExpired =
                result.status === "rejected" &&
                result.reason?.code === "SESSION_EXPIRED";

              // Session is alive — use probe result as-is
              if (!isExpired) return s;

              const { storageKey, id: datasetDocId } = s;

              if (!storageKey || !datasetDocId || !firebaseUser?.uid) {
                // No R2 file available — user must re-upload manually
                // Still count this as "processed" so the bar moves
                setRestoreProgress((prev) => {
                  const nextDone = prev.done + 1;
                  const nextFile = sessionsNeedingRestore[nextDone]?.fileName || "";
                  return prev.active
                    ? { ...prev, done: nextDone, currentFile: nextFile }
                    : prev;
                });
                return { ...s, expired: true };
              }

              try {
                // Single backend call — R2 fetch + session creation happens server-side
                const plan = "pro"; // beta users all get pro
                const res  = await fetch(`${API_BASE}/session/restore`, {
                  method:  "POST",
                  headers: { "Content-Type": "application/json" },
                  body:    JSON.stringify({ storage_key: storageKey, plan }),
                });

                if (!res.ok) throw new Error("Restore endpoint failed");

                const data = await res.json();
                if (data.error || data.detail) throw new Error(data.error || data.detail);

                const newSessionId = data.session_id;

                // Patch Firestore so the next login has the current session_id
                await updateDatasetSessionId(
                  firebaseUser.uid,
                  datasetDocId,
                  newSessionId
                );

                // ✅ One file done — advance the progress bar
                setRestoreProgress((prev) => {
                  const nextDone = prev.done + 1;
                  const nextFile = sessionsNeedingRestore[nextDone]?.fileName || "";
                  return prev.active
                    ? { ...prev, done: nextDone, currentFile: nextFile }
                    : prev;
                });

                return {
                  ...s,
                  sessionId:     newSessionId,
                  rowCount:      data.row_count      || s.rowCount,
                  columns:       data.columns        || s.columns,
                  summary:       data.summary        || s.summary,
                  uploadedAt:    data.uploaded_at    || new Date().toISOString(),
                  expiryMinutes: data.expiry_minutes || s.expiryMinutes,
                  expired:       false,
                  preview:       null,
                };
              } catch (restoreErr) {
                console.warn(`Auto-restore failed for "${s.fileName}":`, restoreErr);
                // Count failures too so bar always reaches 100%
                setRestoreProgress((prev) => {
                  const nextDone = prev.done + 1;
                  const nextFile = sessionsNeedingRestore[nextDone]?.fileName || "";
                  return prev.active
                    ? { ...prev, done: nextDone, currentFile: nextFile }
                    : prev;
                });
                return { ...s, expired: true };
              }
            })
          );

          // ── All restores done — flip to success state ──────────────────
          if (sessionsNeedingRestore.length > 0) {
            // done is guaranteed to equal total at this point (every branch increments)
            setRestoreProgress({
              active:      false,
              phase:       null,
              total:       0,
              done:        0,
              currentFile: "",
              completed:   true,
            });
          }

          // Sessions we couldn't restore stay out of the active list
          const liveSessions = finalSessions.filter((s) => !s.expired);

          setSessionsRaw(liveSessions);

          if (liveSessions.length > 0) {
            const first = liveSessions[0];
            const idx = 0;

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

            // ── Cloud workspace restore (non-blocking) ────────────────────
            // Runs in background after local workspace is already applied.
            // Fills in anything localStorage doesn't have (new device, cleared storage).
            if (first.id && firebaseUser?.uid) {
              (async () => {
                try {
                  const cloudData = await loadWorkspaceData(firebaseUser.uid, first.id);
                  if (!cloudData) return;

                  // Merge rule: local value wins if present, cloud fills in nulls
                  const merge = (local, cloud) => (local != null && local !== "" && !(Array.isArray(local) && !local.length) ? local : cloud);

                  const merged = {
                    modelId:             wsToRestore.modelId             ?? cloudData.activeModelId   ?? null,
                    modelMeta:           wsToRestore.modelMeta           ?? cloudData.activeModelMeta ?? null,
                    trainResults:        wsToRestore.trainResults        ?? cloudData.activeTrainResults ?? null,
                    trainedModels:       merge(wsToRestore.trainedModels, cloudData.trainedModelsMetadata || []),
                    trainConfig:         merge(wsToRestore.trainConfig,   cloudData.trainConfig)        ?? { selectedModel: "rf", targetCol: "", testSize: 0.2 },
                    savedPlots:          wsToRestore.savedPlots          ?? [],
                    predictionResults:   wsToRestore.predictionResults   ?? null,
                    predictionFileName:  merge(wsToRestore.predictionFileName, cloudData.predictionFileName || ""),
                    savedReport:         wsToRestore.savedReport         ?? null,
                    reportFormat:        merge(wsToRestore.reportFormat,  cloudData.reportFormat || "HTML"),
                    reportChecked:       wsToRestore.reportChecked       ?? cloudData.reportChecked ?? null,
                    chatMessages:        merge(wsToRestore.chatMessages,  cloudData.chatMessages),
                    cleanPreview:        wsToRestore.cleanPreview        ?? null,
                    cleanOpLog:          merge(wsToRestore.cleanOpLog,    cloudData.cleanOpLog        || []),
                    cleanFillStrategies: merge(wsToRestore.cleanFillStrategies, cloudData.cleanFillStrategies || {}),
                    cleanRenameMap:      merge(wsToRestore.cleanRenameMap,      cloudData.cleanRenameMap      || {}),
                    cleanCastMap:        merge(wsToRestore.cleanCastMap,        cloudData.cleanCastMap        || {}),
                    cleanEncodeMap:      merge(wsToRestore.cleanEncodeMap,      cloudData.cleanEncodeMap      || {}),
                    cleanPromoted:       wsToRestore.cleanPromoted       ?? cloudData.cleanPromoted ?? false,
                  };
                  applyWorkspace(merged);

                  // Models: restore each trained model back into backend MODEL_STORE
                  if (cloudData.trainedModelsMetadata?.length) {
                    const restoredModels = await Promise.all(
                      cloudData.trainedModelsMetadata.map(async (m) => {
                        if (!m.r2Key) return m;
                        try {
                          const restored = await restoreModelFromCloud(m.r2Key, API_BASE);
                          return { ...m, model_id: restored.model_id, metrics: restored.metrics, feature_importance: restored.feature_importance };
                        } catch { return m; }
                      })
                    );
                    setTrainedModelsRaw(restoredModels);
                    // Set active model to the first successfully restored one
                    const activeModel = restoredModels.find(m => m.model_id && m.r2Key === cloudData.activeModelR2Key) || restoredModels.find(m => m.model_id);
                    if (activeModel?.model_id) {
                      setModelIdRaw(activeModel.model_id);
                      setModelMetaRaw({ type: activeModel.model_type, task: activeModel.task, metrics: activeModel.metrics, featureImportance: activeModel.feature_importance });
                    }
                  }

                } catch (err) {
                  console.warn("Cloud workspace restore failed (non-fatal):", err);
                } finally {
                  // Enable auto-save now that restore is fully complete
                  cloudSyncEnabled.current = true;
                }
              })();
            } else {
              cloudSyncEnabled.current = true;
            }

            if (first.expired) {
              setCleanPreviewRaw(null);
            } else {
              setPreviewLoadingRaw(true);
              try {
                // Find the original index in restoredSessions to get the correct probe result
                const origIdx = restoredSessions.findIndex((s) => s.sessionId === first.sessionId);
                const probeResult = origIdx !== -1 ? validationResults[origIdx] : undefined;
                if (probeResult?.status === "fulfilled") {
                  const data = probeResult.value;
                  const previewRows = data.data    || [];
                  const previewCols = data.columns || first.columns || [];
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
        setAuthLoading(false);  // not logged in — release immediately
      }
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

  const addSession = useCallback(async (newSession, options = {}) => {
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
      // Retry fetching the session a few times to handle transient
      // timing issues where the backend's in-memory cache isn't visible
      // immediately after create (edge cases with dev servers/processes).
      const maxAttempts = 5;
      let attempt = 0;
      let data = null;
      while (attempt < maxAttempts) {
        try {
          data = await fetchSessionData(sessionWithWorkspace.sessionId);
          break;
        } catch (err) {
          attempt += 1;
          if (attempt >= maxAttempts) throw err;
          // If session not found, wait briefly and retry
          await new Promise((res) => setTimeout(res, 200));
        }
      }

      const previewRows = data?.data || [];
      const previewCols = data?.columns || sessionWithWorkspace.columns || [];
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

    // Optionally persist the session to Firestore (used by promotion)
    if (options?.persist && user?.uid) {
      try {
        await saveDataset(user.uid, {
          fileName: sessionWithWorkspace.fileName,
          fileSize: sessionWithWorkspace.fileSize || 0,
          lastModified: sessionWithWorkspace.lastModified || 0,
          rowCount: sessionWithWorkspace.rowCount || 0,
          columns: sessionWithWorkspace.columns || [],
          summary: sessionWithWorkspace.summary || null,
          sessionId: sessionWithWorkspace.sessionId,
        }, sessionWithWorkspace.projectId || null);
      } catch (err) {
        console.error("Failed to persist promoted session to Firestore:", err);
      }
    }
  }, [
    activeIdx, applyWorkspace, saveWorkspaceToSession, markSessionExpired, markOfflineIfFirestoreErr,
    modelId, modelMeta, trainResults, trainedModels, trainConfig, savedPlots,
    predictionResults, predictionFileName, savedReport, reportFormat,
    reportChecked, chatMessages, cleanPreview, cleanOpLog,
    cleanFillStrategies, cleanRenameMap, cleanCastMap, cleanEncodeMap, cleanPromoted,
  ]);

  // NEW: Promote cleaned data + remove original (Simplified & Fixed)
const promoteCleanedSession = useCallback(async (oldSessionId, promoteResponse) => {
  if (!promoteResponse?.new_session_id) {
    console.error("Invalid promote response");
    return;
  }

  const newSessionId = promoteResponse.new_session_id;

  // 1. Find the original session
  const originalIdx = sessions.findIndex((s) => s.sessionId === oldSessionId);
  if (originalIdx === -1) return;
  const originalSession = sessions[originalIdx];
  const originalDocId = originalSession?.id || null;
  const originalStorageKey = originalSession?.storageKey || null;

  // --- NEW STEP: GET THE KEY BEFORE UPDATING STATE ---
  // We perform the Snapshot FIRST. This way, the UI never sees a 'null' or 'stale' key.
  let newStorageKey = null;
  try {
    const snapRes = await fetch(`${API_BASE}/session/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
  session_id:     newSessionId,
  file_name:      promoteResponse.fileName || `cleaned_${newSessionId.slice(0, 8)}`,
  dataset_doc_id: originalDocId || "",
  uid:            user?.uid     || "",
}),
    });
    if (snapRes.ok) {
      const snapData = await snapRes.json();
      newStorageKey = snapData.storage_key;
      console.log(`✅ Cleaned snapshot stored: ${newStorageKey}`);
    }
  } catch (snapErr) {
    console.error("⚠️ Snapshot failed — Firestore will use original key. Cross-device restore may load uncleaned data.", snapErr);
  }

  // 2 & 3. UPDATE ALL STATE ATOMICALLY
  // Now we update everything. When effects trigger, they see the NEW ID + NEW KEY.
  setSessionsRaw((prev) => {
    const idx = prev.findIndex((s) => s.sessionId === oldSessionId);
    if (idx === -1) return prev;
    
    const out = [...prev];
    out[idx] = {
      ...prev[idx],
      sessionId: newSessionId,
      // We use the new key immediately so there is no 'null' window
      storageKey: newStorageKey || originalStorageKey, 
      fileName: promoteResponse.fileName || prev[idx].fileName,
      rowCount: promoteResponse.row_count || prev[idx].rowCount,
      columns: promoteResponse.columns || prev[idx].columns,
      summary: promoteResponse.summary || prev[idx].summary,
      preview: null,
      uploadedAt: new Date().toISOString(),
      workspace: freshWorkspace(),
    };
    return out;
  });

  setActiveIdxRaw(originalIdx);
  setSessionIdRaw(newSessionId);
  setFileNameRaw(promoteResponse.fileName || originalSession?.fileName || "Cleaned Dataset");

  // 4. Update Firestore — patch the existing doc with the new sessionId + new CSV storageKey.
  //    This is what makes restore work after promote: Firestore must point at the
  //    new _cleaned.csv in B2, not the original file that gets deleted in step 5.
  //
  //    originalDocId comes from session.id stamped at upload time. It can be null if
  //    the session was created before this field was added, or if addSession ran before
  //    the Firestore write returned. In that case we fall back to a live query by
  //    sessionId so the update never silently skips.
  if (user?.uid) {
    try {
      let docIdToUpdate = originalDocId;

      if (!docIdToUpdate) {
        // Fallback: find the doc by matching the old sessionId
        const allDatasets = await getUserDatasets(user.uid);
        const match = allDatasets.find((d) => d.sessionId === oldSessionId);
        docIdToUpdate = match?.id || null;
        if (docIdToUpdate) {
          console.log(`🔍 Resolved Firestore docId via sessionId fallback: ${docIdToUpdate}`);
        }
      }

      if (docIdToUpdate) {
  const summaryForFirestore = { ...(promoteResponse.summary || {}) };
  delete summaryForFirestore.__meta__;

  await updateDatasetOnPromote(user.uid, docIdToUpdate, {
    fileName:   promoteResponse.fileName,
    rowCount:   promoteResponse.row_count  || 0,
    columns:    promoteResponse.columns    || [],
    summary:    summaryForFirestore,
    sessionId:  newSessionId,
    storageKey: newStorageKey || originalStorageKey,
  });
        console.log(`✅ Firestore doc ${docIdToUpdate} updated → session ${newSessionId}, key ${newStorageKey}`);
      } else {
        console.warn("⚠️ Could not resolve Firestore docId for promote — storageKey not updated");
      }
    } catch (err) {
      console.warn("Firestore update failed:", err);
    }
  }

  // 5. Cleanup the old file (Safe to do now because state and Firestore are updated)
  if (newStorageKey && originalStorageKey && newStorageKey !== originalStorageKey) {
    fetch(`${API_BASE}/file/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_key: originalStorageKey }),
    }).catch((e) => console.warn("Cleanup failed:", e));
  }

    // 5. Fetch preview data for the cleaned session (with retries for transient 404s)
    try {
      const maxAttempts = 5;
      let attempt = 0;
      let data = null;
      while (attempt < maxAttempts) {
        try {
          data = await fetchSessionData(newSessionId);
          break;
        } catch (err) {
          attempt += 1;
          if (attempt >= maxAttempts) throw err;
          // If session not found, wait briefly and retry
          await new Promise((res) => setTimeout(res, 200));
        }
      }

      const previewRows = data?.data || [];
      const previewCols = data?.columns || promoteResponse.columns || [];
      setCleanPreviewRaw(previewRows);
      setSessionsRaw((prev) =>
        prev.map((sess) =>
          sess.sessionId === newSessionId
            ? { ...sess, preview: { columns: previewCols, rows: previewRows } }
            : sess
        )
      );
    } catch (err) {
      console.warn("Failed to load preview for promoted session:", err);
    }

    console.log(`✅ Promoted and replaced ${oldSessionId} → ${newSessionId}`);
  }, [sessions, user?.uid]);

  const removeSession = useCallback(async (idx) => {
    const sessionToRemove = sessions[idx];
    const updated = sessions.filter((_, i) => i !== idx);

    if (sessionToRemove?.sessionId) {
      fetch(`${API_BASE}/session/${sessionToRemove.sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    // Delete the file from B2 so storage doesn't accumulate orphaned files
    if (sessionToRemove?.storageKey) {
      fetch(`${API_BASE}/file/delete`, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ storage_key: sessionToRemove.storageKey }),
      }).catch(() => {});
    }
    if (sessionToRemove?.sessionId && user?.uid) {
      deleteDataset(user.uid, sessionToRemove.id, sessionToRemove.projectId || null).catch((err) => {
        console.error("Failed to delete dataset from Firestore:", err);
        try { markOfflineIfFirestoreErr(err); } catch {}
      });
      // Delete cloud workspace data for this session
      if (sessionToRemove.id) {
        deleteWorkspaceData(user.uid, sessionToRemove.id).catch(() => {});
      }
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
      promoteCleanedSession,

      groqKey,       setGroqKey:       setGroqKeyRaw,
      userProfile,   setUserProfile:   setUserProfileRaw,

      datasetDocId,

      theme, setTheme, toggleTheme,
      accentColor, setAccentColor,

      projects,
      setProjects: setProjectsRaw,

      isOffline,
      setIsOffline,
      retryConnection,
      retryingConnection,
      connectionRetryKey,

      // Global API error helpers
      globalApiError,
      setGlobalApiError,
      globalApiRetryKey,
      retryGlobalApi,

      restoreProgress,

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
      promoteCleanedSession,
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