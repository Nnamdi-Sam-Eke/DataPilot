import { useState, useRef } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

export default function PagePredictions() {
  const {
    modelId, modelMeta, sessionId,
    predictionResults:  results,   setPredictionResults:  setResults,
    predictionFileName: fileName,  setPredictionFileName: setFileName,
    activeSessionExpired,
  } = useDataPilot();

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file || !modelId) return;
    setLoading(true);
    setError("");
    setResults(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/predict/?model_id=${modelId}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Prediction failed");
      setResults(data);
    } catch (e) {
      setError(e.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!results?.predictions) return;
    const headers = Object.keys(results.predictions[0]).join(",");
    const rows = results.predictions.map(r => Object.values(r).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "predictions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const isClassification = modelMeta?.task === "classification";

  if (!sessionId || activeSessionExpired) {
    return (
      <div className="page-enter">
        <div className="page-header"><div className="page-title">Predictions</div></div>
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>{activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "Upload a dataset and train a model first."}</div>
        </div>
      </div>
    );
  }

  if (!modelId) {
    return (
      <div className="page-enter">
        <div className="page-header">
          <div className="page-title">Predictions</div>
          <div className="page-subtitle">Score new data using your trained model</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.predict} /></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>No Model Trained</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>Go to Train Model and train a model first.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Predictions</div>
        <div className="page-subtitle">
          Score new data using your trained {modelMeta?.type?.toUpperCase()} model ({modelMeta?.task})
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
          {loading
            ? <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.upload} /></svg>
          }
          {loading ? "Scoring…" : "Upload New Data"}
        </button>
        {results && (
          <button className="btn-secondary" onClick={downloadCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.download} /></svg>
            Download Predictions
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, fontSize: 12.5, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {!results ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent-dim)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.predict} /></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>Ready to Score</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>Upload new data to generate predictions</div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid-3 mb-5 fade-up">
            <div className="stat-block">
              <div className="stat-label">Total Scored</div>
              <div className="stat-value" style={{ color: "var(--accent2)", fontSize: 20 }}>{results.total?.toLocaleString()}</div>
            </div>
            {isClassification && Object.entries(results.summary || {}).map(([label, count]) => (
              <div key={label} className="stat-block">
                <div className="stat-label">{label}</div>
                <div className="stat-value" style={{ color: "var(--text)", fontSize: 20 }}>{count}</div>
                <div className="stat-sub">{results.total > 0 ? ((count / results.total) * 100).toFixed(1) + "%" : "—"}</div>
              </div>
            ))}
            {!isClassification && (
              <>
                <div className="stat-block">
                  <div className="stat-label">Mean Prediction</div>
                  <div className="stat-value" style={{ color: "var(--green)", fontSize: 20 }}>{results.summary?.mean?.toFixed(2)}</div>
                </div>
                <div className="stat-block">
                  <div className="stat-label">Range</div>
                  <div className="stat-value" style={{ color: "var(--cyan)", fontSize: 16 }}>{results.summary?.min?.toFixed(2)} – {results.summary?.max?.toFixed(2)}</div>
                </div>
              </>
            )}
          </div>

          {/* Results table */}
          <div className="card fade-up fade-up-1">
            <div className="card-title">Predicted Results
              <span className="tag tag-blue" style={{ marginLeft: "auto" }}>{fileName}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Prediction</th>
                    {isClassification && results.predictions[0]?.probability !== undefined && <th>Confidence</th>}
                    {isClassification && results.predictions[0]?.confidence !== undefined && <th>Risk Level</th>}
                  </tr>
                </thead>
                <tbody>
                  {results.predictions.slice(0, 50).map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text3)" }}>{p.id}</td>
                      <td>
                        {isClassification
                          ? <span className={`tag ${p.prediction === "1" || p.prediction === "Yes" || p.prediction === "True" ? "tag-red" : "tag-green"}`}>{p.prediction}</span>
                          : <span style={{ fontFamily: "'DM Mono', monospace" }}>{typeof p.prediction === "number" ? p.prediction.toFixed(4) : p.prediction}</span>
                        }
                      </td>
                      {isClassification && p.probability !== undefined && (
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, maxWidth: 80 }}>
                              <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${p.probability * 100}%`, background: p.probability > 0.7 ? "var(--red)" : p.probability > 0.4 ? "var(--amber)" : "var(--green)" }} />
                              </div>
                            </div>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text2)" }}>{(p.probability * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                      )}
                      {isClassification && p.confidence !== undefined && (
                        <td>
                          <span className={`tag ${p.confidence === "High" ? "tag-red" : p.confidence === "Medium" ? "tag-amber" : "tag-green"}`}>{p.confidence}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.predictions.length > 50 && (
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text3)", fontFamily: "'DM Mono', monospace" }}>
                  Showing 50 of {results.predictions.length} rows · Download CSV to see all
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}