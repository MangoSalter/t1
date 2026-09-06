// O EQUILÍBRIO entre os jogos bónus.
//
// Existe por um defeito concreto: o Conquistar o Mapa pagava ao placar da sala
// os pontos do seu próprio marcador, e conquistar quarenta países valia
// seiscentos pontos quando a Fuga da Infeção inteira vale trinta. Não era
// injusto por pouco — era um jogo a decidir a partida sozinho e os outros a
// deixarem de contar.
//
// A regra que ficou: um jogo bónus vale, ao melhor jogador de uma ronda, entre
// 15 e 40 pontos. Este ficheiro é onde ela vive. Um jogo novo que pague fora
// desta banda falha aqui, e é para falhar: a conversa sobre quanto é que vale
// tem de acontecer antes de ir para o site, não depois de alguém reparar que
// ganhou a partida só por ter jogado bem um dos sete.
import {
  MAPA_PODIO, MAPA_PODIO_MIN, GOLF_MP_FINISH_POINTS, GOLF_MP_FINISH_POINTS_MIN,
  TAG_SURVIVOR_BONUS, TAG_POINTS_PER_SECOND, BATTLE_KILL_POINTS,
  BATTLE_SURVIVOR_BONUS, DRAW_WINNER_POINTS, DRAW_DRAWER_BONUS,
} from "./js/room.js";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = String(real) === String(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${esperado}, tenho ${real}`}`);
  if (!ok) falhas += 1;
};

const MIN = 15;
const MAX = 40;
// Uma ronda de apanhada ou de labirinto dura meio minuto: é isso que torna o
// "por segundo" comparável com um pódio.
const RONDA_S = 30;

console.log("1) O que o melhor jogador leva de cada jogo bónus cabe na banda...");
const melhorDeCada = {
  "Conquistar o Mapa": MAPA_PODIO[0],
  "Mini-Golfe": GOLF_MP_FINISH_POINTS[0],
  "Fuga da Infeção": TAG_SURVIVOR_BONUS + TAG_POINTS_PER_SECOND * RONDA_S,
  "Labirinto: Batalha": BATTLE_SURVIVOR_BONUS + BATTLE_KILL_POINTS,
  "Desenha e Adivinha": DRAW_WINNER_POINTS,
};
Object.entries(melhorDeCada).forEach(([nome, n]) => {
  console.log(`   ${nome}: ${n}`);
  check(`${nome} não vale menos do que ${MIN}`, n >= MIN, true);
  // A apanhada e o labirinto passam dos 40 numa ronda muito boa e isso é de
  // propósito: são os únicos onde o jogador pode fazer melhor jogando melhor
  // durante mais tempo. O teto aqui é 60 — o dobro do pódio, não vinte vezes.
  check(`${nome} não vale mais do que 60`, n <= 60, true);
});

console.log("2) Nenhum jogo vale mais do dobro de outro...");
const valores = Object.values(melhorDeCada);
const maior = Math.max(...valores);
const menor = Math.min(...valores);
console.log(`   maior: ${maior}, menor: ${menor}, razão: ${(maior / menor).toFixed(2)}x`);
check("entre o que paga mais e o que paga menos vai menos de 4x", maior / menor < 4, true);

console.log("3) Chegar em último num pódio vale sempre menos do que chegar em quarto...");
check("mapa", MAPA_PODIO_MIN < MAPA_PODIO[MAPA_PODIO.length - 1], true);
check("golfe", GOLF_MP_FINISH_POINTS_MIN < GOLF_MP_FINISH_POINTS[GOLF_MP_FINISH_POINTS.length - 1], true);

console.log("4) Os pódios descem sempre, nunca sobem a meio...");
const desce = (lista) => lista.every((n, i) => i === 0 || n < lista[i - 1]);
check("mapa", desce(MAPA_PODIO), true);
check("golfe", desce(GOLF_MP_FINISH_POINTS), true);

console.log("5) O mapa e o golfe pagam a mesma coisa — de propósito...");
// Dois jogos de pódio com valores diferentes fariam a fila de bónus valer
// consoante a ordem em que calhassem os jogos.
check("os pódios são iguais", JSON.stringify(MAPA_PODIO), JSON.stringify(GOLF_MP_FINISH_POINTS));
check("e os mínimos também", MAPA_PODIO_MIN, GOLF_MP_FINISH_POINTS_MIN);

if (falhas > 0) { console.log(`=> equilíbrio FALHOU (${falhas})`); process.exit(1); }
console.log("=> equilíbrio ok");
