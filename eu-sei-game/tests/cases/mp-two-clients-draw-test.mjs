// Teste com DOIS clientes reais (duas páginas no mesmo contexto, a
// partilhar o stub da base de dados por BroadcastChannel/localStorage).
// Responde à pergunta do utilizador: "confirma se foi feito um quadro
// branco para se poder escrever e os outros verem".
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["host", host], ["guest", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
}

console.log("1) Anfitriã cria a sala...");
await host.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
console.log(`   sala ${code}`);

console.log("2) Segundo jogador entra mesmo (segunda página, mesma sala)...");
await guest.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.waitForTimeout(400);
const namesSeenByHost = await host.locator("#lobby-players li").allTextContents();
console.log(`   a anfitriã vê: ${JSON.stringify(namesSeenByHost)}`);
if (!namesSeenByHost.some((t) => t.includes("Beto"))) {
  console.log("   FALHOU: o segundo jogador não apareceu na lobby da anfitriã");
  process.exitCode = 1;
}

console.log("3) Com 2 jogadores, o botão do Desenha e Adivinha tem de estar ATIVO (era aqui que 'não abria')...");
const drawDisabled = await host.locator('[data-mp-game="draw"]').isDisabled();
console.log(`   desativado: ${drawDisabled} (esperado false)`);
if (drawDisabled) { console.log("   FALHOU: continua bloqueado com 2 jogadores"); process.exitCode = 1; }

console.log("4) Anfitriã abre o Desenha e Adivinha — AMBOS têm de ir para o quadro (não para o Stop)...");
await host.click('[data-mp-game="draw"]');
await host.waitForSelector('[data-screen="draw"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="draw"].active', { timeout: 5000 });
const hostScreen = await host.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
const guestScreen = await guest.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
console.log(`   ecrã da anfitriã: ${hostScreen}, ecrã do convidado: ${guestScreen} (esperado draw/draw)`);
if (hostScreen !== "draw" || guestScreen !== "draw") { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Quem desenha vê a palavra secreta; o outro NÃO a pode ver no seu estado...");
const room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const drawerIsHost = room.draw.drawerId === room.hostId;
const drawer = drawerIsHost ? host : guest;
const watcher = drawerIsHost ? guest : host;
console.log(`   quem desenha: ${drawerIsHost ? "Ana (anfitriã)" : "Beto (convidado)"}, palavra: "${room.draw.secretWord}"`);
const drawerStatus = await drawer.locator("#draw-status").textContent();
const watcherStatus = await watcher.locator("#draw-status").textContent();
console.log(`   estado de quem desenha: "${drawerStatus}"`);
console.log(`   estado de quem adivinha: "${watcherStatus}"`);
if (!drawerStatus.includes(room.draw.secretWord)) { console.log("   FALHOU: quem desenha devia ver a palavra"); process.exitCode = 1; }
if (watcherStatus.includes(room.draw.secretWord)) { console.log("   FALHOU: quem adivinha NÃO devia ver a palavra"); process.exitCode = 1; }

console.log("6) O ESSENCIAL: quem desenha risca e o outro vê o traço aparecer no seu ecrã...");
const pixelsOf = (page) => page.evaluate(() => {
  const c = document.getElementById("draw-doodle-canvas");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
  return painted;
});
const watcherBefore = await pixelsOf(watcher);
const box = await drawer.locator("#draw-doodle-canvas").boundingBox();
await drawer.mouse.move(box.x + 120, box.y + 140);
await drawer.mouse.down();
await drawer.mouse.move(box.x + 420, box.y + 320, { steps: 18 });
await drawer.mouse.up();
await watcher.waitForTimeout(700);
const watcherAfter = await pixelsOf(watcher);
console.log(`   píxeis pintados no ecrã de quem adivinha: ${watcherBefore} -> ${watcherAfter}`);
if (!(watcherAfter > watcherBefore + 50)) {
  console.log("   FALHOU: o traço NÃO chegou ao ecrã do outro jogador");
  process.exitCode = 1;
} else {
  console.log("   OK: o outro jogador vê mesmo o desenho em tempo real");
}

console.log("7) Quem adivinha não consegue estragar o desenho (não é a vez dele)...");
const pointsBefore = Object.keys((await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code)).draw.doodle.points || {}).length;
const wbox = await watcher.locator("#draw-doodle-canvas").boundingBox();
await watcher.mouse.move(wbox.x + 80, wbox.y + 400);
await watcher.mouse.down();
await watcher.mouse.move(wbox.x + 260, wbox.y + 430, { steps: 8 });
await watcher.mouse.up();
await watcher.waitForTimeout(400);
const pointsAfter = Object.keys((await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code)).draw.doodle.points || {}).length;
console.log(`   pontos: ${pointsBefore} -> ${pointsAfter} (esperado igual)`);
if (pointsAfter !== pointsBefore) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("8) A Forca (quadro do anfitrião) também abre nos dois com 2 jogadores...");
await host.evaluate(async (c) => {
  const m = await import("./js/room.js");
  await m.startQuickBonusGame(c, window.__testDb.get(`rooms/${c}`), "hangman");
}, code);
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
console.log("   OK: ambos no quadro da Forca");
const hostBox = await host.locator("#hangman-doodle-canvas").boundingBox();
const guestBefore = await guest.evaluate(() => {
  const c = document.getElementById("hangman-doodle-canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
});
await host.mouse.move(hostBox.x + 150, hostBox.y + 150);
await host.mouse.down();
await host.mouse.move(hostBox.x + 450, hostBox.y + 350, { steps: 15 });
await host.mouse.up();
await guest.waitForTimeout(700);
const guestAfter = await guest.evaluate(() => {
  const c = document.getElementById("hangman-doodle-canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
});
console.log(`   píxeis no ecrã do convidado: ${guestBefore} -> ${guestAfter}`);
if (!(guestAfter > guestBefore + 50)) { console.log("   FALHOU: o convidado não vê o quadro da Forca"); process.exitCode = 1; }
else console.log("   OK: o convidado vê o quadro da Forca em tempo real");

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
