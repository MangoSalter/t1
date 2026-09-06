// O quadro de sala mostra mesmo o que tem — com a tinta já desenhada guardada
// numa tela à parte.
//
// Essa tela existe por causa da velocidade: repintar tudo desde o princípio
// custava 138 ms num quadro cheio, e o ecrã redesenha-se a cada mudança na
// sala, não só quando alguém desenha. O risco de guardar o que já está pintado
// é sempre o mesmo: mostrar uma imagem velha. Por isso este teste olha para os
// PIXÉIS, e não para o que está guardado na sala.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const p = await context.newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

await p.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await p.fill("#name-input", "Ana");
await p.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await p.click("#create-room-btn");
await p.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await p.locator("#lobby-code").textContent()).trim();
await p.click('[data-mp-game="hangman"]');
await p.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
console.log(`1) Sala ${code}, no quadro, em desenho livre...`);

// Quantos pixéis do quadro têm tinta. É a única pergunta que interessa aqui.
const tinta = () => p.evaluate(() => {
  const c = document.getElementById("hangman-doodle-canvas");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
  return n;
});
const desenhar = async (dx) => {
  const caixa = await p.locator("#hangman-doodle-canvas").boundingBox();
  await p.mouse.move(caixa.x + 60 + dx, caixa.y + 60);
  await p.mouse.down();
  for (let i = 1; i <= 12; i += 1) await p.mouse.move(caixa.x + 60 + dx + i * 12, caixa.y + 60 + i * 6);
  await p.mouse.up();
};

const vazio = await tinta();
console.log(`   folha limpa: ${vazio} pixéis com tinta`);
if (vazio !== 0) fail("a folha devia começar limpa");

console.log("2) Desenhar deixa tinta no ecrã...");
await desenhar(0);
await p.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length > 0, code, { timeout: 8000 });
await p.waitForTimeout(300);
const comTraco = await tinta();
console.log(`   depois de desenhar: ${comTraco} pixéis`);
if (comTraco === 0) fail("o traço não apareceu no ecrã");

console.log("3) Uma mudança na sala que NÃO é desenho não pode apagar o traço...");
// É aqui que uma tela guardada mal invalidada se denuncia: o ecrã redesenha-se
// por causa de um erro, de um balão, de uma tentativa — e a tinta tem de ficar.
await p.evaluate((c) => window.__testDb.update(`rooms/${c}/hangman`, { misses: 1 }), code);
await p.waitForTimeout(300);
const depoisDaMudanca = await tinta();
console.log(`   depois de uma mudança na sala: ${depoisDaMudanca} pixéis`);
if (depoisDaMudanca === 0) fail("a tinta desapareceu numa mudança que não era desenho");
if (Math.abs(depoisDaMudanca - comTraco) > comTraco * 0.05) {
  fail(`a tinta mudou sem ninguém desenhar (${comTraco} -> ${depoisDaMudanca})`);
}

console.log("4) Limpar apaga MESMO — a tela guardada não pode teimar...");
p.once("dialog", (d) => d.accept());
await p.click("#hangman-doodle-clear-btn");
await p.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length === 0, code, { timeout: 8000 });
await p.waitForTimeout(300);
const depoisDeLimpar = await tinta();
console.log(`   depois de limpar: ${depoisDeLimpar} pixéis`);
if (depoisDeLimpar !== 0) fail("limpar não apagou o que estava no ecrã");

console.log("5) E desenhar outra vez volta a pintar...");
await desenhar(40);
await p.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length > 0, code, { timeout: 8000 });
await p.waitForTimeout(300);
const outraVez = await tinta();
console.log(`   depois de desenhar outra vez: ${outraVez} pixéis`);
if (outraVez === 0) fail("depois de limpar, o quadro deixou de aceitar traço novo");

console.log("6) Os pontos vão para a rede sem algarismos a mais...");
// Sem arredondar, cada ponto ia com a precisão toda de um número de vírgula
// flutuante: dezassete algarismos para dizer onde está um pixel. Medido, isso
// eram 68 bytes por ponto e ~4 KB/s por pessoa a desenhar — e cada ponto é
// DESCARREGADO por todos os outros da sala. Quatro casas decimais chegam: num
// quadro de 2560 px, um décimo de milésimo é um quarto de pixel.
const casas = await p.evaluate((c) => {
  const pts = window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {};
  let pior = 0;
  let exemplo = "";
  Object.values(pts).forEach((pt) => {
    [pt.x, pt.y].forEach((v) => {
      if (typeof v !== "number") return;
      const d = (String(v).split(".")[1] || "").length;
      if (d > pior) { pior = d; exemplo = String(v); }
    });
  });
  return { pior, exemplo, quantos: Object.keys(pts).length };
}, code);
console.log(`   ${casas.quantos} pontos, no máximo ${casas.pior} casas decimais${casas.exemplo ? ` (ex.: ${casas.exemplo})` : ""}`);
if (casas.quantos === 0) fail("devia haver pontos para medir");
if (casas.pior > 4) fail(`os pontos vão com ${casas.pior} casas decimais — é rede desperdiçada a cada traço`);

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-paint FALHOU" : "=> mp-board-paint ok");
