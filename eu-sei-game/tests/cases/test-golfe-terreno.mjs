// O TERRENO do mini-golfe: o que faz de um campo um campo, e não um corredor.
//
// Do playtest: "o mini golfe parece demasiado simples/monótono ou curto,
// tenta aumentar o tamanho da pista para ser mais tipo mapa de Sonic com
// alguns obstáculos ou outros power ups para tornar interessante".
//
// A física corre no browser de cada jogador, mas a REGRA é uma só. Aqui
// mede-se a regra: que os aceleradores empurram, que a areia trava sem
// prender, que os saltitões devolvem sem engolir a bola, e — o que só se
// descobriria a jogar — que o campo é atravessável de uma ponta à outra.
import {
  GOLF_MP_COURSE_W, GOLF_MP_COURSE_H, GOLF_MP_START, GOLF_MP_HOLE,
  GOLF_MP_WALLS, GOLF_MP_ACELERADORES, GOLF_MP_SALTITOES, GOLF_MP_AREIAS,
  GOLF_MP_BALL_RADIUS, GOLF_MP_HOLE_RADIUS, GOLF_MP_SALTO,
  golfTerreno, golfSaltitao,
} from "./js/room.js";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = String(real) === String(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${esperado}, tenho ${real}`}`);
  if (!ok) falhas += 1;
};

console.log("1) O campo cresceu e tem coisas lá dentro...");
console.log(`   ${GOLF_MP_COURSE_W}x${GOLF_MP_COURSE_H} · ${GOLF_MP_WALLS.length} paredes · ${GOLF_MP_ACELERADORES.length} aceleradores · ${GOLF_MP_SALTITOES.length} saltitões · ${GOLF_MP_AREIAS.length} areias`);
check("o campo é maior do que era", GOLF_MP_COURSE_W >= 2000 && GOLF_MP_COURSE_H >= 1000, true);
check("tem terreno que chegue para haver escolhas",
  GOLF_MP_ACELERADORES.length + GOLF_MP_SALTITOES.length + GOLF_MP_AREIAS.length >= 12, true);

console.log("2) Nada do campo fica fora do campo...");
const fora = [
  ...GOLF_MP_WALLS.map((w) => ({ x: w.x, y: w.y, x2: w.x + w.w, y2: w.y + w.h, o: "parede" })),
  ...GOLF_MP_ACELERADORES.map((a) => ({ x: a.x, y: a.y, x2: a.x + a.w, y2: a.y + a.h, o: "acelerador" })),
  ...GOLF_MP_AREIAS.map((a) => ({ x: a.x, y: a.y, x2: a.x + a.w, y2: a.y + a.h, o: "areia" })),
  ...GOLF_MP_SALTITOES.map((b) => ({ x: b.x - b.r, y: b.y - b.r, x2: b.x + b.r, y2: b.y + b.r, o: "saltitão" })),
].filter((r) => r.x < 0 || r.y < 0 || r.x2 > GOLF_MP_COURSE_W || r.y2 > GOLF_MP_COURSE_H);
console.log(`   peças fora do campo: ${fora.length ? fora.map((f) => f.o).join(", ") : "nenhuma"}`);
check("nada sai do campo", fora.length, 0);

console.log("3) A partida e o buraco estão em terreno limpo...");
// Uma bola que nasce dentro de uma parede, ou um buraco tapado, é um jogo
// impossível de acabar — e é o tipo de coisa que só se descobre a jogar.
const dentroDeAlgo = (x, y, raio) => {
  const emCaixa = (c) => x + raio > c.x && x - raio < c.x + c.w && y + raio > c.y && y - raio < c.y + c.h;
  if (GOLF_MP_WALLS.some(emCaixa)) return "parede";
  if (GOLF_MP_SALTITOES.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + raio)) return "saltitão";
  return null;
};
check("a bola não nasce dentro de nada", String(dentroDeAlgo(GOLF_MP_START.x, GOLF_MP_START.y, GOLF_MP_BALL_RADIUS)), "null");
check("o buraco não está tapado", String(dentroDeAlgo(GOLF_MP_HOLE.x, GOLF_MP_HOLE.y, GOLF_MP_HOLE_RADIUS)), "null");
// E não estão os dois ao pé um do outro: o percurso tem de ser um percurso.
const distancia = Math.hypot(GOLF_MP_HOLE.x - GOLF_MP_START.x, GOLF_MP_HOLE.y - GOLF_MP_START.y);
console.log(`   da partida ao buraco: ${Math.round(distancia)}px`);
check("há campo a percorrer", distancia > GOLF_MP_COURSE_W * 0.8, true);

console.log("4) Os aceleradores empurram, e para o lado certo...");
const a = GOLF_MP_ACELERADORES.find((x) => x.dx > 0) || GOLF_MP_ACELERADORES[0];
const meio = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
const empurrada = golfTerreno(meio.x, meio.y, 0, 0, 0.05);
console.log(`   parada em cima de um acelerador (${a.dx},${a.dy}) -> (${Math.round(empurrada.vx)},${Math.round(empurrada.vy)})`);
check("empurra mesmo uma bola parada", Math.hypot(empurrada.vx, empurrada.vy) > 10, true);
check("empurra na direção da seta em x", Math.sign(empurrada.vx), a.dx);
check("e em y", Math.sign(empurrada.vy) || 0, a.dy);
// Fora do acelerador, o chão não faz nada.
const limpo = golfTerreno(GOLF_MP_START.x, GOLF_MP_START.y, 100, 0, 0.05);
check("o chão normal não empurra nada", `${Math.round(limpo.vx)},${Math.round(limpo.vy)}`, "100,0");

console.log("5) A areia trava a sério, mas nunca prende...");
const s = GOLF_MP_AREIAS[0];
const naAreia = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
let v = { vx: 400, vy: 0 };
for (let i = 0; i < 30; i += 1) v = golfTerreno(naAreia.x, naAreia.y, v.vx, v.vy, 1 / 60);
console.log(`   400px/s ao fim de meio segundo de areia: ${Math.round(v.vx)}px/s`);
check("trava bem", v.vx < 300, true);
check("mas não mata a bola", v.vx > 0, true);

console.log("6) Os saltitões devolvem a bola, e põem-na FORA...");
const b = GOLF_MP_SALTITOES[0];
// A bater de frente, vinda da esquerda.
const bateu = golfSaltitao(b.x - b.r + 2, b.y, 300, 0, GOLF_MP_BALL_RADIUS);
console.log(`   entrou a 300px/s e saiu a ${Math.round(bateu.vx)}px/s, em (${Math.round(bateu.x)},${Math.round(bateu.y)})`);
check("bateu", bateu.bateu, true);
check("voltou para trás", bateu.vx < 0, true);
check("com mais do que levou", Math.abs(bateu.vx) > 300, true);
check("e o ganho é o combinado", Math.round(Math.abs(bateu.vx)), Math.round(300 * GOLF_MP_SALTO));
// A bola tem de ficar FORA do saltitão, senão fica lá a bater para sempre.
const distDepois = Math.hypot(bateu.x - b.x, bateu.y - b.y);
console.log(`   distância ao centro depois: ${Math.round(distDepois)} (limite ${b.r + GOLF_MP_BALL_RADIUS})`);
check("a bola sai de dentro do saltitão", distDepois >= b.r + GOLF_MP_BALL_RADIUS - 0.5, true);
// Longe dele, não acontece nada.
const passouAoLado = golfSaltitao(b.x + b.r * 4, b.y, 300, 0, GOLF_MP_BALL_RADIUS);
check("longe do saltitão não há salto", passouAoLado.bateu, false);

console.log("7) O campo é atravessável: há caminho da partida ao buraco...");
// Uma grelha e uma inundação. É a única maneira de garantir que as paredes
// novas não fecharam o campo — desenhar treze paredes à mão e confiar que
// deixam passar é como escrever um labirinto de olhos fechados.
const PASSO = 20;
const cols = Math.ceil(GOLF_MP_COURSE_W / PASSO);
const linhas = Math.ceil(GOLF_MP_COURSE_H / PASSO);
const bloqueado = (cx, cy) => {
  const x = cx * PASSO + PASSO / 2;
  const y = cy * PASSO + PASSO / 2;
  return !!dentroDeAlgo(x, y, GOLF_MP_BALL_RADIUS);
};
const visto = new Set();
const inicio = [Math.floor(GOLF_MP_START.x / PASSO), Math.floor(GOLF_MP_START.y / PASSO)];
const fila = [inicio];
visto.add(inicio.join(","));
while (fila.length) {
  const [cx, cy] = fila.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx; const ny = cy + dy;
    const chave = `${nx},${ny}`;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= linhas || visto.has(chave)) continue;
    if (bloqueado(nx, ny)) continue;
    visto.add(chave);
    fila.push([nx, ny]);
  }
}
const buraco = `${Math.floor(GOLF_MP_HOLE.x / PASSO)},${Math.floor(GOLF_MP_HOLE.y / PASSO)}`;
console.log(`   células alcançáveis desde a partida: ${visto.size}, buraco alcançável: ${visto.has(buraco)}`);
check("dá para chegar ao buraco", visto.has(buraco), true);
// E o campo não pode estar quase todo fechado: um corredor único é o corredor
// de antes, com mais enfeites.
const livres = cols * linhas - (() => {
  let n = 0;
  for (let cx = 0; cx < cols; cx += 1) for (let cy = 0; cy < linhas; cy += 1) if (bloqueado(cx, cy)) n += 1;
  return n;
})();
console.log(`   células livres no campo: ${livres}, alcançadas: ${visto.size} (${Math.round((visto.size / livres) * 100)}%)`);
check("quase todo o campo é alcançável", visto.size / livres > 0.85, true);

if (falhas > 0) { console.log(`=> golfe-terreno FALHOU (${falhas})`); process.exit(1); }
console.log("=> golfe-terreno ok");
