// Comandos no ecrã para telemóvel/tablet.
//
// Todos os mini-jogos de ação (Kota Corre!, Mini-Golfe, Estrada Maluca,
// Fuga da Infeção, Labirinto: Batalha) são jogados com as setas do teclado
// — ou seja, eram simplesmente injogáveis num telemóvel, que é o aparelho
// natural de um jogo de festa (toda a gente entra na sala pelo seu).
//
// Em vez de mexer na lógica de cada jogo, estes botões enviam eventos de
// teclado SINTÉTICOS: cada jogo continua a ouvir "keydown"/"keyup" com as
// mesmas teclas de sempre e não sabe (nem precisa de saber) que o toque
// veio de um botão no ecrã.

const el = document.getElementById("touch-controls");
const actionBtn = document.getElementById("touch-action-btn");
const heldKeys = new Set();

// (pointer: coarse) apanha telemóveis/tablets e exclui ratos; maxTouchPoints
// cobre portáteis com ecrã tátil. ?touch=1 força os comandos (útil para
// testar num computador).
export const touchLikely =
  new URLSearchParams(location.search).get("touch") === "1"
  || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  || (navigator.maxTouchPoints || 0) > 0;

function sendKey(type, key) {
  document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

function press(key) {
  if (heldKeys.has(key)) return;
  heldKeys.add(key);
  sendKey("keydown", key);
}

function release(key) {
  if (!heldKeys.has(key)) return;
  heldKeys.delete(key);
  sendKey("keyup", key);
}

// Solta tudo o que ficou preso — evita o jogador ficar "a andar sozinho"
// se levantar o dedo fora do botão ou o jogo terminar a meio de um toque.
function releaseAll() {
  [...heldKeys].forEach(release);
}

if (el) {
  el.querySelectorAll("[data-touch-key]").forEach((btn) => {
    // Lê a tecla no momento do toque, não ao ligar o listener: a do botão
    // de ação muda conforme o jogo (showTouchControls reescreve o dataset).
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      press(btn.dataset.touchKey);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
      btn.addEventListener(evt, (e) => {
        e.preventDefault();
        release(btn.dataset.touchKey);
      });
    });
    // Sem isto, o browser interpreta toques repetidos como zoom/duplo-clique.
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}

/**
 * Mostra os comandos no ecrã (só em aparelhos táteis).
 * @param {{action?: {key: string, label: string}}} opts botão de ação
 *   opcional à direita (ex.: Espaço para atacar no Labirinto: Batalha).
 */
export function showTouchControls(opts = {}) {
  if (!el || !touchLikely) return;
  const action = opts.action;
  if (action && actionBtn) {
    actionBtn.dataset.touchKey = action.key;
    actionBtn.textContent = action.label;
    actionBtn.classList.remove("hidden");
  } else if (actionBtn) {
    actionBtn.classList.add("hidden");
  }
  el.classList.remove("hidden");
}

export function hideTouchControls() {
  if (!el) return;
  releaseAll();
  el.classList.add("hidden");
}
