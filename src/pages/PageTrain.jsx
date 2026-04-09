import { useState } from "react";
import { Icons } from "../shared/icons.jsx";
import { useDataPilot, API_BASE } from "../DataPilotContext.jsx";

const MODEL_OPTIONS = [
  { id: "rf",  label: "Random Forest",       desc: "Robust, handles mixed types" },
  { id: "lr",  label: "Logistic Regression", desc: "Fast baseline, interpretable" },
  { id: "xgb", label: "XGBoost",             desc: "High accuracy, gradient boosting" },
  { id: "svm", label: "SVM",                 desc: "Effective in high-dimensions" },
];

function NextStepBar({ label, to, setPage, note }) {
  return (
    <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 12, background: "var(--bg3)", border: "1px solid var(--border2)" }}>
      {note && <span style={{ fontSize: 12, color: "var(--text3)" }}>{note}</span>}
      <button className="btn-primary" style={{ marginLeft: "auto" }} onClick={() => setPage(to)}>
        {label}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  );
}

export default function PageTrain({ setPage }) {
  const { sessionId, columns, setModelId, setModelMeta, trainResults, setTrainResults, trainConfig, setTrainConfig, activeSessionExpired } = useDataPilot();
  const [training, setTraining] = useState(false);
  const [error, setError] = useState("");

  const selectedModel = trainConfig.selectedModel;
  const targetCol     = trainConfig.targetCol;
  const testSize      = trainConfig.testSize;
  const set = (key, val) => setTrainConfig({ ...trainConfig, [key]: val });

  const startTrain = async () => {
    if (!sessionId || !targetCol || activeSessionExpired) return;
    setTraining(true); setError(""); setTrainResults(null);
    try {
      const res = await fetch(`${API_BASE}/train/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, target_column: targetCol, model_type: selectedModel, test_size: testSize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Training failed");
      setModelId(data.model_id);
      setModelMeta({ type: data.model_type, task: data.task, metrics: data.metrics, featureImportance: data.feature_importance });
      setTrainResults(data);
    } catch (e) { setError(e.message || "Training failed"); }
    finally { setTraining(false); }
  };

  if (!sessionId || activeSessionExpired) return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-title">Train Model</div>
        <div className="page-subtitle">{activeSessionExpired ? "Session expired — re-upload your dataset to continue" : "Upload a dataset first to train a model"}</div>
      </div>
      <div className="card" style={{ textAlign:"center",padding:"60px 20px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{ fontSize:14, fontWeight: 500, color:"var(--text)", marginBottom: 6 }}>{activeSessionExpired ? "Session Expired" : "No Dataset Loaded"}</div>
        <div style={{ fontSize:12, color:"var(--text3)" }}>{activeSessionExpired ? "This dataset is no longer active on the server. Go to Upload Data and re-upload the file to continue." : "No dataset loaded. Please upload a file first."}</div>
      </div>
    </div>
  );

  const metrics = trainResults?.metrics || {};
  const isClass = trainResults?.task === "classification";

  return (
    <div className="page-enter">
      <div className="page-header"><div className="page-title">Train Model</div><div className="page-subtitle">Configure and train machine learning models on your dataset</div></div>
      <div className="grid-2 train-layout" style={{ alignItems:"start" }}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div className="card">
            <div className="card-title">Configuration</div>
            <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
              <div>
                <div style={{ fontSize:11,color:"var(--text3)",fontFamily:"'DM Mono',monospace",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em" }}>Target Column</div>
                <select className="input-field" value={targetCol} onChange={e => set("targetCol",e.target.value)} style={{ cursor:"pointer" }}>
                  <option value="">— Select target —</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11,color:"var(--text3)",fontFamily:"'DM Mono',monospace",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em" }}>Test Split: {Math.round(testSize*100)}%</div>
                <input type="range" min="0.1" max="0.4" step="0.05" value={testSize} onChange={e => set("testSize",parseFloat(e.target.value))} style={{ width:"100%",accentColor:"var(--accent)" }} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"var(--text3)",fontFamily:"'DM Mono',monospace",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em" }}>Algorithm</div>
                <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                  {MODEL_OPTIONS.map(m => (
                    <div key={m.id} onClick={() => set("selectedModel",m.id)}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,background:selectedModel===m.id?"var(--accent-dim)":"var(--bg3)",border:`1px solid ${selectedModel===m.id?"rgba(108,99,255,0.3)":"var(--border)"}`,cursor:"pointer",transition:"all 0.15s" }}>
                      <div style={{ width:14,height:14,borderRadius:"50%",border:`2px solid ${selectedModel===m.id?"var(--accent2)":"var(--text3)"}`,background:selectedModel===m.id?"var(--accent)":"transparent",flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12.5,fontWeight:500,color:"var(--text)" }}>{m.label}</div>
                        <div style={{ fontSize:10.5,color:"var(--text3)",marginTop:1 }}>{m.desc}</div>
                      </div>
                      {trainResults && selectedModel===m.id && <span className="tag tag-green">{isClass?`${(metrics.accuracy*100).toFixed(1)}%`:`R²: ${metrics.r2?.toFixed(2)}`}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {error && <div style={{ padding:"12px 14px",background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:10,fontSize:12.5,color:"var(--red)" }}>{error}</div>}
          <button className="btn-primary" style={{ justifyContent:"center" }} onClick={startTrain} disabled={training||!targetCol}>
            {training ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>Training…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.cpu} /></svg>Train Model</>}
          </button>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {trainResults ? (
            <>
              <div className="card fade-up">
                <div className="card-title">Model Performance <span className="tag tag-cyan" style={{ marginLeft:"auto" }}>{trainResults.task}</span></div>
                <div className="grid-2" style={{ gap:10 }}>
                  {Object.entries(metrics).map(([key,val]) => (
                    <div key={key} className="stat-block" style={{ textAlign:"center" }}>
                      <div className="stat-label">{key.toUpperCase()}</div>
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:"var(--green)" }}>
                        {typeof val==="number"?(val<1&&val>-1?(key==="r2"?val.toFixed(3):(val*100).toFixed(1)+"%"):val.toFixed(2)):val}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12,fontSize:11,color:"var(--text3)",fontFamily:"'DM Mono',monospace" }}>Trained on {trainResults.train_size?.toLocaleString()} rows · Tested on {trainResults.test_size?.toLocaleString()} rows</div>
              </div>
              {trainResults.feature_importance?.length>0 && (
                <div className="card fade-up fade-up-1">
                  <div className="card-title">Feature Importance</div>
                  {trainResults.feature_importance.map((f,i) => (
                    <div key={i} className="fi-row">
                      <div className="fi-label">{f.feature}</div>
                      <div className="fi-track"><div className="fi-fill" style={{ width:`${(f.importance/trainResults.feature_importance[0].importance)*100}%` }} /></div>
                      <div className="fi-val">{f.importance.toFixed(3)}</div>
                    </div>
                  ))}
                </div>
              )}
              {trainResults.confusion_matrix?.length>0 && (
                <div className="card fade-up fade-up-2">
                  <div className="card-title">Confusion Matrix</div>
                  <div style={{ overflowX:"auto" }}>
                    {trainResults.confusion_matrix.map((row,ri) => (
                      <div key={ri} style={{ display:"flex",gap:2,marginBottom:2 }}>
                        {row.map((v,ci) => {
                          const maxVal=Math.max(...trainResults.confusion_matrix.flat());
                          return <div key={ci} style={{ flex:1,padding:"10px 4px",borderRadius:5,textAlign:"center",background:ri===ci?`rgba(52,211,153,${0.15+(v/maxVal)*0.6})`:`rgba(248,113,113,${0.05+(v/maxVal)*0.3})`,fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:ri===ci?"var(--green)":"var(--text3)" }}>{v}</div>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ height:280,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12 }}>
              <div style={{ width:56,height:56,borderRadius:14,background:"var(--accent-dim)",border:"1px solid rgba(108,99,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={Icons.cpu} /></svg>
              </div>
              <div style={{ fontSize:13,color:"var(--text2)",textAlign:"center" }}>Configure and train a model<br/>to see performance results</div>
            </div>
          )}
        </div>
      </div>
      <NextStepBar label="Run Predictions" to="/predictions" setPage={setPage} note="Next: upload new data and score it with your trained model" />
    </div>
  );
}