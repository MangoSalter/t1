import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala com Ana (host) e 2 bots, forcar so 'tag' como bonus...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 15000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 15000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
console.log(`   sala ${code}, hostId=${hostId}`);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${code}/config`, { bonusGames: ["tag"] });
}, code);
const numRounds = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).config.numRounds, code);
await page.evaluate(({ code, numRounds }) => {
  window.__testDb.update(`rooms/${code}`, { round: numRounds, state: "roundScore" });
}, { code, numRounds });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 15000 });
await page.click("#round-next-btn");
await page.waitForSelector('[data-screen="tag"].active', { timeout: 15000 });
console.log("   OK: entrou no ecrã da Fuga da Infeção");

console.log("2) Confirmar arena/posições/3 jogadores renderizados...");
await page.waitForTimeout(400);
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   arena: ${room.tag.arenaW}x${room.tag.arenaH}, infetado inicial: ${Object.keys(room.tag.infected)[0]}`);
const playerElCount = await page.locator(".tag-player").count();
console.log(`   elementos .tag-player: ${playerElCount} (esperado 3)`);
if (playerElCount !== 3) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Forçar Ana a estar infetada (via a função real, para testar a deteção de contacto)...");
await page.evaluate(async ({ code, hostId }) => {
  const roomModule = await import("./js/room.js");
  await roomModule.claimTagInfection(code, hostId);
}, { code, hostId });
await page.waitForTimeout(200);
const anaPos = await page.evaluate(() => {
  const el = document.querySelector(".tag-player.tag-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
console.log(`   posição atual da Ana: ${JSON.stringify(anaPos)}`);

console.log("4) Colocar p2 mesmo ao lado da Ana e confirmar que é infetado automaticamente...");
await page.evaluate(({ code, anaPos }) => {
  window.__testDb.update(`rooms/${code}/tag/positions/p2`, { x: anaPos.left + 5, y: anaPos.top + 5, updatedAt: Date.now() });
}, { code, anaPos });
await page.waitForFunction((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return r.tag.infected.p2 === true;
}, code, { timeout: 15000 });
console.log("   OK: p2 foi infetado por contacto");

console.log("5) Testar apanha de power-up: ronda nova, Ana sã, e um power-up em cima dela...");
// RONDA NOVA, de propósito. O passo 4 infetou o último sobrevivente: os três
// ficam infetados e o anfitrião resolve a ronda — o ecrã da apanhada sai do
// sítio e o ciclo do jogo pára. Quando isso acontecia antes deste passo, o
// power-up ficava no chão de um jogo que já não estava a correr e o teste
// falhava por "tempo esgotado", uma vez em cada duas ou três. Não era um
// teste instável: era o teste a correr contra o relógio da ronda e a perder
// às vezes.
await page.evaluate(async (code) => {
  const roomModule = await import("./js/room.js");
  const sala = window.__testDb.get(`rooms/${code}`);
  await roomModule.startTagTeam(code, sala);
}, code);
await page.waitForSelector('[data-screen="tag"].active', { timeout: 10000 });
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/tag`, { infected: { p2: true } }); // so p2 infetado agora
}, code);
await page.waitForTimeout(150);
const anaPos2 = await page.evaluate(() => {
  const el = document.querySelector(".tag-player.tag-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
await page.evaluate(({ code, anaPos2 }) => {
  window.__testDb.update(`rooms/${code}/tag/powerups`, { testpower: { type: "shield", x: anaPos2.left, y: anaPos2.top } });
}, { code, anaPos2 });
try {
  await page.waitForFunction((code) => {
    const r = window.__testDb.get(`rooms/${code}`);
    return !r.tag.powerups || r.tag.powerups.testpower === undefined;
  }, code, { timeout: 15000 });
} catch (e) {
  const diag = await page.evaluate((code) => {
    const r = window.__testDb.get(`rooms/${code}`);
    const el = document.querySelector(".tag-player.tag-player-me");
    return {
      infetados: r.tag.infected,
      powerups: r.tag.powerups,
      ana: el ? { left: el.style.left, top: el.style.top } : null,
      ecra: document.querySelector('[data-screen="tag"]')?.classList.contains("active"),
    };
  }, code);
  console.log(`   DIAGNOSTICO: ${JSON.stringify(diag)}`);
  throw e;
}
console.log("   OK: power-up foi apanhado (removido)");
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const anaShielded = (room.tag.effects?.[hostId]?.shieldUntil || 0) > Date.now();
console.log(`   Ana tem escudo ativo: ${anaShielded} (esperado true)`);
if (!anaShielded) { console.log("   FALHOU: efeito de escudo não foi aplicado"); process.exitCode = 1; }

console.log("5b) A ARENA INTEIRA cabe no ecrã, e as paredes estão lá...");
// A queixa do playtest era esta: "vê-se muito pouco enquanto se anda pelo
// mapa". A câmara seguia o jogador e mostrava um terço da arena. Agora o
// mundo encolhe até caber, e o que se verifica é isso mesmo — o retângulo
// desenhado do mundo tem de caber dentro do retângulo da arena no ecrã.
const enquadramento = await page.evaluate(() => {
  const arena = document.getElementById("tag-arena");
  const mundo = arena.querySelector(".tag-world");
  const a = arena.getBoundingClientRect();
  const m = mundo.getBoundingClientRect();
  return {
    arena: { w: Math.round(a.width), h: Math.round(a.height) },
    mundo: { w: Math.round(m.width), h: Math.round(m.height) },
    forasX: Math.round(m.left - a.left), forasY: Math.round(m.top - a.top),
    paredes: arena.querySelectorAll(".tag-wall").length,
  };
});
console.log(`   arena ${enquadramento.arena.w}x${enquadramento.arena.h}, mundo desenhado ${enquadramento.mundo.w}x${enquadramento.mundo.h}, paredes: ${enquadramento.paredes}`);
if (enquadramento.mundo.w > enquadramento.arena.w + 2 || enquadramento.mundo.h > enquadramento.arena.h + 2) {
  console.log("   FALHOU: o mundo não cabe no ecrã — voltou a ver-se só um bocado do mapa");
  process.exitCode = 1;
}
if (enquadramento.forasX < -2 || enquadramento.forasY < -2) {
  console.log("   FALHOU: o mundo está a sair para fora da arena");
  process.exitCode = 1;
}
if (enquadramento.paredes < 8) {
  console.log(`   FALHOU: as paredes deviam estar desenhadas (só ${enquadramento.paredes})`);
  process.exitCode = 1;
}

console.log("6) Forçar fim da ronda (endAt no passado) e confirmar resolução + pontos...");
// Quem sobreviveu sai do infectedAt, não do infected: a ronda nova do passo 5
// começou limpa, por isso diz-se aqui, explicitamente, quem é que foi apanhado
// — só o p2 — para a conta ter uma resposta certa em vez de depender do que
// sobrou dos passos anteriores.
await page.evaluate((code) => {
  const sala = window.__testDb.get(`rooms/${code}`);
  const inicio = sala.tag.startedAt || Date.now();
  window.__testDb.update(`rooms/${code}/tag`, {
    infected: { p2: true },
    infectedAt: { p2: inicio + 1000 },
    endAt: Date.now() - 1000,
  });
}, code);
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).tag.resolved === true, code, { timeout: 15000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   resolvido. survived: ${JSON.stringify(room.tag.survived)}, roundPoints: ${JSON.stringify(room.tag.roundPoints)}`);
if (room.tag.survived[hostId] !== true || room.tag.survived.p3 !== true || room.tag.survived.p2 !== false) {
  console.log("   FALHOU: estado de sobrevivência inesperado (só o p2 foi apanhado; a Ana e o p3 sobreviveram)");
  process.exitCode = 1;
}
// E os pontos têm de seguir a sobrevivência: quem foi apanhado a um segundo do
// início não pode levar o mesmo que quem aguentou a ronda toda.
if (!(room.tag.roundPoints[hostId] > room.tag.roundPoints.p2)) {
  console.log(`   FALHOU: quem sobreviveu devia levar mais pontos (${room.tag.roundPoints[hostId]} vs ${room.tag.roundPoints.p2})`);
  process.exitCode = 1;
}
await page.waitForSelector('[data-screen="tag"].active [id="tag-results"]:not(.hidden)', { timeout: 15000 });
console.log("   OK: resultados visíveis");

console.log("7) Continuar (fim da fila de bonus, so 1 jogo) -> deve ir para ecra final...");
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/tag`, { resolvedAt: Date.now() - 10000 });
}, code);
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
console.log("   OK: chegou ao ecrã final");
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   scores finais: ${JSON.stringify(Object.fromEntries(Object.entries(room.players).map(([k, v]) => [k, v.score])))}`);

// NUM TELEMÓVEL, TENS DE CONTINUAR A SABER QUAL DOS PONTOS ÉS TU.
//
// Pediste o mapa todo à vista, e é o que se faz: a arena de 1200x760 encolhe
// até caber no ecrã. Num telemóvel de 390px isso é 28%, e cada jogador fica um
// ponto de 9px. Passa — o jogo é ver-se de longe. O que não passa é o anel que
// diz qual dos pontos és tu encolher junto: 3px a 28% são 0,85px, e o único
// sinal que interessa desaparece exatamente onde o ecrã é mais pequeno.
//
// O anel é escrito em unidades do mundo a dividir pela escala, para medir
// sempre o mesmo no ecrã. Este passo mede-o nos dois tamanhos.
console.log("Num telemóvel e num computador, o anel do \"és tu\" mede o mesmo...");
{
  const medidas = [];
  for (const [nome, alvo] of [["telemóvel", devices["iPhone 13"]], ["computador", { viewport: { width: 1280, height: 800 } }]]) {
    const ctx2 = await browser.newContext({ ...alvo });
    const p2 = await ctx2.newPage();
    await p2.goto("http://localhost:8937/index.html?touch=1", { waitUntil: "networkidle" });
    await p2.fill("#name-input", "Ana");
    await p2.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
    await p2.click("#create-room-btn");
    await p2.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
    const c2 = (await p2.locator("#lobby-code").textContent()).trim();
    await p2.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
      p2: { name: "Beto", score: 0, connected: true },
      p3: { name: "Carla", score: 0, connected: true },
    }), c2);
    await p2.waitForTimeout(300);
    await p2.evaluate(async (c) => {
      const m = await import("./js/room.js");
      await m.startQuickBonusGame(c, window.__testDb.get(`rooms/${c}`), "tag");
    }, c2);
    await p2.waitForSelector('[data-screen="tag"].active', { timeout: 8000 });
    await p2.waitForTimeout(800);
    const m = await p2.evaluate(() => {
      const mundo = document.querySelector(".tag-world");
      const esc = parseFloat(getComputedStyle(mundo).getPropertyValue("--escala-arena")) || 1;
      const eu = document.querySelector(".tag-player-me");
      const sombra = eu ? getComputedStyle(eu).boxShadow : "";
      const achado = sombra.match(/0px 0px 0px ([\d.]+)px/);
      const b = eu ? eu.getBoundingClientRect() : null;
      return { esc, anel: achado ? parseFloat(achado[1]) : null, peca: b ? Math.round(b.width) : null };
    });
    const noEcra = m.anel === null ? null : m.anel * m.esc;
    console.log(`   ${nome}: escala ${m.esc.toFixed(3)} · peça ${m.peca}px · anel ${noEcra === null ? "?" : noEcra.toFixed(2)}px no ecrã`);
    if (noEcra === null) { console.log("   FALHOU: não encontrei o anel do jogador"); process.exitCode = 1; }
    else medidas.push({ nome, noEcra });
    await ctx2.close();
  }
  for (const x of medidas) {
    if (x.noEcra < 2) {
      console.log(`   FALHOU: no ${x.nome} o anel mede ${x.noEcra.toFixed(2)}px — não se vê qual dos pontos és tu`);
      process.exitCode = 1;
    }
  }
}

console.log("N) Os anéis dos power-ups no telemóvel, onde a arena inteira encolhe...");
// A arena da Fuga da Infeção cabe toda no ecrã, e num telemóvel isso é 0,282
// de escala. Tudo o que esteja DENTRO do mundo encolhe com ele — foi assim
// que o anel do "este és tu" ficou a 0,85px, e os anéis dos power-ups
// ficaram a 1,1px pela mesma razão, meses depois daquela correção.
//
// Mede-se o CSS, que é onde o defeito vive: montam-se os pontos como a app os
// monta, com a escala de um telemóvel, e lê-se a espessura que sai.
const telemovel = await browser.newContext({ ...devices["iPhone 13"] });
const pt = await telemovel.newPage();
await pt.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
const aneis = await pt.evaluate(() => {
  const ESCALA = 0.282; // medido: a arena inteira num iPhone 13
  const arena = document.createElement("div");
  arena.className = "tag-arena";
  const world = document.createElement("div");
  world.className = "tag-world";
  world.style.width = "1200px";
  world.style.height = "800px";
  world.style.setProperty("--escala-arena", String(ESCALA));
  world.style.transform = `scale(${ESCALA})`;
  const faz = (cls) => { const d = document.createElement("div"); d.className = cls; world.appendChild(d); return d; };
  // O nome por cima do ponto vive no mesmo mundo encolhido: a 0,282 saía a
  // 2,9px. Num jogo em que se foge de quem está infetado, saber quem é quem é
  // metade do jogo.
  const comNome = faz("tag-player tag-player-survivor");
  const etiqueta = document.createElement("span");
  etiqueta.className = "tag-player-name";
  etiqueta.textContent = "Guilherme";
  comNome.appendChild(etiqueta);
  const casos = {
    eu: faz("tag-player tag-player-survivor tag-player-me"),
    euComEscudo: faz("tag-player tag-player-survivor tag-player-me tag-player-shield"),
    euVeloz: faz("tag-player tag-player-infected tag-player-me tag-player-speed"),
    outroComEscudo: faz("tag-player tag-player-survivor tag-player-shield"),
  };
  arena.appendChild(world);
  document.body.appendChild(arena);
  // "0px 0px 0px 10.6383px" -> 10.6383; cada anel é uma sombra da lista.
  const espessuras = (el) => [...getComputedStyle(el).boxShadow.matchAll(/0px 0px 0px ([\d.]+)px/g)]
    .map((m) => parseFloat(m[1]) * ESCALA);
  const cores = (el) => [...getComputedStyle(el).boxShadow.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1]);
  const out = { __nome: { fonteNoEcra: parseFloat(getComputedStyle(etiqueta).fontSize) * ESCALA } };
  for (const [nome, el] of Object.entries(casos)) out[nome] = { px: espessuras(el), cores: cores(el) };
  arena.remove();
  return out;
});
const fonteDoNome = aneis.__nome.fonteNoEcra;
delete aneis.__nome;
console.log(`   nome do jogador: ${fonteDoNome.toFixed(2)}px no ecrã`);
if (fonteDoNome < 8) {
  console.log(`   FALHOU: um nome a ${fonteDoNome.toFixed(2)}px não se lê — e é preciso saber de quem se foge`);
  process.exitCode = 1;
}
for (const [nome, v] of Object.entries(aneis)) {
  console.log(`   ${nome}: ${v.px.map((n) => n.toFixed(1)).join(", ")} px no ecrã`);
}
for (const [nome, v] of Object.entries(aneis)) {
  if (v.px.length === 0 || Math.max(...v.px) < 3) {
    console.log(`   FALHOU: ${nome} não tem anel nenhum visível (${v.px.join(", ")}px) — no telemóvel não se vê`);
    process.exitCode = 1;
  }
}
// E o "este és tu" tem de sobreviver a apanhar um power-up: o box-shadow
// substitui em vez de somar, e sem uma regra para as duas classes juntas
// quem apanhava um escudo deixava de saber qual dos pontos era o seu.
const acento = aneis.eu.cores[0];
for (const nome of ["euComEscudo", "euVeloz"]) {
  if (!aneis[nome].cores.includes(acento)) {
    console.log(`   FALHOU: ${nome} perdeu a cor do "este és tu" (${acento}) — ficou ${aneis[nome].cores.join(" / ")}`);
    process.exitCode = 1;
  }
}
await telemovel.close();

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
