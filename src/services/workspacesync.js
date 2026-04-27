// src/services/workspaceSync.js
//
// Cloud persistence for DataPilot workspace — models only.
// Plots, predictions, and reports are localStorage-only for now
// and regenerate fast enough that cloud persistence isn't worth
// the complexity at beta scale.
//
// Model save/restore uses the backend as a proxy to R2/B2 so
// the frontend never holds credentials.

// ── R2/B2: model save ────────────────────────────────────────────────────────

export async function saveModelToCloud(datasetDocId, modelId, apiBase) {
  const res = await fetch(`${apiBase}/workspace/model/save`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model_id: modelId, dataset_doc_id: datasetDocId }),
  });
  if (!res.ok) throw new Error(`Model save failed: ${res.status}`);
  const data = await res.json();
  return data.r2_key;
}

// ── R2/B2: model restore ─────────────────────────────────────────────────────

export async function restoreModelFromCloud(r2Key, apiBase) {
  const res = await fetch(`${apiBase}/workspace/model/restore`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ r2_key: r2Key }),
  });
  if (!res.ok) throw new Error(`Model restore failed: ${res.status}`);
  return await res.json(); // { model_id, model_type, task, metrics, feature_importance }
}