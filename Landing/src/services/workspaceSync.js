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

// The backend now requires a verified Firebase ID token on these routes
// (previously anyone who knew/guessed another user's r2_key could restore
// their model). Callers must pass the Firebase user so we can fetch a
// fresh token — Firebase caches these locally and auto-refreshes them,
// so calling getIdToken() on every request is cheap and safe.
async function authHeaders(firebaseUser) {
  const headers = { "Content-Type": "application/json" };
  if (firebaseUser) {
    headers.Authorization = `Bearer ${await firebaseUser.getIdToken()}`;
  }
  return headers;
}

export async function saveModelToCloud(datasetDocId, modelId, apiBase, plan = "free", firebaseUser = null) {
  const res = await fetch(`${apiBase}/workspace/model/save`, {
    method:  "POST",
    headers: await authHeaders(firebaseUser),
    body:    JSON.stringify({ model_id: modelId, dataset_doc_id: datasetDocId, plan }),
  });
  if (!res.ok) throw new Error(`Model save failed: ${res.status}`);
  const data = await res.json();
  return data.r2_key;
}

// ── R2/B2: model restore ─────────────────────────────────────────────────────

export async function restoreModelFromCloud(r2Key, apiBase, firebaseUser = null) {
  const res = await fetch(`${apiBase}/workspace/model/restore`, {
    method:  "POST",
    headers: await authHeaders(firebaseUser),
    body:    JSON.stringify({ r2_key: r2Key }),
  });
  if (!res.ok) throw new Error(`Model restore failed: ${res.status}`);
  return await res.json(); // { model_id, model_type, task, metrics, feature_importance }
}