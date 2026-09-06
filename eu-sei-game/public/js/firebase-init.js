import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { identidadeDestaAba } from "./identity.js";

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

// Quem sou eu NESTA ABA — a decisão inteira, e a razão dela, estão no
// identity.js, partilhado com o duplo dos testes para os dois não poderem
// divergir.
export async function getUid() {
  // A conta anónima primeiro: as regras da base de dados pedem auth != null, e
  // dar a identidade antes de haver conta deixava a app a escrever sem acesso.
  const contaUid = await autenticar();
  return identidadeDestaAba(contaUid);
}

function autenticar() {
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
