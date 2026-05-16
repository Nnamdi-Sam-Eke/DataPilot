import { useState, useRef, useEffect } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";
import { saveDataset, findExistingDataset } from "../services/firestore";
import { logActivity } from "../services/dashboard";

// ── per-session expiry label hook ─────────────────────────────────────────
function useSessionExpiryLabels(sessions) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  return sessions.map((s) => {
    if (s.expired || !s.uploadedAt) return null;
    const expiryMinutes = s.expiryMinutes || 180;
    const expiresMs = new Date(s.uploadedAt).getTime() + expiryMinutes * 60 * 1000;
    const mins = Math.floor((expiresMs - Date.now()) / 60000);
    if (mins <= 0) return null;
    if (mins < 60) return { label: `${mins}m left`, urgent: mins <= 10, warning: mins <= 30 };
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return { label: rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`, urgent: false, warning: false };
  });
}

export default function PageUpload({ setPage }) {
  const {
    user,
    userProfile,
    sessions,
    addSession,
    removeSession,
    switchSession,
    activeIdx,
    fileName,
    setTotalRowsProcessed,
  } = useDataPilot();

  // ── Project Context Handling ─────────────────────────────────────
  // Capture the project context ONCE on mount using a ref so that
  // subsequent re-renders (e.g. after upload) don't re-read stale or
  // already-cleared localStorage keys and flip the context mid-session.
  const projectContextRef = useRef(null);
  if (projectContextRef.current === null) {
    const fromDashboard = !!localStorage.getItem("dp_current_project_id_from_dashboard");
    projectContextRef.current = {
      isFromSidebar: !fromDashboard,
      projectId:   fromDashboard ? localStorage.getItem("dp_current_project_id")   : null,
      projectName: fromDashboard ? localStorage.getItem("dp_current_project_name") : null,
    };
  }
  const { isFromSidebar, projectId: currentProjectId, projectName: currentProjectName }
    = projectContextRef.current;

  // Clear any lingering project context when opening Upload from sidebar.
  // Run once on mount only — dependency array is intentionally empty.
  useEffect(() => {
    if (isFromSidebar) {
      localStorage.removeItem("dp_current_project_id");
      localStorage.removeItem("dp_current_project_name");
      localStorage.removeItem("dp_current_project_id_from_dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session visibility: Show ALL sessions when no project context
  const visibleSessions = currentProjectId
    ? sessions.filter((s) => s.projectId === currentProjectId)
    : sessions;   // ← This now correctly shows everything when no project is active
  // When entering a project context, auto-activate the first session that
  // belongs to that project (if the current active session is from a different project).
  useEffect(() => {
    if (!currentProjectId) return;
    const activeSession = activeIdx !== null ? sessions[activeIdx] : null;
    if (activeSession?.projectId === currentProjectId) return; // already correct

    const projectSessionIdx = sessions.findIndex((s) => s.projectId === currentProjectId);
    if (projectSessionIdx !== -1) switchSession(projectSessionIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState({}); // { name: pct }
  const [errors, setErrors] = useState({}); // { name: msg }
  const [showUpload, setShowUpload] = useState(false);
  const [fading, setFading] = useState(false);
  const fileInputRef = useRef(null);

  const uploadFile = async (file) => {
    const name = file.name;

    // Skip if already open in current workspace session (same project scope)
    if (
      sessions.find(
        (s) =>
          s.fileName === file.name &&
          s.fileSize === file.size &&
          s.lastModified === file.lastModified &&
          (s.projectId ?? null) === (currentProjectId ?? null)
      )
    ) {
      setErrors((prev) => ({
        ...prev,
        [name]: "This file is already open in your workspace.",
      }));
      return;
    }

    // Skip if already saved in Firestore (now respects project)
    if (user?.uid) {
      try {
        const existing = await findExistingDataset(user.uid, file, currentProjectId);
        if (existing) {
          setErrors((prev) => ({
            ...prev,
            [name]: "This file already exists in your workspace.",
          }));
          return;
        }
      } catch (err) {
        console.error("Failed to check duplicate dataset:", err);
      }
    }

    // Start upload UI
    setUploading((p) => ({ ...p, [name]: 0 }));
    setErrors((e) => {
      const n = { ...e };
      delete n[name];
      return n;
    });

    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18;
      if (p >= 90) {
        p = 90;
        clearInterval(iv);
      }
      setUploading((prev) => ({ ...prev, [name]: Math.min(p, 90) }));
    }, 100);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const plan = (userProfile?.plan || "free").toLowerCase();

      const res = await fetch(`${API_BASE}/upload?plan=${plan}`, {
        method: "POST",
        body: fd,
      });

      clearInterval(iv);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Upload complete
      setUploading((prev) => ({ ...prev, [name]: 100 }));

      setTimeout(() => {
        setUploading((prev) => {
          const n = { ...prev };
          delete n[name];
          return n;
        });
      }, 800);

      // ... inside uploadFile try block, after the fetch and data processing ...

// 1. Prepare base data for Firestore
let firestoreDocId = null;
if (user?.uid) {
  try {
    // Capture the ID returned from saveDataset
    firestoreDocId = await saveDataset(user.uid, {
      fileName: data.file_name || name,
      fileSize: file.size,
      lastModified: file.lastModified,
      rowCount: data.row_count || 0,
      columns: data.columns || [],
      summary: data.summary || null,
      sessionId: data.session_id,
      storageKey: data.storage_key || null,
    }, currentProjectId);
  } catch (err) {
    console.error("Failed to save dataset to Firestore:", err);
  }
}

// 2. Create the session payload including the new ID
const sessionPayload = {
  id: firestoreDocId,                    // ← Now attached from Firestore
  sessionId: data.session_id,
  fileName: data.file_name || name,
  fileSize: file.size,
  lastModified: file.lastModified,
  rowCount: data.row_count || 0,
  columns: data.columns || [],
  summary: data.summary || null,
  storageKey: data.storage_key || null,
  projectId: currentProjectId || null,
  uploadedAt: data.uploaded_at || new Date().toISOString(),
  expiryMinutes: data.expiry_minutes || 180,
  preview:
    data.sample && data.columns
      ? { columns: data.columns, rows: data.sample }
      : null,
};

// 3. Add to local state
addSession(sessionPayload);

// 4. Update global stats and log activity
if (typeof setTotalRowsProcessed === "function" && typeof data.total_rows_processed !== "undefined") {
  setTotalRowsProcessed(data.total_rows_processed || 0);
}

if (user?.uid) {
  logActivity(user.uid, {
    action: "Dataset uploaded",
    detail: `${sessionPayload.fileName} · ${sessionPayload.rowCount.toLocaleString()} rows`,
    color: "var(--accent2)",
  });
}
    } catch (e) {
      clearInterval(iv);
      setUploading((prev) => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
      setErrors((prev) => ({
        ...prev,
        [name]: e.message,
      }));
    }
  };


  const handleFiles = (files) => {
    Array.from(files).forEach(uploadFile);
  };

  const activeSession = activeIdx !== null ? sessions[activeIdx] : null;
  const expiryLabels = useSessionExpiryLabels(sessions);

  // Expired session handler
  const handleReupload = () => {
    setFading(true);
    setTimeout(() => setShowUpload(true), 350);
  };

  if (activeSession?.expired && !showUpload) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 420,
          gap: 16,
          opacity: fading ? 0 : 1,
          transition: "opacity 0.35s ease",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
            Session expired
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)", maxWidth: 320, lineHeight: 1.6 }}>
            This dataset is no longer active on the server.
            Re-upload the file to continue working with it.
          </div>
        </div>

        <button className="btn-primary" style={{ marginTop: 4, gap: 8 }} onClick={handleReupload}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={Icons.upload} />
          </svg>
          Re-upload Dataset
        </button>
      </div>
    );
  }

  return (
    <div
      className="page-enter"
      style={{
        animation: showUpload ? "fadeIn 0.4s ease" : undefined,
      }}
    >
      <div className="page-header">
  <div className="page-title">Upload Dataset</div>
  <div className="page-subtitle">
    Upload one or more CSV, XLSX or JSON files. Switch between them anytime.
    {currentProjectName && (
      <span style={{ marginLeft: 8, color: "var(--accent2)" }}>
        · Project: {currentProjectName}
      </span>
    )}
  </div>
</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
          minWidth: 0,
        }}
      >
        {/* Left Column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Drop Zone */}
          <div
            className={`upload-zone ${dragging ? "drag" : ""}`}
            style={{ width: "100%", boxSizing: "border-box", overflow: "hidden" }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "var(--accent-dim)",
                border: "1px solid rgba(108,99,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent2)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={Icons.upload} />
              </svg>
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text)",
                marginBottom: 6,
                textAlign: "center",
                wordBreak: "break-word",
                maxWidth: "100%",
              }}
            >
              {dragging ? "Drop files here" : "Drag & drop or click to browse"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", maxWidth: "100%" }}>
              CSV, XLSX, JSON · Multiple files supported
            </div>
          </div>

          {/* Upload Progress */}
          {Object.entries(uploading).map(([name, pct]) => (
            <div key={name} className="card">
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text2)",
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "75%",
                  }}
                >
                  {name}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--accent2)", flexShrink: 0 }}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct === 100
                        ? "linear-gradient(90deg, var(--green), #6ee7b7)"
                        : "linear-gradient(90deg, var(--accent), var(--accent2))",
                  }}
                />
              </div>
            </div>
          ))}

          {/* Errors */}
          {Object.entries(errors).map(([name, msg]) => (
            <div
              key={name}
              style={{
                padding: "10px 14px",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--red)",
              }}
            >
              <strong>{name}:</strong> {msg}
            </div>
          ))}

          {/* Uploaded Files List */}
          {visibleSessions.length > 0 && (
            <div className="card">
              <div className="card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2">
                  <path d={Icons.layers} />
                </svg>
                {currentProjectId ? "Project Files" : "Uploaded Files"}
                <span className="tag tag-blue" style={{ marginLeft: "auto" }}>
                  {visibleSessions.length} file{visibleSessions.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {visibleSessions.map((s) => {
                  // Always resolve the real index in the full sessions array
                  const realIdx = sessions.findIndex((x) => x.sessionId === s.sessionId);
                  const isActive = activeIdx === realIdx;

                  return (
                    <div
                      key={s.sessionId}
                      onClick={() => !s.expired && switchSession(realIdx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 9,
                        background: isActive ? "var(--accent-dim)" : "var(--bg3)",
                        border: `1px solid ${
                          s.expired
                            ? "rgba(248,113,113,0.3)"
                            : isActive
                            ? "rgba(108,99,255,0.3)"
                            : "var(--border)"
                        }`,
                        cursor: s.expired ? "default" : "pointer",
                        transition: "all 0.15s",
                        opacity: s.expired ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: s.expired
                            ? "var(--red)"
                            : isActive
                            ? "var(--accent2)"
                            : "var(--green)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: "var(--text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.fileName}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "var(--text3)",
                            fontFamily: "'DM Mono', monospace",
                            marginTop: 1,
                          }}
                        >
                          {s.rowCount?.toLocaleString()} rows · {s.columns?.length} cols
                        </div>
                      </div>

                      {/* Status / expiry tag */}
                      {(() => {
                        if (s.expired) return <span className="tag tag-red">Expired</span>;
                        const expiry = expiryLabels[realIdx];
                        if (expiry?.urgent) return (
                          <span className="tag tag-red" style={{ fontFamily: "'DM Mono', monospace" }}>
                            ⏳ {expiry.label}
                          </span>
                        );
                        if (expiry?.warning) return (
                          <span className="tag" style={{
                            background: "rgba(255,165,0,0.12)",
                            color: "#ffa040",
                            border: "1px solid rgba(255,165,0,0.3)",
                            fontFamily: "'DM Mono', monospace",
                          }}>
                            ⏳ {expiry.label}
                          </span>
                        );
                        if (isActive) return <span className="tag tag-blue">Active</span>;
                        if (expiry) return (
                          <span style={{
                            fontSize: 10,
                            color: "var(--text3)",
                            fontFamily: "'DM Mono', monospace",
                          }}>
                            {expiry.label}
                          </span>
                        );
                        return <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Click to switch</span>;
                      })()}

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await removeSession(realIdx);
                          if (user?.uid) {
                            const deleted = sessions[realIdx];
                            if (deleted) {
                              logActivity(user.uid, {
                                action: "Dataset deleted",
                                detail: deleted.fileName || "Untitled dataset",
                                color: "var(--red)",
                              });
                            }
                          }
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text3)",
                          fontSize: 18,
                          padding: "0 2px",
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              {visibleSessions.length > 1 && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "var(--bg3)",
                    borderRadius: 7,
                    fontSize: 11,
                    color: "var(--text3)",
                  }}
                >
                  {currentProjectId
                    ? `💡 Showing files for "${currentProjectName}". Switch files to change the active dataset.`
                    : "💡 Switching files updates all pages instantly. Files persist across navigation."}
                </div>
              )}
            </div>
          )}

          {/* CTA Button */}
          {visibleSessions.length > 0 && (
            <button
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setPage("/overview")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={Icons.chart} />
              </svg>
              Analyse {activeSession?.fileName || fileName} →
            </button>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {/* File Preview */}
          <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2">
                <path d={Icons.eye} />
              </svg>
              File Preview
              {activeSession?.preview && (
                <span className="tag tag-green" style={{ marginLeft: "auto" }}>
                  Live
                </span>
              )}
            </div>

            {activeSession?.preview ? (
              <div style={{ overflow: "hidden", width: "100%" }}>
                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 340, width: "100%" }}>
                  <table className="data-table" style={{ minWidth: "max-content" }}>
                    <thead>
                      <tr>
                        {activeSession.preview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSession.preview.rows.map((row, i) => (
                        <tr key={i}>
                          {activeSession.preview.columns.map((col) => (
                            <td key={col} style={{ whiteSpace: "nowrap" }}>
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "var(--text3)",
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  Showing {activeSession.preview.rows.length} of{" "}
                  {activeSession.rowCount?.toLocaleString()} rows ·{" "}
                  {activeSession.preview.columns.length} columns
                </div>
              </div>
            ) : sessions.length > 0 && activeSession && !activeSession.preview ? (
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "30px 0" }}>
                Preview not available for this file.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 28, opacity: 1 - i * 0.12 }} />
                ))}
                <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", marginTop: 8 }}>
                  Upload a file to preview data
                </div>
              </div>
            )}
          </div>

          {/* Supported Formats */}
          <div className="card">
            <div className="card-title">Supported Formats</div>
            {[
              { ext: ".CSV", desc: "Comma-separated values", color: "var(--green)" },
              { ext: ".XLSX", desc: "Excel spreadsheet", color: "var(--cyan)" },
              { ext: ".JSON", desc: "JavaScript Object Notation", color: "var(--amber)" },
            ].map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                }}
              >
                <span
                  className="tag"
                  style={{
                    background: `${f.color}12`,
                    color: f.color,
                    border: `1px solid ${f.color}25`,
                  }}
                >
                  {f.ext}
                </span>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{f.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}