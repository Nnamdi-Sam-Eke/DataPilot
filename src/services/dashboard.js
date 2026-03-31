import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Realtime datasets listener ─────────────────────────────────────────────
// Pushes the full datasets array whenever Firestore changes.
// Returns the unsubscribe function — call it on component unmount.
export function subscribeToUserDatasets(userId, callback) {
  const q = query(
    collection(db, "users", userId, "datasets"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const datasets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(datasets);
  });
}

// ── Realtime activity listener ─────────────────────────────────────────────
// Listens to the 20 most recent activity events.
// Returns the unsubscribe function.
export function subscribeToUserActivity(userId, callback) {
  const q = query(
    collection(db, "users", userId, "activity"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    const activity = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(activity);
  });
}

// ── Write activity event ───────────────────────────────────────────────────
// Call this from upload, train, report, and insight flows.
//
// action:  short label  e.g. "Dataset uploaded"
// detail:  description  e.g. "fraud_transactions.csv · 220K rows"
// color:   CSS var       e.g. "var(--accent2)"
//
// Usage:
//   await logActivity(user.uid, {
//     action: "Dataset uploaded",
//     detail: `${fileName} · ${rowCount.toLocaleString()} rows`,
//     color: "var(--accent2)",
//   });
export async function logActivity(userId, { action, detail, color }) {
  await addDoc(collection(db, "users", userId, "activity"), {
    action,
    detail,
    color: color || "var(--accent2)",
    createdAt: serverTimestamp(),
  });
}