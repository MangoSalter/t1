// QUEM ACERTOU, na Forca.
//
// Defeito apanhado pelo dono a jogar: "dentro do jogo da forca, não dá para
// definir um vencedor e passar a caneta caso esteja ativo".
//
// A causa: na Forca os palpites são em VOZ ALTA. A app não tem como saber
// quem acertou — só quem tem a caneta é que ouviu. Carregar em "Acertaram"
// revelava a palavra e mais nada: a ronda acabava sem vencedor, ninguém
// levava pontos, o histórico ficava sem dono, e a volta da caneta não tinha
// mérito nenhum em que se basear.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext();
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const ana = await ctx.newPage(); const beto = await ctx.newPage();
const erros = [];
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  p.on("pageerror", (e) => erros.push(`${nome}: ${e.message}`));
}

console.log("1) Sala com a Ana (caneta) e o Beto, no modo Forca...");
await ana.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
await beto.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await beto.fill("#name-input", "Beto");
await beto.fill("#join-code-input", code);
await beto.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await beto.click("#join-room-btn");
await beto.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await ana.click('[data-mp-game="hangman"]');
await ana.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
await beto.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
const sala = () => ana.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
let room = await sala();
const anaUid = room.hostId;
const betoUid = Object.keys(room.players).find((u) => u !== anaUid);
await ana.evaluate((c) => { window.__testDb.update(`rooms/${c}/hangman`, { mode: "forca" }); }, code);
await ana.waitForTimeout(700);

console.log("2) Cada um escolhe a sua cor (o modo pede-a antes de deixar jogar)...");
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  await p.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
  await p.evaluate(() => document.querySelector("#hangman-color-choices button").click());
  await p.waitForTimeout(300);
  console.log(`   ${nome} escolheu`);
}
await ana.waitForTimeout(400);

console.log("3) A Ana põe a palavra e o Beto vê os espaços, sem a palavra...");
await ana.fill("#hangman-word-input", "gato");
await ana.evaluate(() => document.getElementById("hangman-word-form").requestSubmit());
await ana.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
room = await sala();
console.log(`   máscara na sala: "${room.hangman.mask}" (a palavra não pode lá estar)`);
if (/gato/i.test(JSON.stringify(room.hangman))) fail("a palavra não pode viajar para a sala");

console.log("4) 'Acertaram' sem letra pergunta QUEM — era isto que faltava...");
await ana.click("#hangman-reveal-btn");
await ana.waitForSelector("#hangman-winner-overlay:not(.hidden)", { timeout: 5000 });
const nomes = await ana.locator("#hangman-winner-choices button").allTextContents();
console.log(`   a escolher entre: ${JSON.stringify(nomes)}`);
if (!nomes.includes("Beto")) fail("o Beto devia estar na lista de quem pode ter acertado");
if (nomes.includes("Ana")) fail("quem tem a caneta sabe a palavra — não se pode dar pontos a si própria");

console.log("5) Escolher o Beto dá-lhe a palavra, os pontos e o nome no fim da ronda...");
const antes = (await sala()).hangman.matchScore?.[betoUid] || 0;
await ana.evaluate(() => [...document.querySelectorAll("#hangman-winner-choices button")]
  .find((b) => b.textContent.trim() === "Beto").click());
await ana.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.solved === true, code, { timeout: 8000 });
room = await sala();
const depois = room.hangman.matchScore?.[betoUid] || 0;
console.log(`   vencedor: ${room.hangman.winnerUid === betoUid ? "Beto" : room.hangman.winnerUid}, pontos do Beto: ${antes} -> ${depois}`);
if (room.hangman.winnerUid !== betoUid) fail("o vencedor devia ser o Beto");
if (depois <= antes) fail("quem acerta a palavra tem de levar pontos");
// E o Beto vê que foi ele, no ecrã dele.
const disseAoBeto = await beto.locator("#hangman-misses").textContent();
console.log(`   o ecrã do Beto diz: "${disseAoBeto.trim()}"`);
if (!/adivinh|ganh|🎉/i.test(disseAoBeto)) fail("o Beto devia saber que foi ele");

console.log("6) E 'ninguém acertou' revela a palavra sem dar pontos a ninguém...");
// A Ana ainda tem a caneta: põe outra palavra e desta vez ninguém acerta.
await ana.click("#hangman-newword-btn");
await ana.waitForFunction((c) => !window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
await ana.waitForTimeout(400);
await ana.fill("#hangman-word-input", "casa");
await ana.evaluate(() => document.getElementById("hangman-word-form").requestSubmit());
await ana.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
const antesDeDesistir = (await sala()).hangman.matchScore || {};
await ana.click("#hangman-reveal-btn");
await ana.waitForSelector("#hangman-winner-overlay:not(.hidden)", { timeout: 5000 });
await ana.click("#hangman-winner-none-btn");
await ana.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.solved === true, code, { timeout: 8000 });
room = await sala();
console.log(`   vencedor: ${room.hangman.winnerUid}, pontos: ${JSON.stringify(room.hangman.matchScore || {})}`);
if (room.hangman.winnerUid) fail("desistir não pode inventar um vencedor");
if (JSON.stringify(room.hangman.matchScore || {}) !== JSON.stringify(antesDeDesistir)) {
  fail("desistir não pode mexer nos pontos");
}

console.log("7) Com a volta da caneta ligada, começar outra palavra passa-a mesmo...");
// A caneta passa ao COMEÇAR a palavra seguinte, não ao acabar a anterior: é
// aí que a volta se dá. Que ela vá para QUEM ACERTOU está provado à parte, no
// test-board-votes, onde a regra se lê sem browser nenhum.
await ana.evaluate((c) => {
  // As definições do quadro são planas: settings.autoPen, e não
  // settings.forca.autoPen. Escrito na forma errada, o teste dizia que a
  // volta estava ligada e ela estava desligada — e passava por engano.
  window.__testDb.update(`rooms/${c}/hangman/settings`, { autoPen: 1 });
}, code);
await ana.waitForTimeout(400);
await ana.click("#hangman-newword-btn");
await ana.waitForFunction((c, anaId) => window.__testDb.get(`rooms/${c}`).hangman?.leaderId !== anaId,
  code, anaUid, { timeout: 8000 }).catch(() => {});
await ana.waitForTimeout(600);
room = await sala();
const passou = room.hangman.leaderId === betoUid;
console.log(`   caneta agora com: ${passou ? "Beto" : "ainda a Ana"}`);
if (!passou) fail("com a volta ligada, começar outra palavra devia passar a caneta");
// E quem recebe a caneta pode mesmo usá-la: é o que faltava confirmar.
await beto.waitForSelector("#hangman-word-input", { state: "visible", timeout: 8000 })
  .catch(() => fail("quem recebeu a caneta devia poder escrever a palavra"));
console.log("   e o Beto pode escrever a palavra seguinte");

if (erros.length) fail(`erros de JavaScript: ${erros[0]}`);
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
