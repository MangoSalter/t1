// O MAPA-MÚNDI numa sala.
//
// É o mesmo mapa do modo sozinho — o mesmo motor, o mesmo ecrã, os mesmos
// modos e dificuldades. O que muda é quem escreve: em vez de o ecrã pintar o
// país e ficar por ali, avisa a sala, e a sala é que diz se o país ficou mesmo
// para este jogador. Dois a escrever "Brasil" ao mesmo tempo é o caso normal,
// não o caso raro, e só uma pessoa pode ficar com ele.
//
// Vive em módulo próprio pela mesma razão do quadro: o app.js já é grande de
// mais, e este ficheiro só precisa de saber ler o estado da sala e chamar
// quatro funções do ecrã do mapa.
import {
  ligarASala, aplicarEstadoDaSala, dizerNoMapa, __mapa,
} from "./mapa-ecra.js";
import {
  mapaConquistar, mapaErrar, mapaRevelarPista, mapaClassificacao, finishMapaRound,
} from "./room.js";
import { state, isHost } from "./app-state.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./ui-utils.js";

// As cores dos jogadores no mapa. Escolhidas para se distinguirem quando
// ficam CLARAS — é assim que aparecem preenchidas — e para nenhuma passar por
// outra a preto e branco.
export const CORES_DO_MAPA = [
  "#b24b38", "#3f6f8f", "#5f8a45", "#8a5fa8", "#c08a2e",
  "#2f8a80", "#a8506f", "#6b6f8a", "#8a6a3a", "#4a7a4a",
];

// A cor sai da ORDEM DE CHEGADA à sala, não do uid ordenado. Parece um
// pormenor e não é: por uid, bastava alguém entrar a meio do jogo para as
// cores de toda a gente andarem uma casa para o lado — o mapa mudava de cores
// sozinho e ninguém percebia de quem era o quê. Quem chegou primeiro fica com
// a sua cor até ao fim.
export function corDoJogador(room, uid) {
  const jogadores = Object.entries(room?.players || {})
    .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0) || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const i = jogadores.indexOf(uid);
  return CORES_DO_MAPA[(i < 0 ? 0 : i) % CORES_DO_MAPA.length];
}

let ligado = false;

export function renderMapaSala(room) {
  const eu = state.uid;
  if (!ligado) {
    ligarASala({
      minhaCor: corDoJogador(room, eu),
      aoConquistar: (pais, pontos) => mapaConquistar(state.code, eu, pais.nome, pontos),
      aoErrar: (pais) => mapaErrar(state.code, eu, pais ? pais.nome : null),
      aoRevelar: (nome) => mapaRevelarPista(state.code, nome),
      aoSair: () => {
        // Só quem manda acaba a partida. Aos outros o botão não faz nada de
        // mau: dizer-lhes que não podem é melhor do que tirá-lo do ecrã e
        // deixá-los à procura dele.
        if (isHost(state.room)) finishMapaRound(state.code, state.room);
      },
    });
    ligado = true;
    __mapa.abrirMapa();
  }
  // A cor deste jogador volta a ser dita a cada estado: se a sala mudar de
  // gente, o adaptador tem de saber com que cor é que este ecrã pinta.
  ligarASala({ ...__mapa.jogo.sala, minhaCor: corDoJogador(room, eu) });
  aplicarEstadoDaSala(room.mapa, (uid) => corDoJogador(room, uid));
  desenharClassificacao(room);
  anunciarAManga(room);
}

export function esquecerMapaDaSala() {
  ligarASala(null);
  ligado = false;
  ultimaManga = 0;
}

// A travessura da gata só se conta UMA vez. O estado da sala chega várias
// vezes por segundo e sem isto o mapa dizia o mesmo sem parar, por cima de
// tudo o que o jogador estivesse a tentar ler.
let ultimaManga = 0;
function anunciarAManga(room) {
  const manga = room.mapa?.manga;
  if (!manga || !manga.quando || manga.quando === ultimaManga) return;
  ultimaManga = manga.quando;
  dizerNoMapa(t("mapaMangaRoubou", manga.pais));
}

// A classificação ao lado do mapa. Mostra o que se quer saber de relance:
// quantos países são meus, quantos são do outro, e quem vai à frente.
function desenharClassificacao(room) {
  const caixa = document.getElementById("mapa-sala-tabela");
  if (!caixa) return;
  const linhas = mapaClassificacao(room);
  caixa.innerHTML = linhas.map((l, i) => `
    <li class="${l.uid === state.uid ? "eu" : ""}">
      <span class="mapa-sala-cor" style="background:${corDoJogador(room, l.uid)}"></span>
      <b>${i + 1}º</b> ${escapeHtml(l.nome)}
      <span class="mapa-sala-num">${l.paises} · ${l.pontos} pts</span>
    </li>`).join("");
  caixa.classList.toggle("hidden", linhas.length === 0);
}

export function souOAnfitriaoDoMapa(room) {
  return isHost(room);
}
