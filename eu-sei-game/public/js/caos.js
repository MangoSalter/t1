// O CAOS DA DONA MANGA, num sítio só.
//
// A gata mete-se a meio de um jogo: põe a pata no ecrã, espreguiça-se em cima
// da mesa, e às vezes o Brasa distrai-a e passa uns pontos por baixo. É o que
// liga os jogos ao mesmo mundo em vez de serem ecrãs soltos com o mesmo botão.
//
// Vivia dentro do solo.js, preso ao HUD dos mini-jogos. O mapa-múndi não lhe
// chegava — e o mapa é hoje um dos dois jogos que ficaram em pé. Em vez de
// fazer uma segunda cópia (que divergiria da primeira à primeira correção),
// mudou-se para aqui o que não é de nenhum jogo em particular: escolher o
// evento, mostrá-lo, e limpá-lo a seguir.
//
// A REGRA DE DESENHO, que se mantém: nenhum evento pode tornar um jogo
// imperdível OU imganhável. Só mexem no que se vê e num bónus no fim. Um
// evento que te matasse seria a app a jogar contra ti, e isso não é
// variedade, é injustiça.
import { pickChaosEvent } from "./data.js";
import { sfx } from "./sfx.js";

export const CHAOS_KEY = "euSei_soloChaos";

// O caos é um só para a casa toda: quem o desliga nos mini-jogos não quer a
// gata a meter-se no mapa também.
export function caosLigado() {
  try {
    return localStorage.getItem(CHAOS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function guardarCaosLigado(ligado) {
  try {
    localStorage.setItem(CHAOS_KEY, ligado ? "on" : "off");
  } catch {
    // Sem armazenamento, fica ligado nesta sessão e não se guarda. Melhor do
    // que rebentar por causa de uma preferência.
  }
}

const els = {
  banner: document.getElementById("chaos-banner"),
  paw: document.getElementById("chaos-paw"),
};

let fimTimer = null;
let ecraComTremor = null;

export function limparCaos() {
  if (fimTimer) clearTimeout(fimTimer);
  fimTimer = null;
  els.banner?.classList.add("hidden");
  els.paw?.classList.add("hidden");
  document.querySelectorAll(".chaos-wobble").forEach((el) => el.classList.remove("chaos-wobble"));
  ecraComTremor = null;
}

// Mostra um evento. `ecra` é onde o tremor se aplica (o ecrã ativo, por
// omissão). Devolve o bónus que o evento deu, para quem chama o somar onde
// faz sentido — os pontos são de cada jogo, não do caos.
export function dispararCaos(ev, ecra = document.querySelector(".screen.active")) {
  if (!ev || !els.banner) return 0;
  sfx("caos");
  els.banner.textContent = `${ev.who}: “${ev.text}”`;
  els.banner.classList.remove("hidden");
  if (ev.kind === "paw") {
    els.paw?.classList.remove("hidden");
  } else if (ev.kind === "wobble") {
    ecra?.classList.add("chaos-wobble");
    ecraComTremor = ecra;
  }
  if (fimTimer) clearTimeout(fimTimer);
  fimTimer = setTimeout(() => {
    els.banner.classList.add("hidden");
    els.paw?.classList.add("hidden");
    ecraComTremor?.classList.remove("chaos-wobble");
    ecraComTremor = null;
    fimTimer = null;
  }, ev.ms || 4000);
  return ev.kind === "bonus" ? (ev.bonus || 0) : 0;
}

// Arma o próximo evento. Entre 6 e 14 segundos: cedo demais e não se percebe
// que o jogo já estava a correr; tarde demais e a maioria dos jogos já acabou.
//
// `continuaAJogar` é perguntado NA HORA de disparar, não agora: um temporizador
// que dispara sobre um jogo que já acabou põe a gata a miar num ecrã vazio.
// A última travessura, para não sair a mesma duas vezes seguidas.
let ultimoCaos = null;

export function armarCaos({ continuaAJogar, ecra, aoDisparar }) {
  if (!caosLigado()) return null;
  const espera = 6000 + Math.random() * 8000;
  return setTimeout(() => {
    if (!continuaAJogar()) return;
    const evento = pickChaosEvent(ultimoCaos);
    ultimoCaos = evento.id;
    const bonus = dispararCaos(evento, typeof ecra === "function" ? ecra() : ecra);
    aoDisparar?.(bonus);
  }, espera);
}
