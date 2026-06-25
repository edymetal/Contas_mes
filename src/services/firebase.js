import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC2hwP0ydlO6w7GydBVRDIzAPxAQCxQ60o",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "contas-mes-ba741.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "contas-mes-ba741",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "contas-mes-ba741.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "77945636773",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:77945636773:web:eec3ba43118570bc50ca4c",
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();
