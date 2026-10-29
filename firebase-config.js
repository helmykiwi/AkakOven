// Web configuration is injected at deploy time and is never committed to GitHub.
export const firebaseConfig = window.__AKAKOVEN_FIREBASE_CONFIG__ || window.__NAYSH_FIREBASE_CONFIG__ || {};
