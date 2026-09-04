import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export {
  ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction,
};

let serverOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverOffset = snap.val() || 0;
});

export function serverNow() {
  return Date.now() + serverOffset;
}

export function getUid() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user.uid);
        } else {
          signInAnonymously(auth).catch(reject);
        }
      },
      reject
    );
  });
}
