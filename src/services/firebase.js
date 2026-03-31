// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0DjrTZ8aesr0RubXHkwQc6xZNghh7Kew",
  authDomain: "datapilot-6398b.firebaseapp.com",
  projectId: "datapilot-6398b",
  storageBucket: "datapilot-6398b.firebasestorage.app",
  messagingSenderId: "410827293767",
  appId: "1:410827293767:web:2b7477ba280c78cdbf1d62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };