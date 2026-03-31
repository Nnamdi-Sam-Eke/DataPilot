import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";

export const signUpUser = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);

export const signInUser = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const signOutUser = () => signOut(auth);

export const observeAuthState = (callback) =>
  onAuthStateChanged(auth, callback);