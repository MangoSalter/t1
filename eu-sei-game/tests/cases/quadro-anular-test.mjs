// ANULAR E VOLTAR A DESENHAR: O QUADRO FICAVA PRESO NO TRAÇO ANTIGO.
//
// O quadro guarda a imagem já pintada numa tela à parte e só a repinta quando
// os pontos da sala mudam — sem isso, um quadro cheio custava 138 ms por
// imagem. Quem decide se mudaram é uma assinatura: quantos pontos há, qual é
// a última chave, e o tamanho da tela.
//
// Fui à procura de um buraco nessa assinatura e NÃO O ENCONTREI, o que também
// se escreve: as chaves são dadas a partir da maior que já existe, e anular
// faz o contador recuar, por isso parecia que anular e voltar a desenhar um
// traço do mesmo tamanho devolveria a assinatura ao valor de antes. Não
// devolve. A assinatura só precisa de ser diferente da ANTERIOR, não de ser
// única para sempre: entre dois estados seguidos há sempre pontos a mais ou a
// menos, e a contagem sozinha chega para os separar. Ficaria com buraco se
// algum dia se passasse a MEXER num ponto já escrito em vez de acrescentar ou
// apagar — e é isso que estes passos vigiam, com píxeis em vez de teoria.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const falhar = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

console.log("1) Sala aberta no quadro...");
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await page.locator("#lobby-code").textContent()).trim();
await page.click('[data-mp-game="hangman"]');
await page.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });

// Dois traços com o MESMO número de pontos, em sítios bem separados: um em
// cima (y=0.25) e outro em baixo (y=0.75).
const PONTOS = 12;
const traco = (y) => Array.from({ length: PONTOS }, (_, i) => ({
  x: 0.2 + (i * 0.5) / (PONTOS - 1), y, newStroke: i === 0, color: "#000000", size: 8,
}));

const escrever = (pontos) => page.evaluate(async ({ c, pts }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.pushHangmanDoodlePoints(c, r, r.hostId, pts);
}, { c: code, pts: pontos });

// Lê a tinta numa faixa horizontal da tela, em coordenadas do desenho.
const tintaEm = (y) => page.evaluate((yRel) => {
  const cv = document.getElementById("hangman-doodle-canvas");
  const ctx = cv.getContext("2d");
  const px = ctx.getImageData(0, Math.round(cv.height * yRel) - 6, cv.width, 12).data;
  let escuros = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 40 && px[i] < 120 && px[i + 1] < 120 && px[i + 2] < 120) escuros++;
  }
  return escuros;
}, y);

console.log("2) Traço em cima; confirma-se que aparece...");
await escrever(traco(0.25));
await page.waitForTimeout(500);
const cimaDepoisDeDesenhar = await tintaEm(0.25);
console.log(`   píxeis escuros na faixa de cima: ${cimaDepoisDeDesenhar}`);
if (cimaDepoisDeDesenhar < 20) falhar("o traço de cima nem sequer apareceu — o resto do teste não diz nada");

console.log("3) Anular. A faixa de cima tem de ficar limpa...");
await page.evaluate(async (c) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.undoLastHangmanStroke(c, r, r.hostId);
}, code);
await page.waitForTimeout(500);
const cimaDepoisDeAnular = await tintaEm(0.25);
const restam = await page.evaluate((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length, code);
console.log(`   píxeis escuros em cima: ${cimaDepoisDeAnular}, pontos na sala: ${restam}`);
if (restam !== 0) falhar("anular devia ter tirado o traço da sala");
if (cimaDepoisDeAnular > 20) falhar("anular não limpou o ecrã");

console.log("4) O ESSENCIAL: novo traço EM BAIXO, com o mesmo número de pontos...");
await escrever(traco(0.75));
await page.waitForTimeout(500);
const baixo = await tintaEm(0.75);
const cimaOutraVez = await tintaEm(0.25);
console.log(`   píxeis escuros em baixo: ${baixo} (é onde o traço novo está)`);
console.log(`   píxeis escuros em cima:  ${cimaOutraVez} (é onde estava o traço anulado)`);
if (baixo < 20) falhar("o traço novo não apareceu: a tela guardada ficou presa na imagem anterior");
if (cimaOutraVez > 20) falhar("o traço anulado voltou ao ecrã");

console.log("5) E o mesmo pelo caminho normal, com a borracha a limpar tudo pelo meio...");
await page.evaluate(async (c) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.clearHangmanDoodle(c, r, r.hostId);
}, code);
await page.waitForTimeout(400);
await escrever(traco(0.5));
await page.waitForTimeout(500);
const meio = await tintaEm(0.5);
console.log(`   píxeis escuros no meio: ${meio}`);
if (meio < 20) falhar("depois de limpar, o quadro não voltou a desenhar");

// O QUE A TELA GUARDADA PROMETE: repintar não pode depender do que lá está.
//
// O quadro já regrediu uma vez para 138 ms por imagem e ninguém deu por isso a
// ler código. A tela guardada é o que o segura: os pontos que já vieram da
// sala pintam-se UMA vez para uma tela à parte, e a cada mudança copia-se essa
// tela de uma assentada. É invisível quando funciona, e é por isso que precisa
// de vigia.
//
// Conta-se o NÚMERO DE TRAÇOS pedidos à tela, não milissegundos. Milissegundos
// aqui mentem: a primeira versão deste passo mediu 15 ms por mudança num
// quadro cheio contra 0,4 num vazio e parecia um desastre — mas 9,5 desses 15
// eram o stub a serializar a base de dados inteira (749 KB) para o
// localStorage a cada escrita, coisa que só existe nos testes. Sobravam 2,8 ms
// de aplicação. Uma contagem de traços não depende da máquina, nem do stub,
// nem de haver placa gráfica: com a tela guardada é uma cópia e zero traços,
// sem ela são milhares.
const tracosNumaMudanca = (c) => page.evaluate((code) => {
  const P = CanvasRenderingContext2D.prototype;
  const orig = { stroke: P.stroke, drawImage: P.drawImage };
  let tracos = 0, copias = 0;
  P.stroke = function (...a) { tracos++; return orig.stroke.apply(this, a); };
  P.drawImage = function (...a) { copias++; return orig.drawImage.apply(this, a); };
  window.__testDb.update(`rooms/${code}/hangman`, { aquecer: 1 });   // assinatura estabiliza
  tracos = 0; copias = 0;
  window.__testDb.update(`rooms/${code}/hangman`, { medicao: 1 });
  P.stroke = orig.stroke; P.drawImage = orig.drawImage;
  return { tracos, copias };
}, c);

console.log("6) Repintar o quadro não pode custar mais por ele estar cheio...");
await page.evaluate(async (c) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.clearHangmanDoodle(c, r, r.hostId);
}, code);
await page.waitForTimeout(300);
const comNada = await tracosNumaMudanca(code);

await page.evaluate(async (c) => {
  const m = await import("./js/room.js");
  const N = 8000;
  const pts = Array.from({ length: N }, (_, i) => ({
    x: 0.05 + 0.9 * ((i * 37) % 500) / 500, y: 0.05 + 0.9 * ((i * 61) % 500) / 500,
    newStroke: i % 40 === 0, color: "#000000", size: 6,
  }));
  for (let i = 0; i < N; i += 500) {          // aos bocados, como vem da rede
    const r = window.__testDb.get(`rooms/${c}`);
    await m.pushHangmanDoodlePoints(c, r, r.hostId, pts.slice(i, i + 500));
  }
}, code);
await page.waitForTimeout(800);
const cheio = await page.evaluate((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length, code);
const comTudo = await tracosNumaMudanca(code);

console.log(`   quadro vazio: ${comNada.tracos} traços, ${comNada.copias} cópias de tela`);
console.log(`   ${cheio} pontos: ${comTudo.tracos} traços, ${comTudo.copias} cópias de tela`);
if (cheio < 7000) falhar(`só entraram ${cheio} pontos — a medição não diz nada`);
// Uma folga generosa: o que se quer apanhar é a diferença entre uma cópia e
// oito mil traços, não uma dúzia a mais por causa de um botão qualquer.
if (comTudo.tracos > comNada.tracos + 50) {
  falhar(`repintar um quadro cheio pediu ${comTudo.tracos} traços contra ${comNada.tracos} num vazio — a tela guardada deixou de segurar o quadro`);
}
if (comTudo.copias < 1) falhar("um quadro cheio devia repintar-se copiando a tela guardada, e não copiou nada");

console.log("7) E o desenho continua lá depois de tudo isto...");
const aindaDesenhado = await tintaEm(0.5);
console.log(`   píxeis escuros no meio: ${aindaDesenhado}`);
if (aindaDesenhado < 20) falhar("o quadro apagou-se algures pelo caminho");

await browser.close();
const reais = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
