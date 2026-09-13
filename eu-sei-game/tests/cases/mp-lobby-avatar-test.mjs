import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
console.log(`   sala ${code}`);

console.log("2) Confirmar que o botão de desenhar avatar existe na lobby...");
const btnVisible = await page.locator("#lobby-avatar-edit-btn").isVisible();
console.log(`   visível: ${btnVisible}`);
if (!btnVisible) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Confirmar que o avatar da Ana começa vazio na sala...");
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   avatar inicial: ${room.players[hostId].avatar}`);
if (room.players[hostId].avatar) { console.log("   FALHOU: devia começar vazio (sem desenho local guardado)"); process.exitCode = 1; }

console.log("4) Clicar no botão, desenhar um pixel e guardar...");
await page.click("#lobby-avatar-edit-btn");
await page.waitForSelector("#avatar-editor-overlay:not(.hidden)", { timeout: 3000 });
const canvasBox = await page.locator("#avatar-canvas").boundingBox();
await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
await page.click("#avatar-save-btn");
await page.waitForFunction(() => document.getElementById("avatar-editor-overlay").classList.contains("hidden"), { timeout: 3000 });
console.log("   OK: editor fechou depois de guardar");

console.log("5) Confirmar que o avatar sincronizou logo para a sala (Firebase), não só localStorage...");
await page.waitForFunction((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  const hostId = r.hostId;
  return !!r.players[hostId].avatar;
}, code, { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const avatarVal = room.players[hostId].avatar;
console.log(`   avatar sincronizado: ${avatarVal?.slice(0, 40)}... (esperado data:image/png;base64,...)`);
if (!avatarVal || !avatarVal.startsWith("data:image/png;base64,")) {
  console.log("   FALHOU: avatar não sincronizou corretamente para a sala");
  process.exitCode = 1;
}

console.log("6) Confirmar que a lista de jogadores na lobby mostra o avatar atualizado...");
await page.waitForTimeout(200);
const imgSrc = await page.locator("#lobby-players img.avatar-thumb-sm").first().getAttribute("src");
console.log(`   img src na lista: ${imgSrc?.slice(0, 40)}...`);
if (imgSrc !== avatarVal) { console.log("   FALHOU: lista de jogadores não reflete o novo avatar"); process.exitCode = 1; }

console.log("4) O 'Começar' não aceita o segundo toque enquanto a sala não arranca...");
{
  // Com a rede lenta, o anfitrião impaciente carrega outra vez — e o segundo
  // startGame repunha a ronda a 1 e sorteava outra bola, já com os outros a
  // jogar. Precisa de dois jogadores ligados para o botão sequer ligar.
  await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
  }), code.trim());
  await page.waitForFunction(() => !document.getElementById("start-game-btn")?.disabled, { timeout: 3000 })
    .catch(() => {});
  await page.evaluate(() => { window.__atrasoDaRede = 700; });
  const botao = page.locator("#start-game-btn");
  await botao.click();
  const ocupado = await page.evaluate(() => {
    const b = document.getElementById("start-game-btn");
    return { desativado: b.disabled, rotulo: b.textContent.trim() };
  });
  // O segundo toque, à força, como quem carrega num botão que não respondeu.
  await botao.click({ force: true }).catch(() => {});
  await page.evaluate(() => { window.__atrasoDaRede = 0; });
  await page.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).state === "ball", code.trim(), { timeout: 5000 });
  const primeira = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`).ball.appearAt, code.trim());
  await page.waitForTimeout(400);
  const depois = await page.evaluate((c) => ({
    ronda: window.__testDb.get(`rooms/${c}`).round,
    bola: window.__testDb.get(`rooms/${c}`).ball.appearAt,
  }), code.trim());
  console.log(`   botão enquanto esperava: "${ocupado.rotulo}" (desativado: ${ocupado.desativado}) · ronda ${depois.ronda} · bola ${depois.bola === primeira ? "a mesma" : "OUTRA"}`);
  if (!ocupado.desativado) { console.log("   FALHOU: o botão aceita toques enquanto a sala não arranca"); process.exitCode = 1; }
  if (depois.ronda !== 1 || depois.bola !== primeira) { console.log("   FALHOU: o segundo toque recomeçou a partida"); process.exitCode = 1; }
}

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
