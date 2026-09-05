// Testes puros da Estrada Maluca em equipa (sem browser): o que tem de ser
// verdade é que a pista é IGUAL para todos e que a pontuação premia quem
// aguentou mais tempo.
import {
  raceObstacleLane, raceSpawnIntervalAt, raceSpeedAt, computeRaceResults,
  RACE_LANES, RACE_SPAWN_INTERVAL_START_MS, RACE_SPAWN_INTERVAL_MIN_MS,
  RACE_BASE_SPEED, RACE_MAX_SPEED, RACE_PODIUM_BONUS,
} from "./js/room.js";

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "  OK " : "  FALHOU "} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

console.log("1) A mesma semente dá sempre a mesma pista (é isto que torna a corrida justa)...");
const a = Array.from({ length: 200 }, (_, i) => raceObstacleLane(12345, i));
const b = Array.from({ length: 200 }, (_, i) => raceObstacleLane(12345, i));
check("mesma semente -> mesma sequência", a.join() === b.join());
const c = Array.from({ length: 200 }, (_, i) => raceObstacleLane(999, i));
check("sementes diferentes -> pistas diferentes", a.join() !== c.join());
check("todas as faixas são válidas", a.every((l) => Number.isInteger(l) && l >= 0 && l < RACE_LANES));

console.log("2) A pista usa as três faixas, não fica agarrada a uma...");
const counts = [0, 0, 0];
Array.from({ length: 3000 }, (_, i) => raceObstacleLane(4242, i)).forEach((l) => counts[l]++);
console.log(`   distribuição em 3000 obstáculos: ${counts.join(" / ")}`);
check("nenhuma faixa fica abaixo de 25%", counts.every((n) => n > 3000 * 0.25));

console.log("3) Nunca há dois obstáculos seguidos que fechem a estrada toda...");
// Só nasce 1 obstáculo de cada vez, por isso sobra sempre pelo menos 1 faixa.
// O que interessa verificar é que não há sequências longas na mesma faixa a
// obrigarem a ficar parado (o que seria aborrecido, não impossível).
let maxRun = 1, run = 1;
for (let i = 1; i < 3000; i++) {
  const prev = raceObstacleLane(4242, i - 1), cur = raceObstacleLane(4242, i);
  run = cur === prev ? run + 1 : 1;
  if (run > maxRun) maxRun = run;
}
console.log(`   maior sequência na mesma faixa: ${maxRun}`);
check("sem sequências absurdas na mesma faixa", maxRun <= 12);

console.log("4) A dificuldade aperta com o tempo, mas com limite...");
check("intervalo inicial", raceSpawnIntervalAt(0) === RACE_SPAWN_INTERVAL_START_MS);
check("intervalo diminui", raceSpawnIntervalAt(30000) < raceSpawnIntervalAt(0));
check("intervalo nunca abaixo do mínimo", raceSpawnIntervalAt(600000) === RACE_SPAWN_INTERVAL_MIN_MS);
check("velocidade inicial", raceSpeedAt(0) === RACE_BASE_SPEED);
check("velocidade sobe", raceSpeedAt(30000) > RACE_BASE_SPEED);
check("velocidade nunca acima do máximo", raceSpeedAt(600000) === RACE_MAX_SPEED);

console.log("5) Pontuação: quem aguenta mais tempo ganha mais, com bónus de pódio...");
const room = {
  players: { ana: {}, beto: {}, carla: {}, dinis: {} },
  race: { racers: {
    ana: { timeMs: 42000, alive: false },
    beto: { timeMs: 30500, alive: false },
    carla: { timeMs: 61200, alive: false },
    dinis: { timeMs: 5000, alive: false },
  } },
};
const { roundPoints, standings } = computeRaceResults(room);
console.log(`   classificação: ${Object.entries(standings).map(([u, s]) => `${u}=${s.place}º`).join(", ")}`);
console.log(`   pontos: ${JSON.stringify(roundPoints)}`);
check("Carla (mais tempo) fica em 1º", standings.carla.place === 1);
check("Dinis (menos tempo) fica em último", standings.dinis.place === 4);
check("1º leva bónus de pódio", standings.carla.podium === RACE_PODIUM_BONUS[0]);
check("4º não leva bónus de pódio", standings.dinis.podium === 0);
check("pontos do 1º = 61s + bónus", roundPoints.carla === 61 + RACE_PODIUM_BONUS[0]);
check("mais tempo = mais pontos", roundPoints.carla > roundPoints.ana && roundPoints.ana > roundPoints.beto && roundPoints.beto > roundPoints.dinis);

console.log("6) Empates ficam com a mesma classificação (ninguém é penalizado por ordem de leitura)...");
const tie = computeRaceResults({
  players: { x: {}, y: {}, z: {} },
  race: { racers: { x: { timeMs: 20000 }, y: { timeMs: 20000 }, z: { timeMs: 10000 } } },
});
console.log(`   ${JSON.stringify(tie.standings)}`);
check("empate -> mesmo lugar", tie.standings.x.place === tie.standings.y.place);
check("empate -> mesmos pontos", tie.roundPoints.x === tie.roundPoints.y);
check("quem ficou atrás do empate vem a seguir", tie.standings.z.place === 3);

console.log("7) Quem nem chegou a correr (0s) não leva bónus de pódio por falta de gente...");
const solo = computeRaceResults({ players: { u: {}, v: {} }, race: { racers: { u: { timeMs: 0 }, v: { timeMs: 0 } } } });
check("0s -> 0 pontos", solo.roundPoints.u === 0 && solo.roundPoints.v === 0);

console.log(failed ? `\nRESULTADO: FALHOU (${failed})` : "\nRESULTADO: OK");
if (failed) process.exitCode = 1;
