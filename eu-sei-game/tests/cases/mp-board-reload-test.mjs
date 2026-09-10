// O que acontece quando quem tem a caneta recarrega a página a meio do jogo.
// A palavra vive SÓ no browser dele (nunca entra na sala), por isso um F5
// podia deixar o jogo pendurado: a forma continuava na sala mas o único
// browser capaz de julgar as tentativas já não sabia a resposta.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["Ana", host], ["Beto", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${name}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

console.log("1) Sala, quadro, modo Forca, cores e caneta para a Ana...");
await host.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
await guest.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.click('[data-mp-game="hangman"]');
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await host.click('[data-color-choice="#b24b38"]');
await guest.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await guest.click('[data-color-choice="#5c7e91"]');
const anaId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await host.click(`[data-pen-vote-choice="${anaId}"]`);
await host.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, anaId], { timeout: 8000 });

console.log("2) A Ana define a palavra e o Beto acerta uma letra...");
await host.fill("#hangman-word-input", "banana");
await host.click("#hangman-word-form button[type=submit]");
await guest.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
await guest.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await guest.fill("#hangman-guess-input", "a");
await guest.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("a"), code, { timeout: 8000 });
const antes = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
console.log(`   forma antes do F5: "${antes}"`);

console.log("3) A ANA RECARREGA A PÁGINA a meio do jogo...");
// Recarregar tem de a devolver À SALA, e não ao ecrã inicial. Sem isso, o
// resto deste teste não faz sentido nenhum: quem recarrega fica de fora do
// jogo e a recuperação da palavra nunca chega a acontecer.
await host.reload({ waitUntil: "networkidle" });
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 10000 });
console.log("   voltou sozinha para a sala, no ecrã do quadro");
// A forma da palavra continua na sala, como deve.
const depois = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
console.log(`   forma depois do F5: "${depois}"`);
if (depois !== antes) fail("a forma da palavra não sobreviveu ao recarregamento");

console.log("4) E a Ana continua a conseguir arbitrar — o jogo não fica pendurado...");
// Este é o teste que interessa: o Beto arrisca outra letra e ela TEM de ser
// julgada. Antes, a tentativa ficava para sempre "a ser verificada".
await guest.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
await guest.fill("#hangman-guess-input", "n");
await guest.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("n"), code, { timeout: 10000 });
const comN = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
console.log(`   forma depois de arriscar "n": "${comN}"`);
if (!comN.includes("n")) fail("depois do recarregamento a tentativa deixou de ser julgada");
// E a tentativa foi mesmo consumida, não ficou pendurada.
const pendentes = await host.evaluate((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman.guesses || {}).length, code);
if (pendentes !== 0) fail(`ficaram ${pendentes} tentativas por resolver`);

console.log("5) Se a palavra guardada não servir, o quadro DIZ que se perdeu...");
// Apagar o que está guardado no browser simula o caso em que não há como
// recuperar (armazenamento bloqueado, outro dispositivo). O jogo não pode
// ficar calado: tem de pedir a palavra outra vez.
// Apagar e recarregar em passos separados: chamar location.reload() de dentro
// de um evaluate destrói o contexto a meio da chamada e a corrida seguinte
// fica indefinida.
// sessionStorage e não localStorage: a palavra é guardada por SEPARADOR,
// para o separador do lado (outra pessoa, no mesmo computador) não a herdar.
await host.evaluate(() => sessionStorage.removeItem("euSei_hangmanSecret"));
await host.reload({ waitUntil: "networkidle" });
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 10000 });
await host.waitForFunction(() => document.getElementById("hangman-status").textContent.includes("Não tenho a palavra"), { timeout: 10000 });
const aviso = await host.locator("#hangman-status").textContent();
console.log(`   a Ana lê: "${aviso.trim()}"`);
if (!(await host.locator("#hangman-word-form").isVisible())) {
  fail("devia voltar a caixa de escrever a palavra");
}
if (await host.locator("#hangman-word-tools").isVisible()) {
  fail("as ferramentas de arbitrar não fazem nada sem a palavra e não deviam aparecer");
}

console.log("6) Reescrever a MESMA palavra retoma o jogo onde estava...");
const estadoAntes = await host.evaluate((c) => {
  const h = window.__testDb.get(`rooms/${c}`).hangman;
  return { mask: h.mask, misses: h.misses || 0 };
}, code);
await host.fill("#hangman-word-input", "banana");
await host.click("#hangman-word-form button[type=submit]");
await host.waitForFunction(() => !document.getElementById("hangman-word-tools").classList.contains("hidden"), { timeout: 8000 });
const estadoDepois = await host.evaluate((c) => {
  const h = window.__testDb.get(`rooms/${c}`).hangman;
  return { mask: h.mask, misses: h.misses || 0 };
}, code);
console.log(`   antes: ${JSON.stringify(estadoAntes)}, depois: ${JSON.stringify(estadoDepois)}`);
if (estadoDepois.mask !== estadoAntes.mask) {
  fail("reescrever a mesma palavra apagou as letras já reveladas");
}

console.log("7) E quem sai da sala com a palavra na mão não a leva para a sala seguinte...");
// A palavra vive numa variável do módulo, e uma variável de módulo não sabe
// quando acaba a sala. Saindo pelo lobby — sem F5, que é o que a limpava por
// acidente — chegava-se à sala seguinte com a palavra da partida anterior na
// mão: o ecrã dava-a por sabida, nem pedia para a reescrever, e arbitrava as
// tentativas de toda a gente contra a palavra errada.
//
// Cena nova em vez de continuar a de cima: depois de dois F5 a Ana já não é
// a anfitriã (a sala guarda o uid de antes), e sair para o lobby é de quem
// manda.
const carla = await context.newPage();
const dinis = await context.newPage();
for (const [nome, p] of [["Carla", carla], ["Dinis", dinis]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}
await carla.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await carla.fill("#name-input", "Carla");
await carla.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await carla.click("#create-room-btn");
await carla.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
const salaA = (await carla.locator("#lobby-code").textContent()).trim();
await dinis.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await dinis.fill("#name-input", "Dinis");
await dinis.fill("#join-code-input", salaA);
await dinis.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await dinis.click("#join-room-btn");
await dinis.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
await carla.click('[data-mp-game="hangman"]');
await carla.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
await dinis.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
await carla.click("#hangman-mode-btn");
await carla.click('[data-mode-choice="forca"]');
await carla.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await carla.click('[data-color-choice="#b24b38"]');
await dinis.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await dinis.click('[data-color-choice="#5c7e91"]');
const carlaId = await carla.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Carla");
}, salaA);
await carla.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await carla.click(`[data-pen-vote-choice="${carlaId}"]`);
await carla.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [salaA, carlaId], { timeout: 8000 });
await carla.fill("#hangman-word-input", "banana");
await carla.click("#hangman-word-form button[type=submit]");
await carla.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, salaA, { timeout: 8000 });

// Sai para o lobby e depois da sala, sem nunca recarregar a página.
await carla.click("#options-fab");
await carla.waitForSelector("#options-overlay:not(.hidden)", { timeout: 5000 });
await carla.click("#options-back-btn");
await carla.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
await carla.click('[data-screen="lobby"] [data-leave]');
await carla.waitForSelector('[data-screen="home"].active', { timeout: 8000 });
await carla.fill("#name-input", "Carla");
await carla.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await carla.click("#create-room-btn");
await carla.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
const salaB = (await carla.locator("#lobby-code").textContent()).trim();
await carla.click('[data-mp-game="hangman"]');
await carla.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
// A folha da sala nova é de OUTRA palavra, com o mesmo número de letras que
// "banana" para o engano ser o mais parecido possível com o verdadeiro.
await carla.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  const eu = r.hostId;
  window.__testDb.update(`rooms/${c}/hangman`, {
    mode: "forca", leaderId: eu, mask: "______", colors: { [eu]: "#b24b38" },
  });
}, salaB);
await carla.waitForTimeout(600);
const naSalaNova = await carla.evaluate(() => ({
  aviso: document.getElementById("hangman-status").textContent.trim(),
  etiqueta: document.getElementById("hangman-secret").textContent.trim(),
  pedeAPalavra: !document.getElementById("hangman-word-form").classList.contains("hidden"),
}));
console.log(`   a Carla lê: "${naSalaNova.aviso}" · etiqueta: "${naSalaNova.etiqueta}" · pede a palavra: ${naSalaNova.pedeAPalavra}`);
if (/banana/i.test(naSalaNova.etiqueta)) {
  fail("a palavra da sala anterior seguiu a Carla para a sala nova");
}
if (!naSalaNova.pedeAPalavra) {
  fail("a folha é de outra palavra: o quadro tinha de pedir a palavra outra vez");
}

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-reload FALHOU" : "=> mp-board-reload ok");
