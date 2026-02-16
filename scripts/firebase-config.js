import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyATIMePBMDrIQ7uOGiKrBKfgAhK8IgDJRw",
    authDomain: "dbl-team-builder.firebaseapp.com",
    projectId: "dbl-team-builder",
    storageBucket: "dbl-team-builder.firebasestorage.app",
    messagingSenderId: "649225970942",
    appId: "1:649225970942:web:14f58d3bc9e1c0f266f1af",
    measurementId: "G-5XBM7YY34G"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
