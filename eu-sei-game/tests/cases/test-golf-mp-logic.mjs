// Lógica pura do Mini-Golfe em equipa: as barreiras têm mesmo de contar como
// paredes (é o que faz o power-up doer), e a pontuação tem de premiar a
// ordem de chegada sem deixar de fora quem ficou pelo caminho.
import {
  golfActiveWalls, computeGolfResults,
  GOLF_MP_WALLS, GOLF_MP_FINISH_POINTS, GOLF_MP_HOLE, GOLF_MP_START,
} from "./js/room.js";

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "  OK " : "  FALHOU "} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

console.log("1) Barreiras contam como paredes enquanto duram, e desaparecem depois...");
const now = 1000000;
const golf = { barriers: {
  viva: { x: 500, y: 300, w: 24, h: 190, until: now + 3000 },
  velha: { x: 800, y: 300, w: 24, h: 190, until: now - 1 },
} };
const walls = golfActiveWalls(golf, now);
console.log(`   paredes ativas: ${walls.length} (fixas: ${GOLF_MP_WALLS.length})`);
check("a barreira viva entra", walls.some((w) => w.x === 500 && w.h === 190));
check("a barreira expirada não entra", !walls.some((w) => w.x === 800));
check("as paredes fixas continuam lá", walls.length === GOLF_MP_WALLS.length + 1);
check("sem barreiras, só as fixas", golfActiveWalls({}, now).length === GOLF_MP_WALLS.length);

console.log("2) Pontos pela ordem de chegada...");
const room = {
  players: { ana: {}, beto: {}, carla: {}, dinis: {} },
  golf: {
    finished: { beto: 12000, ana: 20500, carla: 31000 },
    balls: { dinis: { x: GOLF_MP_HOLE.x - 300, y: GOLF_MP_HOLE.y } },
  },
};
const { roundPoints, standings } = computeGolfResults(room);
console.log(`   classificação: ${Object.entries(standings).map(([u, s]) => `${u}=${s.place}º`).join(", ")}`);
console.log(`   pontos: ${JSON.stringify(roundPoints)}`);
check("quem meteu primeiro fica em 1º", standings.beto.place === 1);
check("1º leva o máximo", roundPoints.beto === GOLF_MP_FINISH_POINTS[0]);
check("2º leva menos que o 1º", roundPoints.ana < roundPoints.beto && roundPoints.ana === GOLF_MP_FINISH_POINTS[1]);
check("quem não meteu vem depois de quem meteu", standings.dinis.place === 4);
check("quem não meteu leva pouco mas leva", roundPoints.dinis > 0 && roundPoints.dinis < roundPoints.carla);
check("guarda a distância de quem não meteu", standings.dinis.distance === 300);

console.log("3) Ninguém mete: quem ficou mais perto leva mais...");
const nobody = computeGolfResults({
  players: { x: {}, y: {} },
  golf: { finished: {}, balls: {
    x: { x: GOLF_MP_HOLE.x - 100, y: GOLF_MP_HOLE.y },
    y: { x: GOLF_MP_HOLE.x - 900, y: GOLF_MP_HOLE.y },
  } },
});
console.log(`   ${JSON.stringify(nobody.standings)} / ${JSON.stringify(nobody.roundPoints)}`);
check("o mais perto fica em 1º", nobody.standings.x.place === 1);
check("o mais perto leva mais", nobody.roundPoints.x > nobody.roundPoints.y);

console.log("4) Quem nem se mexeu conta a partir da saída (não rebenta)...");
const idle = computeGolfResults({ players: { z: {} }, golf: { finished: {}, balls: {} } });
const expected = Math.round(Math.hypot(GOLF_MP_HOLE.x - GOLF_MP_START.x, GOLF_MP_HOLE.y - GOLF_MP_START.y));
console.log(`   distância assumida: ${idle.standings.z.distance} (esperado ${expected}, a da saída)`);
check("usa a posição de saída quando não há bola", idle.standings.z.distance === expected);

console.log(failed ? `\nRESULTADO: FALHOU (${failed})` : "\nRESULTADO: OK");
if (failed) process.exitCode = 1;
