// Modos do quadro de sala, com DOIS clientes reais. O que interessa provar:
//  - um jogador sozinho NÃO muda o modo de uma sala com duas pessoas (a
//    votação é maioria dos ligados, não "quem carregar primeiro");
//  - quando a maioria vota, o quadro muda para os DOIS ao mesmo tempo;
//  - entrar na Forca tira a caneta a toda a gente até a sala votar em quem
//    fica com ela;
//  - quem tem a caneta vê a versão do desenhador (com as opções da caneta) e
//    quem não tem vê a versão cinzenta, sem elas;
//  - pedir a palavra aparece a toda a gente, pela ordem em que foi pedida.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["Ana", host], ["Beto", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${name}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

console.log("1) Ana cria a sala, Beto entra, e vão para o quadro...");
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

const modeOf = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode, code);
console.log(`   modo inicial: ${await modeOf(host)}`);
if (await modeOf(host) !== "livre") fail("o quadro devia começar em desenho livre");

console.log("2) Quem tem a caneta vê a versão do desenhador; quem não tem, a cinzenta...");
const roleOf = (p) => p.evaluate(() => {
  const sc = document.querySelector('[data-screen="hangman"]');
  return {
    desenhador: sc.classList.contains("hangman-role-drawer"),
    espetador: sc.classList.contains("hangman-role-viewer"),
    opcoesDaCaneta: !document.getElementById("hangman-pen-zone").classList.contains("hidden"),
    botaoModoEmCima: !document.getElementById("hangman-mode-btn").classList.contains("hidden"),
    botaoModoEmBaixo: !document.getElementById("hangman-mode-btn-viewer").classList.contains("hidden"),
  };
});
const rHost = await roleOf(host);
const rGuest = await roleOf(guest);
console.log(`   Ana:  ${JSON.stringify(rHost)}`);
console.log(`   Beto: ${JSON.stringify(rGuest)}`);
if (!rHost.desenhador || !rHost.opcoesDaCaneta) fail("quem tem a caneta devia ver a versão do desenhador com as opções");
if (!rGuest.espetador || rGuest.opcoesDaCaneta) fail("quem não tem a caneta não devia ver as opções da caneta");
// O botão do modo existe nas duas versões, mas em zonas diferentes (2 e a).
if (!rHost.botaoModoEmCima || rHost.botaoModoEmBaixo) fail("no desenhador o botão do modo é o de cima (zona 2)");
// O modo deixou de ser votado: quem não manda no quadro não vê o botão
// nenhum, em vez de o ver e ele não fazer nada ao ser carregado.
if (rGuest.botaoModoEmCima || rGuest.botaoModoEmBaixo) fail("quem não manda no quadro não devia ver o botão do modo");

console.log("3) O modo NÃO se vota: quem manda no quadro muda para todos...");
// Quem não manda no quadro nem sequer vê o botão — em vez de o ver e ele não
// fazer nada ao ser carregado.
const veBotaoModo = await guest.evaluate(() =>
  !document.getElementById("hangman-mode-btn-viewer").classList.contains("hidden")
  || !document.getElementById("hangman-mode-btn").classList.contains("hidden"));
console.log(`   o Beto (sem caneta, sem ser anfitrião) vê o botão do modo: ${veBotaoModo}`);
if (veBotaoModo) fail("quem não manda no quadro não devia ver o botão do modo");

await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });
console.log(`   modo depois de UM clique da Ana: ${await modeOf(host)}`);

console.log("4) E chega logo aos dois clientes...");
await guest.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });
console.log("   os dois clientes estão no mesmo modo");


console.log("4b) Ao entrar na Forca, cada um escolhe a sua cor...");
// A cor é o que faz as letras erradas dizerem QUEM as disse. Vem antes da
// votação da caneta de propósito: os dois ecrãs ao mesmo tempo tapavam-se.
await host.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 5000 });
await guest.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 5000 });
await host.click('[data-color-choice="#b24b38"]');
await host.waitForFunction(() => document.getElementById("hangman-color-overlay").classList.contains("hidden"), { timeout: 5000 });
// A cor já tirada não pode ser escolhida outra vez: duas pessoas da mesma cor
// tornariam as letras erradas ilegíveis, que é a única coisa que a cor faz.
await guest.waitForFunction(() => {
  const b = document.querySelector('[data-color-choice="#b24b38"]');
  return b && b.disabled;
}, { timeout: 8000 });
console.log("   a cor da Ana ficou indisponível para o Beto");
await guest.click('[data-color-choice="#5c7e91"]');
await guest.waitForFunction(() => document.getElementById("hangman-color-overlay").classList.contains("hidden"), { timeout: 5000 });

console.log("4c) E há sempre caminho de volta: entrar na Forca sem querer não tranca...");
// Sem caneta escolhida, quem manda no quadro fica atrás da votação e da
// escolha de cor. Sem esta saída, entrar na Forca por engano trancava a sala.
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 5000 });
if (!(await host.locator("#hangman-backtofree-btn").isVisible())) {
  fail("quem manda no quadro devia poder voltar ao desenho livre");
}
if (await guest.locator("#hangman-backtofree-btn").isVisible()) {
  fail("quem não manda no quadro não devia ver a saída");
}
await host.click("#hangman-backtofree-btn");
await guest.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "livre", code, { timeout: 8000 });
console.log("   voltou ao desenho livre nos dois ecrãs");
// E volta-se a entrar na Forca para o resto do teste.
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await guest.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });

console.log("5) Entrar na Forca tira a caneta até a sala votar...");
const leaderOf = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman?.leaderId || null, code);
console.log(`   quem tem a caneta: ${await leaderOf(host)} (esperado ninguém)`);
if (await leaderOf(host) !== null) fail("ao entrar na Forca a caneta devia ficar por decidir");
// E a votação aparece sozinha, sem ninguém ter de a procurar.
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 5000 });
await guest.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 5000 });
const temFechar = await host.evaluate(() => !document.getElementById("hangman-penvote-cancel-btn").classList.contains("hidden"));
if (temFechar) fail("a votação obrigatória não devia ter botão de fechar");

console.log("6) A caneta passa à MAIORIA, sem esperar por toda a gente...");
// Metade arredondada para cima: numa sala de dois basta um voto. Esperar
// pelos dois seria esperar por 100%, que é o contrário de votar.
const betoId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Beto");
}, code);
await host.click(`[data-pen-vote-choice="${betoId}"]`);
await host.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, betoId], { timeout: 8000 });
console.log("   um voto numa sala de dois chegou: o Beto ficou com a caneta");

console.log("7) Os papéis trocaram nos dois ecrãs...");
await host.waitForTimeout(500);
const rHost2 = await roleOf(host);
const rGuest2 = await roleOf(guest);
console.log(`   Ana:  ${JSON.stringify(rHost2)}`);
console.log(`   Beto: ${JSON.stringify(rGuest2)}`);
if (rHost2.desenhador || rHost2.opcoesDaCaneta) fail("a Ana já não tem a caneta e não devia ver as opções");
if (!rGuest2.desenhador || !rGuest2.opcoesDaCaneta) fail("o Beto tem a caneta e devia ver a versão do desenhador");

console.log("8) Quem não tem a caneta pede a palavra, e todos veem a fila...");
const handVisible = (p) => p.evaluate(() => !document.getElementById("hangman-hand-btn").classList.contains("hidden"));
console.log(`   botão de pedir a palavra — Ana: ${await handVisible(host)}, Beto: ${await handVisible(guest)}`);
if (!(await handVisible(host))) fail("quem não tem a caneta devia poder pedir a palavra");
if (await handVisible(guest)) fail("quem tem a caneta não precisa de pedir a palavra");
await host.click("#hangman-hand-btn");
await guest.waitForFunction(() => document.getElementById("hangman-hand-queue").textContent.includes("Ana"), { timeout: 8000 });
const fila = await guest.locator("#hangman-hand-queue").textContent();
console.log(`   o Beto vê: "${fila.trim()}"`);
if (!fila.includes("Ana")) fail("o pedido de palavra não chegou ao outro jogador");
// E baixar o braço tira-o da fila.
await host.click("#hangman-hand-btn");
await guest.waitForFunction(() => !document.getElementById("hangman-hand-queue").textContent.includes("Ana"), { timeout: 8000 });
console.log("   baixar o braço tira-o da fila: ok");

console.log("9) As ferramentas do quadro: as mesmas do quadro solo, e o MODO manda...");
await guest.click('[data-hangman-color="#b24b38"]');
const corEscolhida = await guest.evaluate(() => document.querySelector('[data-hangman-color="#b24b38"]').getAttribute("aria-pressed"));
if (corEscolhida !== "true") fail("escolher a cor não ficou marcado");
await guest.click('[data-hangman-tool="eraser"]');
const borracha = await guest.evaluate(() => document.querySelector('[data-hangman-tool="eraser"]').getAttribute("aria-pressed"));
if (borracha !== "true") fail("a borracha não ficou selecionada");
// Escolher cor com a borracha na mão volta a escrever.
await guest.click('[data-hangman-color="#5b7442"]');
const borrachaDepois = await guest.evaluate(() => document.querySelector('[data-hangman-tool="eraser"]').getAttribute("aria-pressed"));
if (borrachaDepois !== "false") fail("escolher uma cor devia largar a borracha");

// O modo tira ferramentas do ecrã: na Forca o texto sai, porque quem desenha
// podia escrever a palavra na folha e acabar o jogo no primeiro clique.
const ferramentas = await guest.evaluate(() => {
  const out = {};
  document.querySelectorAll("[data-hangman-tool]").forEach((b) => {
    out[b.dataset.hangmanTool] = !b.classList.contains("hidden");
  });
  return out;
});
console.log(`   ferramentas à vista na Forca: ${Object.entries(ferramentas).filter(([, v]) => v).map(([k]) => k).join(", ")}`);
if (ferramentas.text !== false) fail("o texto não devia estar disponível no modo Forca");
["pen", "marker", "eraser", "line", "rect", "ellipse"].forEach((t) => {
  if (!ferramentas[t]) fail(`a ferramenta "${t}" devia estar disponível`);
});
if ("hand" in ferramentas) fail("a mão de arrastar não faz sentido num quadro sem câmara");

console.log("10) O Beto escreve a palavra — e ela NÃO vai para a sala...");
// A regra mais importante deste modo. Sem servidor, tudo o que fique na sala
// é legível por qualquer jogador que abra as ferramentas do browser. Só a
// FORMA da palavra pode viajar.
await guest.fill("#hangman-word-input", "Dona Manga");
await guest.click("#hangman-word-form button[type=submit]");
await host.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
const salaCrua = JSON.stringify(await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code));
console.log(`   forma na sala: "${await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code)}"`);
if (/dona manga/i.test(salaCrua)) fail("A PALAVRA FOI PARAR À SALA — qualquer jogador a conseguiria ler");
const forma = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
if (forma !== "____ _____") fail(`a forma da palavra está errada: "${forma}"`);

console.log("11) A Ana vê os espaços, com o branco entre as duas palavras...");
await host.waitForSelector("#hangman-word-zone:not(.hidden)", { timeout: 5000 });
const slots = await host.evaluate(() => {
  const els = [...document.querySelectorAll("#hangman-slots .hangman-slot")];
  return {
    total: els.length,
    brancos: els.filter((e) => e.classList.contains("hangman-slot-space")).length,
    preenchidos: els.filter((e) => e.classList.contains("hangman-slot-filled")).length,
  };
});
console.log(`   espaços: ${JSON.stringify(slots)}`);
if (slots.total !== 10) fail(`esperava 10 posições, tenho ${slots.total}`);
if (slots.brancos !== 1) fail("o branco entre as duas palavras devia aparecer");
if (slots.preenchidos !== 0) fail("nenhuma letra devia estar revelada ainda");
// E quem escreveu a palavra não vê a caixa de escrever outra vez, vê as
// ferramentas de arbitrar.
if (await guest.locator("#hangman-word-form").isVisible()) fail("quem já definiu a palavra não devia ver a caixa outra vez");
if (!(await guest.locator("#hangman-word-tools").isVisible())) fail("quem tem a caneta devia ver as ferramentas de arbitrar");

console.log("12) Revelar uma letra chega a toda a gente...");
await guest.fill("#hangman-letter-input", "a");
await guest.click("#hangman-reveal-btn");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("a"), code, { timeout: 8000 });
const depois = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
console.log(`   forma agora: "${depois}"`);
if (depois !== "___a _a__a") fail(`revelar o "a" deu "${depois}"`);
const slots2 = await host.evaluate(() => [...document.querySelectorAll("#hangman-slots .hangman-slot-filled")].map((e) => e.textContent).join(""));
console.log(`   a Ana vê revelado: "${slots2}"`);
if (slots2 !== "aaa") fail("a Ana devia ver os três 'a' revelados");

console.log("12b) O jogador da vez arrisca uma letra CERTA: aparece nos espaços...");
// A palavra é "Dona Manga" e vive só no browser do Beto (que tem a caneta).
// Quem julga é o cliente dele — é o único que a conhece. A Ana só envia a
// letra; nunca chega a ver a palavra.
await host.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await host.fill("#hangman-guess-input", "o");
await host.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("o"), code, { timeout: 8000 });
const comO = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.mask, code);
console.log(`   forma depois do "o": "${comO}"`);
if (!comO.includes("o")) fail("a letra certa não foi revelada");
const erradasDepois = await host.evaluate((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman.wrong || {}), code);
if (erradasDepois.length !== 0) fail("uma letra certa não devia ir para as erradas");

console.log("12c) Uma letra ERRADA sobe para o topo, na cor de quem a disse...");
await host.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await host.fill("#hangman-guess-input", "z");
await host.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.wrong?.z, code, { timeout: 8000 });
const zInfo = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.wrong.z, code);
const anaId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
console.log(`   letra errada guardada: ${JSON.stringify(zInfo)}`);
if (zInfo.uid !== anaId) fail("a letra errada não guardou quem a disse");
// E aparece no topo, com a cor que a Ana escolheu.
await guest.waitForFunction(() => document.querySelectorAll("#hangman-wrong-letters .hangman-wrong-letter").length > 0, { timeout: 8000 });
const corNoEcra = await guest.evaluate(() => {
  const el = document.querySelector("#hangman-wrong-letters .hangman-wrong-letter");
  return { letra: el.textContent, cor: el.style.color };
});
console.log(`   o Beto vê "${corNoEcra.letra}" na cor ${corNoEcra.cor}`);
if (corNoEcra.letra !== "Z") fail("a letra errada devia aparecer no topo");
// #b24b38 é a cor que a Ana escolheu no passo 4b.
if (!/178, ?75, ?56/.test(corNoEcra.cor)) fail(`a letra errada não está na cor da Ana (${corNoEcra.cor})`);
const missesAgora = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.misses, code);
if (missesAgora !== 1) fail(`uma letra errada devia contar 1 erro, conta ${missesAgora}`);

console.log("12d) A mesma letra errada outra vez não conta erro novo...");
// Errar duas vezes a mesma letra é distração, não é uma tentativa a mais.
await host.evaluate(async ({ c, ana }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.resolveGuess(c, r, r.hangman.leaderId, ana, "z", "Dona Manga");
}, { c: code, ana: anaId });
await host.waitForTimeout(400);
const missesRepetida = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.misses, code);
console.log(`   erros depois de repetir o "z": ${missesRepetida} (devia continuar 1)`);
if (missesRepetida !== 1) fail(`repetir a mesma letra contou outro erro (${missesRepetida})`);

console.log("13) Os erros contam-se, e param no máximo...");
for (let i = 0; i < 8; i += 1) await guest.click("#hangman-miss-btn");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.misses || 0) >= 6, code, { timeout: 8000 });
const misses = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman.misses, code);
console.log(`   erros depois de mais 8 cliques: ${misses} (o máximo é 6)`);
if (misses !== 6) fail(`os erros deviam parar em 6, estão em ${misses}`);

console.log("14) Acertar a palavra toda marca-a como resolvida...");
await guest.fill("#hangman-letter-input", "");
await guest.click("#hangman-reveal-btn");
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman.solved === true, code, { timeout: 8000 });
const textoFinal = await host.locator("#hangman-misses").textContent();
console.log(`   a Ana lê: "${textoFinal.trim()}"`);
if (!textoFinal.includes("Acertaram")) fail("o fim de jogo devia aparecer a toda a gente");

console.log("15) 'Outra palavra' limpa tudo e volta à caixa de escrever...");
await guest.click("#hangman-newword-btn");
await host.waitForFunction((c) => !window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
if (!(await guest.locator("#hangman-word-form").isVisible())) fail("devia voltar a caixa de escrever a palavra");
if (await host.locator("#hangman-word-zone").isVisible()) fail("a zona da palavra devia desaparecer sem palavra definida");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-modes FALHOU" : "=> mp-board-modes ok");
