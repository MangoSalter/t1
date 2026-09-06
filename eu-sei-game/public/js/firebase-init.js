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

// Quem sou eu NESTA ABA.
//
// A conta anónima do Firebase serve para ter acesso à base de dados (as regras
// pedem auth != null) e é a MESMA em todos os separadores do mesmo browser.
// Isso chegava para o jogo funcionar entre telemóveis diferentes, mas partia o
// caso de duas pessoas jogarem no mesmo computador em dois separadores: eram
// contadas como o mesmo jogador, e o segundo a entrar roubava o lugar ao
// primeiro em vez de se juntar a ele.
//
// Por isso a identidade de JOGADOR é por separador, guardada no
// sessionStorage: sobrevive a um F5 (é o que faz o "voltar à sala" funcionar)
// e morre com o separador. Duas abas = duas pessoas, como se espera.
//
// Sem sessionStorage (janela privada muito fechada, definições do browser) a
// identidade fica só em memória: joga-se na mesma, mas um F5 entra como
// jogador novo.
const UID_KEY = "euSei_jogadorNestaAba";
let uidEmMemoria = null;

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

export async function getUid() {
  const contaUid = await autenticar();
  try {
    const guardado = sessionStorage.getItem(UID_KEY);
    if (guardado) return guardado;
  } catch { /* sem sessionStorage: cai para a memória, ver nota acima */ }
  if (uidEmMemoria) return uidEmMemoria;
  // A conta vai no id para dois browsers diferentes nunca colidirem, e o
  // sufixo ao acaso separa os separadores do mesmo browser.
  uidEmMemoria = `${contaUid}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    sessionStorage.setItem(UID_KEY, uidEmMemoria);
  } catch { /* idem */ }
  return uidEmMemoria;
}
