// O ÁLBUM DA NOITE.
//
// A classificação diz quem ganhou; o que as pessoas mandam aos amigos no dia
// seguinte é o desenho. Os jogos vizinhos que têm isto fazem dele o fim da
// partida. Aqui o álbum vive no browser de cada um — cada cliente já recebeu
// os traços enquanto eram feitos —, por isso o que este teste guarda é que a
// fotografia é TIRADA (e com tinta lá dentro, não uma folha em branco).
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const erros = [];
const falhar = (m) => { console.log(`   FALHOU: ${m}`); process.exitCode = 1; };
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => erros.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await page.reload({ waitUntil: "networkidle" });

console.log("1) Sala com Desenha e Adivinha, até ao quadro...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await page.locator("#lobby-code").textContent()).trim();
await page.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${c}/config`, { bonusGames: ["draw"] });
}, code);
const rondas = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`).config.numRounds, code);
await page.evaluate(({ c, n }) => window.__testDb.update(`rooms/${c}`, { round: n, state: "roundScore" }), { c: code, n: rondas });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 5000 });
await page.click("#round-next-btn");
await page.waitForSelector('[data-screen="draw"].active', { timeout: 5000 });

console.log("2) Desenhar (traços escritos na sala, como os que chegam de outro telemóvel)...");
await page.evaluate((c) => {
  const pontos = {};
  // Um X grosso de canto a canto: tinta que se vê em qualquer miniatura.
  let i = 0;
  const por = (x, y, novo) => { pontos[`p${String(i++).padStart(6, "0")}`] = { x, y, newStroke: !!novo }; };
  for (let k = 0; k <= 20; k += 1) por(0.15 + (k / 20) * 0.7, 0.15 + (k / 20) * 0.7, k === 0);
  for (let k = 0; k <= 20; k += 1) por(0.85 - (k / 20) * 0.7, 0.15 + (k / 20) * 0.7, k === 0);
  window.__testDb.update(`rooms/${c}/draw/doodle`, { points: pontos });
}, code);
await page.waitForTimeout(500);

console.log("3) Fechar a ronda com alguém a acertar...");
// A ordem das vezes é sorteada: quem desenha nesta ronda pode ser qualquer um
// dos três. Ler o nome em vez de o adivinhar — escrevi "Ana" à mão e passou
// uma vez por sorte, até a vez calhar à Carla.
const { palavra, quemDesenha } = await page.evaluate((c) => {
  const sala = window.__testDb.get(`rooms/${c}`);
  return { palavra: sala.draw.secretWord, quemDesenha: sala.players[sala.draw.drawerId].name };
}, code);
await page.evaluate((c) => {
  const sala = window.__testDb.get(`rooms/${c}`);
  window.__testDb.update(`rooms/${c}/draw`, { resolved: true, roundWinnerId: "p2" });
  return sala;
}, code);
await page.waitForTimeout(600);

console.log("4) Ecrã final: o álbum tem a fotografia, com tinta lá dentro...");
await page.evaluate((c) => window.__testDb.update(`rooms/${c}`, { state: "final" }), code);
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
const album = await page.evaluate(() => {
  const sec = document.getElementById("final-album");
  const imgs = [...document.querySelectorAll("#final-album-grid img")];
  return {
    escondido: sec.classList.contains("hidden"),
    quantos: imgs.length,
    ehPng: imgs[0]?.src.startsWith("data:image/png") || false,
    tamanho: imgs[0]?.src.length || 0,
    legenda: document.querySelector("#final-album-grid figcaption")?.textContent || "",
  };
});
console.log(`   quem desenhou: ${quemDesenha}`);
console.log(`   escondido: ${album.escondido}, desenhos: ${album.quantos}, PNG: ${album.ehPng}, legenda: "${album.legenda}"`);
if (album.escondido) falhar("o álbum devia aparecer quando há desenhos");
if (album.quantos !== 1) falhar(`devia ter um desenho, tem ${album.quantos}`);
if (!album.ehPng) falhar("a fotografia devia ser um PNG");
if (!album.legenda.includes(palavra) || !album.legenda.includes(quemDesenha) || !album.legenda.includes("Beto")) {
  falhar(`a legenda devia dizer a palavra, quem desenhou e quem acertou (tem "${album.legenda}")`);
}

// A folha em branco também dá um PNG válido: o que interessa é haver TINTA.
// Sem isto, o teste passava com o álbum a guardar quadrados vazios.
const tinta = await page.evaluate(() => new Promise((resolve) => {
  const img = document.querySelector("#final-album-grid img");
  const c = document.createElement("canvas");
  const i = new Image();
  i.onload = () => {
    c.width = i.naturalWidth; c.height = i.naturalHeight;
    const cx = c.getContext("2d");
    cx.drawImage(i, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let escuros = 0;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k] < 120 && d[k + 1] < 120 && d[k + 2] < 120) escuros += 1;
    }
    resolve({ escuros, total: c.width * c.height });
  };
  i.src = img.src;
}));
console.log(`   píxeis escuros na miniatura: ${tinta.escuros} de ${tinta.total}`);
if (tinta.escuros < 100) falhar("a fotografia saiu em branco — o álbum estaria a guardar folhas vazias");

console.log("5) Guardar o desenho é um alvo de dedo...");
const alvo = await page.evaluate(() => {
  const b = document.querySelector(".album-guardar");
  const r = b.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width) };
});
console.log(`   botão de guardar: ${alvo.h}x${alvo.w}`);
if (alvo.h < 44 || alvo.w < 44) falhar("o botão de guardar tem de se acertar com o dedo");

await browser.close();
const reais = erros.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
