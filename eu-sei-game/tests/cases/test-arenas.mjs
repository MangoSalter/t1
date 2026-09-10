// AS DUAS ARENAS TÊM DE SER TODAS ANDÁVEIS.
//
// O labirinto da Batalha e o da Fuga da Infeção são dez e onze retângulos
// escritos à mão. Mexer neles é a coisa mais natural do mundo — apertar um
// corredor, fechar um atalho, acrescentar uma sala — e é também a maneira mais
// fácil de selar um canto sem dar por isso.
//
// Uma bolsa isolada não dá erro nenhum: dá um jogo estragado em silêncio. Uma
// arma que lá caia nunca é apanhada (e são só quatro ao mesmo tempo, por isso
// desaparecem do jogo); um jogador que lá nasça não pode ser apanhado nem
// infetado, e ganha a ronda por ficar quieto.
//
// O test-infecao já mede a largura dos corredores, dois a dois. Não chega: um
// quadrado fechado por quatro paredes largas tem corredores todos largos e
// mesmo assim não tem entrada. Só a inundação responde à pergunta que
// interessa — dá para ir de qualquer sítio a qualquer sítio?
import {
  BATTLE_WALLS, BATTLE_ARENA_W, BATTLE_ARENA_H, BATTLE_PLAYER_RADIUS, battleClampToWalls,
  TAG_WALLS, TAG_ARENA_W, TAG_ARENA_H, TAG_PLAYER_RADIUS, tagClampToWalls,
  randomBattleWeaponSpot, BATTLE_WEAPON_RADIUS, primeiroInfetado, precisaDeNovoInfetado,
} from "./js/room.js";

let falhou = false;
const check = (cond, msg) => {
  if (!cond) { console.log(`   FALHOU: ${msg}`); falhou = true; }
  else console.log(`   OK: ${msg}`);
};

// Passo de 10px: fino o suficiente para não saltar por cima de uma parede de
// 24, e grosso o suficiente para a conta ser instantânea.
const PASSO = 10;

function medirArena(nome, { W, H, R, clamp }) {
  const cabe = (x, y) => {
    if (x < R || y < R || x > W - R || y > H - R) return false;
    const p = clamp(x, y, R);
    return Math.abs(p.x - x) < 0.001 && Math.abs(p.y - y) < 0.001;
  };
  const cols = Math.floor(W / PASSO);
  const linhas = Math.floor(H / PASSO);
  const g = [];
  let livres = 0;
  for (let j = 0; j < linhas; j++) {
    g[j] = [];
    for (let i = 0; i < cols; i++) {
      const ok = cabe(i * PASSO + PASSO / 2, j * PASSO + PASSO / 2);
      g[j][i] = ok ? 0 : -1;
      if (ok) livres++;
    }
  }
  let inicio = null;
  for (let j = 0; j < linhas && !inicio; j++) {
    for (let i = 0; i < cols; i++) if (g[j][i] === 0) { inicio = [i, j]; break; }
  }
  let vistos = 0;
  if (inicio) {
    const fila = [inicio];
    g[inicio[1]][inicio[0]] = 1;
    vistos = 1;
    while (fila.length) {
      const [i, j] = fila.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di; const b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= linhas) continue;
        if (g[b][a] !== 0) continue;
        g[b][a] = 1; vistos++; fila.push([a, b]);
      }
    }
  }
  const bolsas = [];
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < cols; i++) if (g[j][i] === 0) bolsas.push(`(${i * PASSO},${j * PASSO})`);
  }
  const porCento = livres > 0 ? (vistos / livres) * 100 : 0;
  console.log(`   ${nome}: ${livres} sítios onde o jogador cabe, ${vistos} alcançáveis (${porCento.toFixed(1)}%)`);
  check(livres > 0, `${nome}: a arena tem por onde andar`);
  check(bolsas.length === 0,
    `${nome}: nenhuma bolsa isolada${bolsas.length ? ` — ${bolsas.length} sítios fechados, ex.: ${bolsas.slice(0, 6).join(" ")}` : ""}`);
  return { livres, vistos };
}

console.log("1) O labirinto da Batalha é todo andável...");
const bat = medirArena("Batalha", {
  W: BATTLE_ARENA_W, H: BATTLE_ARENA_H, R: BATTLE_PLAYER_RADIUS, clamp: battleClampToWalls,
});

console.log("2) A arena da Fuga da Infeção é toda andável...");
const inf = medirArena("Infeção", {
  W: TAG_ARENA_W, H: TAG_ARENA_H, R: TAG_PLAYER_RADIUS, clamp: tagClampToWalls,
});

// Uma arena que fosse quase toda parede passaria nos testes de cima — está
// tudo ligado porque quase não há nada — e seria um jogo péssimo à mesma.
console.log("3) E sobra arena que chegue para o jogo ser um jogo...");
for (const [nome, a, W, H] of [["Batalha", bat, BATTLE_ARENA_W, BATTLE_ARENA_H], ["Infeção", inf, TAG_ARENA_W, TAG_ARENA_H]]) {
  const total = Math.floor(W / PASSO) * Math.floor(H / PASSO);
  const parte = (a.livres / total) * 100;
  console.log(`   ${nome}: ${parte.toFixed(0)}% da arena é andável`);
  check(parte > 50, `${nome}: mais de metade da arena é andável (${parte.toFixed(0)}%)`);
}

// AS ARMAS NÃO NASCEM DENTRO DE PAREDES.
//
// Uma arma dentro de uma parede nunca é apanhada, e como só há quatro ao mesmo
// tempo, cada uma dessas tira uma arma do jogo até a ronda acabar — sem erro
// nenhum, só menos jogo. O sorteio tenta vinte sítios e, se falhar os vinte,
// cai no meio da arena; é preciso que o meio também esteja limpo.
//
// Corre-se muitas vezes porque é sorteio: uma passagem não prova nada.
console.log("4) As armas da Batalha nascem sempre em chão livre...");
{
  const R = BATTLE_WEAPON_RADIUS;
  let dentroDeParede = 0;
  let piorExemplo = null;
  for (let i = 0; i < 3000; i++) {
    const p = randomBattleWeaponSpot();
    const livre = battleClampToWalls(p.x, p.y, R);
    if (Math.abs(livre.x - p.x) > 0.001 || Math.abs(livre.y - p.y) > 0.001) {
      dentroDeParede++;
      if (!piorExemplo) piorExemplo = `(${p.x},${p.y})`;
    }
  }
  console.log(`   3000 sorteios: ${dentroDeParede} dentro de paredes${piorExemplo ? ` (ex.: ${piorExemplo})` : ""}`);
  check(dentroDeParede === 0, `nenhuma arma nasce dentro de uma parede${dentroDeParede ? ` (${dentroDeParede} em 3000)` : ""}`);
}

// --- QUEM COMEÇA INFETADO TEM DE ESTAR LIGADO ---
//
// Um ponto que não se mexe não apanha ninguém. Se o primeiro infetado
// calhasse a quem já fechou o telemóvel, a ronda corria o tempo todo sem
// infeção nenhuma e toda a gente sobrevivia — o jogo não acontecia.
{
  const sala = {
    players: {
      a: { name: "Ana", connected: false },
      b: { name: "Beto", connected: true },
      c: { name: "Carla", connected: false },
    },
  };
  // Sorteio determinista: devolve a lista tal e qual, para o teste não
  // depender da sorte (ver a nota sobre isso no CLAUDE.md).
  const semSorte = (lista) => [...lista];
  // Com QUALQUER ordem de sorteio, o escolhido tem de ser o Beto.
  const escolhas = new Set();
  for (let i = 0; i < 20; i += 1) escolhas.add(primeiroInfetado(sala));
  escolhas.add(primeiroInfetado(sala, semSorte));
  if (escolhas.size !== 1 || !escolhas.has("b")) {
    console.log(`FALHOU: o primeiro infetado tem de ser sempre alguém ligado — saiu ${[...escolhas].join(", ")}`);
    falhou = true;
  } else {
    console.log("OK: o primeiro infetado é sempre um jogador ligado");
  }

  // E com ninguém ligado não se devolve vazio: sem isto a sala ficava sem
  // infetado nenhum, que é outra maneira de o jogo não acontecer.
  const ninguem = { players: { a: { connected: false }, b: { connected: false } } };
  const escolhido = primeiroInfetado(ninguem);
  if (!escolhido) {
    console.log("FALHOU: sem ninguém ligado, tinha de escolher alguém à mesma");
    falhou = true;
  } else {
    console.log(`OK: sem ninguém ligado escolhe à mesma (${escolhido})`);
  }
}

// --- E SE O INFETADO SE DESLIGAR A MEIO ---
//
// O mesmo buraco, mas depois de a ronda começar: se quem estava infetado
// fechou o telemóvel e mais ninguém foi apanhado, não há quem apanhe.
{
  const ligado = (n) => ({ name: n, connected: true });
  const fora = (n) => ({ name: n, connected: false });
  const casos = [
    {
      nome: "o único infetado desligou-se",
      sala: { players: { a: fora("Ana"), b: ligado("Beto"), c: ligado("Carla") }, tag: { infected: { a: true } } },
      esperado: true,
    },
    {
      nome: "há um infetado ligado",
      sala: { players: { a: fora("Ana"), b: ligado("Beto"), c: ligado("Carla") }, tag: { infected: { a: true, b: true } } },
      esperado: false,
    },
    {
      nome: "sobrou um jogador só",
      sala: { players: { a: fora("Ana"), b: ligado("Beto") }, tag: { infected: { a: true } } },
      esperado: false,
    },
    {
      nome: "a ronda já acabou",
      sala: { players: { a: fora("Ana"), b: ligado("Beto"), c: ligado("Carla") }, tag: { infected: { a: true }, resolved: true } },
      esperado: false,
    },
  ];
  for (const caso of casos) {
    const deu = precisaDeNovoInfetado(caso.sala);
    if (deu !== caso.esperado) {
      console.log(`FALHOU: "${caso.nome}" devia dar ${caso.esperado} e deu ${deu}`);
      falhou = true;
    } else {
      console.log(`OK: ${caso.nome} -> ${deu}`);
    }
  }
}

console.log(`\n${BATTLE_WALLS.length} paredes na Batalha, ${TAG_WALLS.length} na Infeção.`);
console.log(falhou ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
if (falhou) process.exitCode = 1;
