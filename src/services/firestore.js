// firestore.js
import {
  doc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
  limit,
  updateDoc,
  increment,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";

import { db } from "./firebase";

// ── User-level counters / stats ──────────────────────────────────────────
export async function incrementTotalRowsProcessed(userId, rows) {
  if (!userId) throw new Error("Missing userId");
  if (!rows || rows <= 0) return;

  const userRef = doc(db, "users", userId);
  try {
    await updateDoc(userRef, {
      totalRowsProcessed: increment(rows),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // If the user doc doesn't exist, create it with the initial value.
    await setDoc(userRef, {
      totalRowsProcessed: rows,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function getUserTotalRowsProcessed(userId) {
  if (!userId) throw new Error("Missing userId");
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return 0;
  const data = snap.data();
  return data?.totalRowsProcessed || 0;
}

// ── User Profile ─────────────────────────────────────────────────────────
export async function saveUserProfile(user, extra = {}) {
  if (!user?.uid) throw new Error("Missing user.");

  const userRef = doc(db, "users", user.uid);

  const payload = {
    uid: user.uid,
    email: extra.email ?? user.email ?? "",
    updatedAt: serverTimestamp(),
  };

  if (extra.firstName !== undefined) payload.firstName = extra.firstName;
  if (extra.lastName !== undefined) payload.lastName = extra.lastName;

  const resolvedDisplayName = extra.displayName || user.displayName || "";
  if (resolvedDisplayName) {
    payload.displayName = resolvedDisplayName;
  }

  payload.createdAt = serverTimestamp();

  await setDoc(userRef, payload, { merge: true });
}

// ── Projects ─────────────────────────────────────────────────────────────
export async function createProject(userId, projectName) {
  if (!userId || !projectName?.trim()) {
    throw new Error("Missing userId or project name");
  }

  const projectRef = doc(collection(db, "users", userId, "projects"));

  const projectData = {
    id: projectRef.id,
    name: projectName.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    datasetCount: 0,
    lastActivityAt: serverTimestamp(),
  };

  await setDoc(projectRef, projectData);
  return { id: projectRef.id, ...projectData };
}

export async function getUserProjects(userId) {
  if (!userId) throw new Error("Missing userId");

  const projectsRef = collection(db, "users", userId, "projects");
  const q = query(projectsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export function subscribeToUserProjects(userId, callback) {
  if (!userId) return () => {};

  const projectsRef = collection(db, "users", userId, "projects");
  const q = query(projectsRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    callback(projects);
  });
}

// ── Datasets ─────────────────────────────────────────────────────────────
export async function saveDataset(userId, dataset, projectId = null) {
  if (!userId) throw new Error("Missing userId.");
  if (!dataset) throw new Error("Missing dataset.");

  const datasetsRef = collection(db, "users", userId, "datasets");

  const payload = {
    fileName: dataset.fileName || "",
    fileSize: dataset.fileSize || 0,
    lastModified: dataset.lastModified || 0,
    rowCount: dataset.rowCount || 0,
    columns: dataset.columns || [],
    summary: dataset.summary || null,
    sessionId: dataset.sessionId || null,
    projectId: projectId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(datasetsRef, payload);

  if (projectId) {
    const projectRef = doc(db, "users", userId, "projects", projectId);
    await updateDoc(projectRef, {
      datasetCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return docRef.id;
}

export async function findExistingDataset(userId, file, projectId = null) {
  if (!userId) throw new Error("Missing userId.");
  if (!file) throw new Error("Missing file.");

  const datasetsRef = collection(db, "users", userId, "datasets");

  const constraints = [
    where("fileName", "==", file.name),
    where("fileSize", "==", file.size),
    where("lastModified", "==", file.lastModified),
    limit(1),
  ];

  if (projectId) {
    constraints.push(where("projectId", "==", projectId));
  }

  const q = query(datasetsRef, ...constraints);
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

export async function getUserDatasets(userId) {
  if (!userId) throw new Error("Missing userId.");

  const datasetsRef = collection(db, "users", userId, "datasets");
  const q = query(datasetsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getProjectDatasets(userId, projectId) {
  if (!userId || !projectId) {
    throw new Error("Missing userId or projectId");
  }

  const datasetsRef = collection(db, "users", userId, "datasets");
  const q = query(
    datasetsRef,
    where("projectId", "==", projectId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

// ── Delete Dataset ───────────────────────────────────────────────────────
export async function deleteDataset(userId, datasetId, projectId = null) {
  if (!userId || !datasetId) {
    throw new Error("Missing userId or datasetId");
  }

  await deleteDoc(doc(db, "users", userId, "datasets", datasetId));

  if (projectId) {
    const projectRef = doc(db, "users", userId, "projects", projectId);
    await updateDoc(projectRef, {
      datasetCount: increment(-1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
}

// ── Delete Project ───────────────────────────────────────────────────────
export async function deleteProject(userId, projectId) {
  if (!userId || !projectId) {
    throw new Error("Missing userId or projectId");
  }

  const datasetsRef = collection(db, "users", userId, "datasets");
  const datasetsQuery = query(
    datasetsRef,
    where("projectId", "==", projectId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(datasetsQuery);

  await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
  await deleteDoc(doc(db, "users", userId, "projects", projectId));
}