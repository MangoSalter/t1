import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala (Ana=host), injetar 2 jogadores, saltar direto para 'Desenha e Adivinha' via lobby...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
}, code);
await page.waitForTimeout(200);

console.log("2) Confirmar botão 'Começar este mini-jogo' fica ativo com 3 ligados, escolher 'draw'...");
const quickBtnDisabled = await page.locator('[data-mp-game="draw"]').isDisabled();
console.log(`   botão desativado: ${quickBtnDisabled} (esperado false, 3 jogadores ligados)`);
if (quickBtnDisabled) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click('[data-mp-game="draw"]');
await page.waitForSelector('[data-screen="draw"].active', { timeout: 3000 });
console.log("   OK: no ecrã do Desenha e Adivinha");

console.log("3) Confirmar estado inicial: turnOrder com 3, drawerId é o 1º da lista, ronda 1/3...");
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   turnOrder: ${JSON.stringify(room.draw.turnOrder)}, drawerId: ${room.draw.drawerId}`);
if (room.draw.turnOrder.length !== 3 || room.draw.drawerId !== room.draw.turnOrder[0]) {
  console.log("   FALHOU"); process.exitCode = 1;
}
const roundInfo = await page.locator("#draw-status").textContent();
console.log(`   estado: "${roundInfo}"`);
if (!roundInfo.includes("1/3")) { console.log("   FALHOU: devia mostrar ronda 1/3"); process.exitCode = 1; }

// Força a Ana a ser sempre a desenhadora desta ronda, para o teste cobrir
// sempre o caminho completo do seletor de vencedor (em vez de depender da
// sorte do baralhar do turnOrder).
await page.evaluate(({ code, hostId }) => {
  window.__testDb.update(`rooms/${code}/draw`, { drawerId: hostId });
}, { code, hostId });
await page.waitForTimeout(150);

console.log("3b) Palavra secreta: só a desenhadora a vê no estado; o resultado revela-a a todos...");
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const secret1 = room.draw.secretWord;
console.log(`   palavra secreta da ronda 1: "${secret1}"`);
if (!secret1) { console.log("   FALHOU: devia haver uma palavra secreta"); process.exitCode = 1; }
const drawerStatus = await page.locator("#draw-status").textContent();
if (!drawerStatus.includes(secret1)) { console.log("   FALHOU: a desenhadora devia ver a palavra"); process.exitCode = 1; }
else console.log("   OK: a desenhadora vê a palavra no estado");

{
  console.log("4) Ana (desenhadora) desenha um traço real e depois seleciona quem acertou...");
  const canvasBox = await page.locator("#draw-doodle-canvas").boundingBox();
  await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 300, canvasBox.y + 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).draw.doodle.points || {}).length > 0, code, { timeout: 3000 });
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  console.log(`   pontos desenhados: ${Object.keys(room.draw.doodle.points || {}).length}`);
  if (Object.keys(room.draw.doodle.points || {}).length === 0) { console.log("   FALHOU"); process.exitCode = 1; }

  console.log("4b) Cor e espessura: escolher e ver o traço sair com elas...");
  // Quem desenhava tinha uma caneta só, de uma cor só, enquanto o quadro
  // branco ao lado tem 68 cores. Nos jogos do género a cor e a espessura são
  // o mínimo, e sem elas metade das palavras não se desenha.
  await page.click("#draw-espessuras [data-espessura=\"9\"]");
  await page.click("#draw-cor-btn");
  await page.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
  // Uma cor bem longe da tinta castanha do costume, para se poder procurar
  // nos píxeis sem confusão possível.
  const corEscolhida = await page.evaluate(() => {
    const botoes = [...document.querySelectorAll(".paleta-cor")];
    const azul = botoes.find((b) => {
      const c = getComputedStyle(b).backgroundColor.match(/\d+/g).map(Number);
      return c[2] > 140 && c[2] > c[0] + 60 && c[2] > c[1] + 40;
    }) || botoes[botoes.length - 1];
    azul.click();
    return getComputedStyle(azul).backgroundColor;
  });
  await page.waitForTimeout(300);
  console.log(`   cor escolhida: ${corEscolhida}`);
  await page.mouse.move(canvasBox.x + 120, canvasBox.y + 260);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 340, canvasBox.y + 265, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const comCor = await page.evaluate((code) => {
    const pontos = Object.values(window.__testDb.get(`rooms/${code}`).draw.doodle.points || {});
    const inicios = pontos.filter((p) => p.newStroke);
    return { inicios: inicios.length, ultimo: inicios[inicios.length - 1] || null };
  }, code);
  console.log(`   inícios de traço na sala: ${comCor.inicios}, o último: ${JSON.stringify(comCor.ultimo)}`);
  if (!comCor.ultimo || !comCor.ultimo.c || comCor.ultimo.w !== 9) {
    console.log("   FALHOU: a cor e a espessura deviam viajar no início do traço");
    process.exitCode = 1;
  }
  // E têm de chegar à TELA, não só à sala: sem isto passava com o desenho
  // todo castanho na mesma.
  const pintado = await page.evaluate((alvo) => {
    const [r, g, b] = alvo.match(/\d+/g).map(Number);
    const cv = document.getElementById("draw-doodle-canvas");
    const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let iguais = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 100 && Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) iguais += 1;
    }
    return iguais;
  }, corEscolhida);
  console.log(`   píxeis dessa cor na tela: ${pintado}`);
  if (pintado < 50) {
    console.log("   FALHOU: o traço novo não foi pintado com a cor escolhida");
    process.exitCode = 1;
  }

  console.log("4c) Anular tira o último traço e deixa o anterior de pé...");
  // Sem isto, um risco enganado só se desfazia limpando a folha toda — com o
  // tempo a correr e a mesa à espera, é uma diferença enorme.
  const antesDeAnular = await page.evaluate((code) => {
    const p = window.__testDb.get(`rooms/${code}`).draw.doodle.points || {};
    return { total: Object.keys(p).length, inicios: Object.values(p).filter((x) => x.newStroke).length };
  }, code);
  await page.click("#draw-undo-btn");
  await page.waitForTimeout(400);
  const depoisDeAnular = await page.evaluate((code) => {
    const p = window.__testDb.get(`rooms/${code}`).draw.doodle.points || {};
    return { total: Object.keys(p).length, inicios: Object.values(p).filter((x) => x.newStroke).length };
  }, code);
  console.log(`   antes: ${antesDeAnular.total} pontos / ${antesDeAnular.inicios} traços; depois: ${depoisDeAnular.total} / ${depoisDeAnular.inicios}`);
  if (depoisDeAnular.inicios !== antesDeAnular.inicios - 1) {
    console.log("   FALHOU: devia ter desaparecido UM traço, nem nenhum nem todos");
    process.exitCode = 1;
  }
  if (depoisDeAnular.total === 0) {
    console.log("   FALHOU: anular não pode limpar a folha inteira");
    process.exitCode = 1;
  }

  console.log("5) Outro jogador (p2) tenta desenhar — não deve ter efeito (não é a vez dele)...");
  // A contagem tem de ser lida AGORA: o passo 4b desenhou outro traço, e a
  // que estava guardada era de antes dele.
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  const pointsBefore = Object.keys(room.draw.doodle.points || {}).length;
  await page.evaluate(async ({ code }) => {
    const roomModule = await import("./js/room.js");
    const r = window.__testDb.get(`rooms/${code}`);
    await roomModule.pushDrawDoodlePoints(code, r, "p2", [{ x: 0.1, y: 0.1, newStroke: true }]);
  }, { code });
  await page.waitForTimeout(150);
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  console.log(`   pontos depois da tentativa de p2: ${Object.keys(room.draw.doodle.points || {}).length} (esperado continuar ${pointsBefore})`);
  if (Object.keys(room.draw.doodle.points || {}).length !== pointsBefore) { console.log("   FALHOU"); process.exitCode = 1; }

  console.log("6) Ana clica 'Alguém acertou!' e escolhe p2 como vencedor...");
  await page.click("#draw-select-winner-btn");
  await page.waitForSelector("#draw-winner-overlay:not(.hidden)", { timeout: 3000 });
  const winnerBtnCount = await page.locator("#draw-winner-list button").count();
  console.log(`   opções no seletor de vencedor: ${winnerBtnCount} (esperado 2, exclui a própria Ana)`);
  if (winnerBtnCount !== 2) { console.log("   FALHOU"); process.exitCode = 1; }
  await page.locator("#draw-winner-list button", { hasText: "Beto" }).click();
  await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).draw.resolved === true, code, { timeout: 3000 });
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  console.log(`   roundWinnerId: ${room.draw.roundWinnerId}, pontos p2: ${room.players.p2.score}, pontos Ana: ${room.players[hostId].score}`);
  if (room.draw.roundWinnerId !== "p2" || room.players.p2.score !== 15 || room.players[hostId].score !== 8) {
    console.log("   FALHOU: pontuação inesperada (vencedor 15, desenhador 8)");
    process.exitCode = 1;
  }

  const resultText = await page.locator("#draw-result").textContent();
  console.log(`   texto do resultado: "${resultText}"`);
  if (!resultText.includes(secret1)) { console.log("   FALHOU: o resultado devia revelar a palavra"); process.exitCode = 1; }

  console.log("7) Continuar para a ronda 2 (host clica)...");
  await page.click("#draw-continue-btn");
  await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).draw.turnIndex === 1, code, { timeout: 3000 });
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  console.log(`   nova ronda: turnIndex=${room.draw.turnIndex}, drawerId=${room.draw.drawerId}, pontos limpos: ${Object.keys(room.draw.doodle.points || {}).length === 0}`);
  if (Object.keys(room.draw.doodle.points || {}).length !== 0 || room.draw.resolved !== false) { console.log("   FALHOU"); process.exitCode = 1; }
  console.log(`   palavra nova na ronda 2: "${room.draw.secretWord}" (não repete a 1ª)`);
  if (!room.draw.secretWord || room.draw.secretWord === secret1) { console.log("   FALHOU: devia sortear palavra nova"); process.exitCode = 1; }
}

console.log("8) Saltar as rondas restantes (skip) até ao fim da fila -> deve ir para ecrã final...");
let safety = 0;
while (safety++ < 5) {
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  if (room.state !== "draw") break;
  await page.evaluate(async ({ code }) => {
    const roomModule = await import("./js/room.js");
    const r = window.__testDb.get(`rooms/${code}`);
    await roomModule.skipDrawRound(code, r, r.draw.drawerId);
  }, { code });
  await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).draw.resolved === true, code, { timeout: 3000 });
  const stillActiveDraw = await page.locator('[data-screen="draw"].active').count();
  if (stillActiveDraw) await page.click("#draw-continue-btn");
  await page.waitForTimeout(200);
}
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
console.log("   OK: chegou ao ecrã final");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
