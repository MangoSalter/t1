// Voz do modo guiado. Usa o sintetizador do próprio browser
// (speechSynthesis): sem ficheiros de áudio, como o resto do jogo, e sem
// nenhum serviço por trás — nada do que é dito sai deste computador.
//
// Serve para jogar sozinho, sem ninguém ao lado a dizer o que vem a seguir:
// no modo guiado a app diz que jogo começa, o que se faz nele, e como correu.
// No modo mínimo cala-se por completo — é a diferença entre os dois.

export const __voice = { said: [] };

const MODE_KEY = "euSei_presentationMode";
const VOICE_KEY = "euSei_voiceEnabled";

export const PRESENTATION_MODES = {
  minimo: {
    label: "Mínimo",
    hint: "Só o jogo e alguns sons. Sem ninguém a explicar nada.",
  },
  guiado: {
    label: "Guiado",
    hint: "A app diz o que vem a seguir e como correu — para jogar sozinho sem ninguém ao lado.",
  },
};

// O sintetizador pode não existir (browsers antigos, alguns modos de
// privacidade). Tudo aqui tem de continuar a funcionar sem ele: o jogo não
// pode depender de conseguir falar.
const supported = typeof window !== "undefined"
  && "speechSynthesis" in window
  && typeof window.SpeechSynthesisUtterance === "function";

function loadMode() {
  try {
    const guardado = localStorage.getItem(MODE_KEY);
    return PRESENTATION_MODES[guardado] ? guardado : "minimo";
  } catch {
    return "minimo";
  }
}

function loadVoiceEnabled() {
  try {
    return localStorage.getItem(VOICE_KEY) !== "0";
  } catch {
    return true;
  }
}

let mode = loadMode();
let voiceOn = loadVoiceEnabled();

export function presentationMode() {
  return mode;
}

export function setPresentationMode(next) {
  if (!PRESENTATION_MODES[next]) return;
  mode = next;
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch { /* sem drama: só não fica guardado entre sessões */ }
  // Sair do modo guiado cala o que estava a ser dito nesse instante, em vez de
  // deixar a frase acabar depois de a pessoa já ter pedido silêncio.
  if (next !== "guiado") stopSpeaking();
}

export function voiceEnabled() {
  return voiceOn;
}

export function setVoiceEnabled(on) {
  voiceOn = !!on;
  try {
    localStorage.setItem(VOICE_KEY, voiceOn ? "1" : "0");
  } catch { /* ver setPresentationMode */ }
  if (!voiceOn) stopSpeaking();
}

export function voiceSupported() {
  return supported;
}

// Escolhe uma voz portuguesa se existir. Se não existir, fala na que houver:
// uma voz com sotaque errado é melhor do que silêncio, porque o que interessa
// é a informação, não o sotaque.
function pickVoice() {
  if (!supported) return null;
  let vozes = [];
  try {
    vozes = window.speechSynthesis.getVoices() || [];
  } catch {
    return null;
  }
  if (vozes.length === 0) return null;
  return vozes.find((v) => /^pt[-_]PT/i.test(v.lang))
    || vozes.find((v) => /^pt/i.test(v.lang))
    || null;
}

export function stopSpeaking() {
  if (!supported) return;
  try {
    window.speechSynthesis.cancel();
  } catch { /* ignora */ }
}

// Diz uma frase, se o modo guiado estiver ligado e a voz não estiver
// desligada. Devolve true se chegou a falar — os testes precisam de saber.
export function say(text, { interrupt = true } = {}) {
  const frase = String(text || "").trim();
  if (!frase) return false;
  if (mode !== "guiado" || !voiceOn || !supported) return false;
  try {
    // Por omissão interrompe o que estava a ser dito: a frase nova é quase
    // sempre sobre o ecrã que está agora, e ouvir a explicação do ecrã
    // anterior enquanto se olha para o seguinte só confunde.
    if (interrupt) window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(frase);
    u.lang = "pt-PT";
    const voz = pickVoice();
    if (voz) u.voice = voz;
    u.rate = 1.02;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
    // Guardar o que foi dito é a única forma de os testes verificarem a
    // narração sem depender de haver uma voz portuguesa instalada na máquina
    // que os corre.
    __voice.said.push(frase);
    return true;
  } catch {
    // Falar nunca pode partir o jogo.
    return false;
  }
}


