import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBuPTw6WpRTWSDhs_L_W9OELFP6ff6Ki0c",
  authDomain: "copiumai-9f5b6.firebaseapp.com",
  projectId: "copiumai-9f5b6",
  storageBucket: "copiumai-9f5b6.firebasestorage.app",
  messagingSenderId: "164793994267",
  appId: "1:164793994267:web:f9d3594cca736c7fa67cbe",
  measurementId: "G-6D61YLK3TN",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
