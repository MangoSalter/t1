// "ONDE FICA ISTO?" DESENHADO — o que substituiu a escolha múltipla.
//
// O que este caso guarda, e que a versão anterior não podia ter: o desenho é
// feito na hora por uma pessoa, e o desenho pronto do data.js só aparece NO
// FIM, com o nome e o país. Enquanto era pergunta, quem já tinha visto aquele
// monumento sabia a resposta antes de ler as opções — o jogo morria à segunda
// partida. Sendo resposta, é onde se aprende.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const falhar = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

// De propósito SEM ?oficina=1: este jogo tem de estar à vista de quem entra no
// site. Se voltar para a oficina, o clique do passo 2 não encontra o botão.
await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Ana cria a sala e entram mais dois...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = (await page.locator("#lobby-code").textContent()).trim();
const hostId = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`).hostId, code);
await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
  p2: { name: "Beto", score: 0, connected: true },
  p3: { name: "Carla", score: 0, connected: true },
}), code);
await page.waitForTimeout(200);

console.log("2) O botão está no menu do site e leva ao ecrã de desenho...");
await page.click('[data-mp-game="marcos"]');
await page.waitForSelector('[data-screen="draw"].active', { timeout: 3000 });
let room = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   estado da sala: "${room.state}", tema: "${room.draw?.tema}"`);
if (room.state !== "draw" || room.draw.tema !== "marcos") falhar("devia abrir o desenho com o tema dos marcos");

// A Ana passa a ser quem desenha, para o caso percorrer sempre o caminho todo.
await page.evaluate(({ c, h }) => window.__testDb.update(`rooms/${c}/draw`, { drawerId: h }), { c: code, h: hostId });
await page.waitForTimeout(150);

console.log("3) O que sai é um MARCO do baralho, não uma palavra solta...");
room = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const marco1 = await page.evaluate(async (id) => {
  const { LANDMARKS } = await import("./js/data.js");
  return LANDMARKS.find((l) => l.id === id) || null;
}, room.draw.landmarkId);
console.log(`   marco: "${room.draw.landmarkId}" -> ${marco1?.name} (${marco1?.answer})`);
if (!marco1) falhar("a ronda devia trazer o id de um marco do baralho");
else if (room.draw.secretWord !== marco1.name) falhar("a palavra secreta devia ser o nome do marco");

console.log("4) O ESSENCIAL: enquanto se joga, o desenho pronto NÃO se vê...");
const revelaEscondida = await page.evaluate(() => document.getElementById("draw-reveal").classList.contains("hidden"));
const svgsNoEcra = await page.evaluate(() => document.querySelectorAll("#draw-reveal svg").length);
console.log(`   cartão de revelação escondido: ${revelaEscondida}, svgs lá dentro: ${svgsNoEcra}`);
if (!revelaEscondida) falhar("o desenho de referência não pode aparecer antes de a ronda fechar");

console.log("5) Quem desenha vê o monumento E o país (é quem julga); os outros só sabem de quem é a vez...");
const estadoDesenhadora = await page.locator("#draw-status").textContent();
console.log(`   estado (Ana, que desenha): "${estadoDesenhadora}"`);
if (!estadoDesenhadora.includes(marco1.name)) falhar("quem desenha devia ver o nome do monumento");
if (!estadoDesenhadora.includes(marco1.answer)) falhar("quem desenha devia ver o país, para poder julgar");
const titulo = await page.locator("#draw-title").textContent();
console.log(`   título do ecrã: "${titulo}"`);
if (!titulo.includes("Onde Fica Isto?")) falhar("o ecrã devia chamar-se pelo nome do jogo");

console.log("6) Ana desenha e dá a ronda a quem acertou o país...");
const caixa = await page.locator("#draw-doodle-canvas").boundingBox();
await page.mouse.move(caixa.x + 100, caixa.y + 100);
await page.mouse.down();
await page.mouse.move(caixa.x + 280, caixa.y + 220, { steps: 8 });
await page.mouse.up();
await page.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).draw.doodle.points || {}).length > 0, code, { timeout: 3000 });
await page.click("#draw-select-winner-btn");
await page.waitForSelector("#draw-winner-overlay:not(.hidden)", { timeout: 3000 });
await page.locator("#draw-winner-list button", { hasText: "Beto" }).click();
await page.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).draw.resolved === true, code, { timeout: 3000 });
room = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   Beto: ${room.players.p2.score} pts, Ana (desenhou): ${room.players[hostId].score} pts`);
if (room.players.p2.score !== 15 || room.players[hostId].score !== 8) falhar("pontuação inesperada (15 a quem acerta, 8 a quem desenha)");

console.log("7) O ESSENCIAL: agora sim, o desenho pronto aparece, com o nome e o país...");
const revelado = await page.evaluate(() => {
  const el = document.getElementById("draw-reveal");
  const r = el.getBoundingClientRect();
  return { escondido: el.classList.contains("hidden"), svgs: el.querySelectorAll("svg").length, largura: Math.round(r.width), altura: Math.round(r.height) };
});
const resultado = await page.locator("#draw-result").textContent();
console.log(`   revelação: ${JSON.stringify(revelado)}`);
console.log(`   texto: "${resultado}"`);
if (revelado.escondido || revelado.svgs !== 1) falhar("o desenho de referência devia aparecer no fim da ronda");
// Já aconteceu uma vez com a paleta: o elemento existe, tem svg lá dentro e
// mede dois píxeis. Estar no DOM não é estar à vista.
if (revelado.largura < 80 || revelado.altura < 80) falhar(`o cartão saiu com ${revelado.largura}x${revelado.altura}px — pequeno demais para se ver o monumento`);
// Sem distinguir maiúsculas: as frases do baralho são escritas a correr
// ("Era o monte Fuji", "Eram os moais da Ilha da Páscoa"), e é assim que se
// escreve em português — o nome no meio da frase não leva maiúscula.
const resultadoBaixo = resultado.toLowerCase();
if (!resultadoBaixo.includes(marco1.name.toLowerCase()) || !resultadoBaixo.includes(marco1.answer.toLowerCase())) {
  falhar("o resultado devia dizer o nome do monumento e o país");
}

console.log("8) Ronda seguinte: outro marco, e o desenho anterior sai do ecrã...");
await page.click("#draw-continue-btn");
await page.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).draw.turnIndex === 1, code, { timeout: 3000 });
room = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const escondeuOutraVez = await page.evaluate(() => document.getElementById("draw-reveal").classList.contains("hidden"));
console.log(`   marco novo "${room.draw.landmarkId}" (antes "${marco1.id}"), usados: ${JSON.stringify(room.draw.usedWords)}`);
console.log(`   revelação escondida outra vez: ${escondeuOutraVez}`);
if (room.draw.landmarkId === marco1.id) falhar("repetiu o mesmo monumento");
if (!room.draw.usedWords.includes(marco1.id)) falhar("o marco usado devia ficar na lista, senão volta a sair");
if (!escondeuOutraVez) falhar("a revelação da ronda anterior ficou no ecrã");
if (Object.keys(room.draw.doodle.points || {}).length !== 0) falhar("o quadro devia ficar limpo");

console.log("9) Um baralho pequeno não pode encravar: com todos os marcos usados, ainda sorteia...");
const aguenta = await page.evaluate(async () => {
  const { LANDMARKS } = await import("./js/data.js");
  const { sortearRondaDeDesenho } = await import("./js/room.js");
  const todos = LANDMARKS.map((l) => l.id);
  const r = sortearRondaDeDesenho("marcos", todos);
  return { total: todos.length, id: r.landmarkId, palavra: r.secretWord };
});
console.log(`   com os ${aguenta.total} marcos já usados, saiu "${aguenta.id}"`);
if (!aguenta.id || !aguenta.palavra) falhar("com o baralho esgotado devia recomeçar, não devolver vazio");

await browser.close();
const reais = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
