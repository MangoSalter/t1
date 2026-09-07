import {
  battleClampToWalls, computeBattleResults, BATTLE_WALLS, BATTLE_LIVES,
  BATTLE_PLAYER_RADIUS, BATTLE_ATTACK_RADIUS,
} from "./js/room.js";

let failed = false;
function assert(cond, msg) {
  if (!cond) { console.log(`   FALHOU: ${msg}`); failed = true; }
  else console.log(`   OK: ${msg}`);
}

console.log("1) battleClampToWalls empurra um ponto de dentro de uma parede para fora...");
const wall = BATTLE_WALLS[0]; // { x: 260, y: 0, w: 24, h: 340 }
const insideX = wall.x + wall.w / 2;
const insideY = wall.y + 10;
const resolved = battleClampToWalls(insideX, insideY, 16);
console.log(`   parede: ${JSON.stringify(wall)}, ponto testado: (${insideX},${insideY}) -> resolvido: (${resolved.x},${resolved.y})`);
const stillInside = resolved.x > wall.x - 16 && resolved.x < wall.x + wall.w + 16 && resolved.y > wall.y - 16 && resolved.y < wall.y + wall.h + 16;
assert(!stillInside, "ponto resolvido já não está dentro da parede (com margem do raio)");

console.log("2) battleClampToWalls não mexe num ponto já livre...");
const free = battleClampToWalls(700, 450, 16);
assert(free.x === 700 && free.y === 450, `ponto (700,450) fica igual (obtido ${free.x},${free.y})`);

console.log("3) computeBattleResults: jogador nunca eliminado ganha bónus de sobrevivência + segundos...");
// Timestamps tipo epoch (nunca 0, como serverNow() real) — startedAt=0 faria
// `battle.startedAt || now` cair no now por 0 ser falsy em JS, o que nunca
// acontece na prática mas distorceria este teste isolado.
const baseT = 1_700_000_000_000;
const now = baseT + 100000;
const room1 = {
  players: { a: {}, b: {} },
  battle: { startedAt: baseT, endAt: baseT + 90000, eliminatedAt: {}, kills: { a: 2 } },
};
const r1 = computeBattleResults(room1, now);
console.log(`   roundPoints: ${JSON.stringify(r1.roundPoints)}, alive: ${JSON.stringify(r1.alive)}`);
assert(r1.alive.a === true && r1.alive.b === true, "ambos vivos (nunca eliminados)");
// a: 90s * 1 + 2 abates * 15 + bónus sobrevivência 20 = 90+30+20=140
assert(r1.roundPoints.a === 140, `pontos de 'a' = 140 (obtido ${r1.roundPoints.a})`);
assert(r1.roundPoints.b === 110, `pontos de 'b' = 110, sem abates (obtido ${r1.roundPoints.b})`);

console.log("4) computeBattleResults: jogador eliminado a meio da ronda não recebe bónus de sobrevivência...");
const room2 = {
  players: { a: {}, b: {} },
  battle: { startedAt: baseT, endAt: baseT + 90000, eliminatedAt: { b: baseT + 30000 }, kills: {} },
};
const r2 = computeBattleResults(room2, now);
console.log(`   roundPoints: ${JSON.stringify(r2.roundPoints)}, alive: ${JSON.stringify(r2.alive)}`);
assert(r2.alive.b === false, "'b' marcado como não sobrevivente");
assert(r2.roundPoints.b === 30, `pontos de 'b' = 30 (30s sobrevividos, sem bónus, obtido ${r2.roundPoints.b})`);
assert(r2.roundPoints.a === 110, `pontos de 'a' continuam corretos (obtido ${r2.roundPoints.a})`);

// NÃO SE BATE ATRAVÉS DE UMA PAREDE — e o que impede isso é UM PÍXEL.
//
// O golpe acerta por distância e mais nada: o cliente percorre os outros
// jogadores e bate em quem estiver a menos de BATTLE_ATTACK_RADIUS. Não há
// verificação de parede nenhuma. Num labirinto isso seria injusto de uma forma
// que estraga o jogo — dava para ficar do lado de lá de uma parede a bater em
// alguém que não te pode alcançar nem fugir para onde não o vejas.
//
// Só não acontece por causa das contas: encostados aos dois lados da parede
// mais fina, os dois jogadores ficam a raio + espessura + raio = 16 + 24 + 16
// = 56px um do outro, e o golpe chega a 55. Um píxel.
//
// Ninguém escreveu isto em lado nenhum, e três números independentes o
// seguram: engrossar o alcance, afinar uma parede ou encolher o jogador
// tornam o jogo injusto sem partir teste nenhum. Este passo é essa nota.
{
  const R = BATTLE_PLAYER_RADIUS;
  let menor = null;
  for (const p of BATTLE_WALLS) {
    const meioY = p.y + p.h / 2;
    const meioX = p.x + p.w / 2;
    const travessias = [
      [{ x: p.x - 1, y: meioY }, { x: p.x + p.w + 1, y: meioY }],   // pela espessura, na horizontal
      [{ x: meioX, y: p.y - 1 }, { x: meioX, y: p.y + p.h + 1 }],   // e na vertical
    ];
    for (const [a, b] of travessias) {
      const A = battleClampToWalls(a.x, a.y, R);
      const B = battleClampToWalls(b.x, b.y, R);
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      if (d > 0 && (menor === null || d < menor)) menor = d;
    }
  }
  console.log(`   parede mais fina: dois jogadores encostados ficam a ${menor.toFixed(1)}px; o golpe chega a ${BATTLE_ATTACK_RADIUS}px`);
  assert(menor > BATTLE_ATTACK_RADIUS,
    `não se acerta através da parede mais fina (${menor.toFixed(1)}px de separação contra ${BATTLE_ATTACK_RADIUS}px de alcance)`);
}

console.log(`\n${BATTLE_WALLS.length} paredes definidas, ${BATTLE_LIVES} vidas por jogador.`);
console.log(failed ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
if (failed) process.exitCode = 1;
