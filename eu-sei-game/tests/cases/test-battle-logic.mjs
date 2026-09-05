import { battleClampToWalls, computeBattleResults, BATTLE_WALLS, BATTLE_LIVES } from "./js/room.js";

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

console.log(`\n${BATTLE_WALLS.length} paredes definidas, ${BATTLE_LIVES} vidas por jogador.`);
console.log(failed ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
if (failed) process.exitCode = 1;
