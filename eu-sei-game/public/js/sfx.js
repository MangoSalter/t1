// Sons do jogo, sintetizados na hora.
//
// Sem ficheiros de áudio de propósito: o jogo é HTML/CSS/JS servido estático,
// sem build nem assets, e uma pasta de .mp3 seria a primeira coisa a
// desalinhar-se do resto. Estes sons são meia dúzia de osciladores curtos —
// pesam zero bytes a transferir e não podem faltar do servidor.
//
// Regras que os mantêm suportáveis: nada passa de ~0.35s, o volume é baixo,
// nunca há dois sons a tocar por cima um do outro no mesmo evento, e há um
// interruptor que se lembra da escolha.

const SFX_KEY = "euSei_sfx";

let ctx = null;
let enabled = true;
try {
  enabled = localStorage.getItem(SFX_KEY) !== "off";
} catch {
  // localStorage indisponível (modo privado): fica ligado, sem drama.
}

export function sfxEnabled() {
  return enabled;
}

export function setSfxEnabled(on) {
  enabled = !!on;
  try {
    localStorage.setItem(SFX_KEY, enabled ? "on" : "off");
  } catch {
    // sem drama: a preferência só não persiste entre sessões.
  }
}

// O contexto só é criado ao primeiro som — os browsers recusam áudio antes
// de haver um gesto do utilizador, e criá-lo no arranque só deixaria um
// contexto suspenso pendurado.
function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Toca uma nota curta.
 * @param {number} freq frequência em Hz
 * @param {number} durMs duração
 * @param {object} opts type (forma de onda), gain (volume), delayMs, slideTo
 */
function tone(freq, durMs, opts = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.delayMs || 0) / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + durMs / 1000);
  // Ataque e queda suaves: uma onda cortada a direito dá um "click" audível.
  const peak = opts.gain ?? 0.06;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

const SOUNDS = {
  // Escala a subir: acertaste.
  certo: () => { tone(660, 90); tone(880, 140, { delayMs: 80 }); },
  // Duas notas graves a descer: erraste. Curto de propósito — errar já
  // chateia, não precisa de castigo sonoro por cima.
  errado: () => { tone(200, 120, { type: "square", gain: 0.04 }); tone(150, 160, { type: "square", gain: 0.04, delayMs: 100 }); },
  // Clique seco de interface.
  toque: () => { tone(520, 45, { gain: 0.035 }); },
  // Arpejo alegre: fim de mini-jogo.
  fim: () => { [523, 659, 784].forEach((f, i) => tone(f, 160, { delayMs: i * 90 })); },
  // Arpejo maior e mais alto: conquista desbloqueada.
  conquista: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 200, { delayMs: i * 85, gain: 0.07 })); },
  // Miado desconfiado: a Dona Manga meteu-se ao barulho.
  caos: () => { tone(420, 260, { type: "triangle", slideTo: 300, gain: 0.07 }); },
  // Sino do Stop.
  stop: () => { tone(880, 300, { type: "triangle", gain: 0.08 }); tone(1320, 300, { type: "triangle", gain: 0.05 }); },
};

/** Toca um som pelo nome. Silencioso se o som não existir ou estiver desligado. */
export function sfx(name) {
  if (!enabled) return;
  const play = SOUNDS[name];
  if (!play) return;
  try {
    play();
  } catch {
    // Áudio bloqueado pelo browser: o jogo não pode parar por causa disso.
  }
}

export const SFX_NAMES = Object.keys(SOUNDS);
