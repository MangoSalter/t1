// A ARENA DA FUGA DA INFEÇÃO: as regras novas, sem browser.
//
// Do playtest: "o conceito ta bom mas vê-se muito pouco enquanto se anda pelo
// mapa. Faz antes mais obstáculos mas deixa visibilidade do mapa para todos.
// Faz parecido ao labirinto, mas com power-ups de velocidade ou outros que
// ajudem a fugir/apanhar."
//
// O que se guarda aqui é o que uma partida a sério só revelaria tarde: que
// nenhum ponto de partida nasce dentro de uma parede, que os apanhados não
// caem em sítios impossíveis, e que a lentidão trava os outros e não quem a
// apanhou.
import {
  TAG_WALLS, TAG_ARENA_W, TAG_ARENA_H, TAG_PLAYER_RADIUS, TAG_POWERUP_RADIUS,
  TAG_POWERUP_TYPES, TAG_LENTIDAO_MS, tagClampToWalls, livreNaArenaDaInfecao,
  tagTravadoPor, clampToWalls,
} from "./js/room.js";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = String(real) === String(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${esperado}, tenho ${real}`}`);
  if (!ok) falhas += 1;
};

console.log("1) A arena cabe num ecrã e tem obstáculos a sério...");
console.log(`   ${TAG_ARENA_W}x${TAG_ARENA_H}, ${TAG_WALLS.length} paredes`);
check("a arena encolheu para caber no ecrã", TAG_ARENA_W <= 1200 && TAG_ARENA_H <= 800, true);
check("e tem paredes que cheguem para haver por onde cortar", TAG_WALLS.length >= 8, true);
// Nenhuma parede pode sair da arena: uma parede meia fora é uma parede que se
// vê meia e contra a qual se bate inteira.
const foraDaArena = TAG_WALLS.filter((w) => w.x < 0 || w.y < 0 || w.x + w.w > TAG_ARENA_W || w.y + w.h > TAG_ARENA_H);
check("nenhuma parede sai da arena", foraDaArena.length, 0);

console.log("2) As paredes deixam passar: nada de corredores estreitos de mais...");
// Dois jogadores de raio 16 precisam de pelo menos 32px de folga para passar.
// Um corredor mais estreito do que isso é uma parede que parece passagem.
const CORREDOR_MINIMO = TAG_PLAYER_RADIUS * 2 + 8;
let estreitos = 0;
for (let i = 0; i < TAG_WALLS.length; i += 1) {
  for (let j = i + 1; j < TAG_WALLS.length; j += 1) {
    const a = TAG_WALLS[i]; const b = TAG_WALLS[j];
    // Só interessa o par que se sobrepõe num eixo: aí a folga no outro é um
    // corredor a sério.
    const cruzamY = a.y < b.y + b.h && b.y < a.y + a.h;
    const cruzamX = a.x < b.x + b.w && b.x < a.x + a.w;
    if (cruzamY) {
      const folga = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      if (folga > 0 && folga < CORREDOR_MINIMO) estreitos += 1;
    }
    if (cruzamX) {
      const folga = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      if (folga > 0 && folga < CORREDOR_MINIMO) estreitos += 1;
    }
  }
}
console.log(`   corredores mais estreitos do que ${CORREDOR_MINIMO}px: ${estreitos}`);
check("nenhum corredor é estreito de mais para se passar", estreitos, 0);

console.log("3) Os apanhados nunca nascem dentro de uma parede...");
// Era o defeito à espera de acontecer: com paredes novas, o sorteio às cegas
// punha-os lá dentro de vez em quando — visíveis e impossíveis de apanhar.
let dentroDeParede = 0;
for (let i = 0; i < 400; i += 1) {
  const p = livreNaArenaDaInfecao();
  const fora = clampToWalls(p.x, p.y, TAG_POWERUP_RADIUS, TAG_WALLS);
  if (fora.x !== p.x || fora.y !== p.y) dentroDeParede += 1;
  if (p.x < 0 || p.y < 0 || p.x > TAG_ARENA_W || p.y > TAG_ARENA_H) dentroDeParede += 1;
}
console.log(`   em 400 sorteios, apanhados em sítio impossível: ${dentroDeParede}`);
check("nenhum apanhado nasce dentro de uma parede", dentroDeParede, 0);

console.log("4) As paredes empurram para fora, em vez de deixarem passar...");
const parede = TAG_WALLS[0];
const meio = { x: parede.x + parede.w / 2, y: parede.y + parede.h / 2 };
const empurrado = tagClampToWalls(meio.x, meio.y, TAG_PLAYER_RADIUS);
const saiu = empurrado.x !== meio.x || empurrado.y !== meio.y;
console.log(`   (${meio.x},${meio.y}) dentro da parede -> (${empurrado.x},${empurrado.y})`);
check("quem entra numa parede é posto fora", saiu, true);
// E um ponto em campo aberto não é mexido: empurrar quem não está a bater
// seria o jogo a travar sozinho.
const aberto = tagClampToWalls(60, 60, TAG_PLAYER_RADIUS);
check("quem está livre não é empurrado", `${aberto.x},${aberto.y}`, "60,60");

console.log("5) Os apanhados servem os dois lados da perseguição...");
console.log(`   ${TAG_POWERUP_TYPES.join(", ")}`);
check("há mais do que os dois de antes", TAG_POWERUP_TYPES.length >= 4, true);
check("o teletransporte existe", TAG_POWERUP_TYPES.includes("teleporte"), true);
check("a lentidão existe", TAG_POWERUP_TYPES.includes("lentidao"), true);

console.log("6) A lentidão trava os OUTROS, não quem a apanhou...");
const agora = 1_700_000_000_000;
const comLentidao = { lentidao: { ate: agora + TAG_LENTIDAO_MS, de: "ana" } };
check("quem a apanhou não fica travado", tagTravadoPor(comLentidao, "ana", agora + 100), false);
check("os outros ficam", tagTravadoPor(comLentidao, "beto", agora + 100), true);
check("e passa sozinha", tagTravadoPor(comLentidao, "beto", agora + TAG_LENTIDAO_MS + 1), false);
check("sem lentidão nenhuma, ninguém está travado", tagTravadoPor({}, "beto", agora), false);

if (falhas > 0) { console.log(`=> infeção FALHOU (${falhas})`); process.exit(1); }
console.log("=> infeção ok");
