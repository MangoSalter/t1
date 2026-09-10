// O QUE SE LÊ ENQUANTO SE JOGA, E NÃO SÓ AO ABRIR.
//
// O linguas-ecra-test abre a app e percorre os ecrãs, e por isso só vê o que
// existe ANTES de alguém jogar. Está em zero, e mesmo assim quem joga em
// inglês continua a ler português a meio de uma ronda: os estados dos
// mini-jogos, o porquê dos pontos, as falas da casa — nada disso existe até
// alguém carregar num botão.
//
// Este caso JOGA em inglês e procura palavras que só existem em português.
// Não pergunta se um texto está traduzido (não sabe) — pergunta se aparece
// uma palavra que nenhuma tradução inglesa produziria. É grosseiro de
// propósito: dá poucos falsos positivos e diz exatamente onde olhar.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const erros = [];
function check(label, cond, extra = "") {
  if (cond) console.log(`OK: ${label}`);
  else { console.error(`FALHOU: ${label}${extra ? ` — ${extra}` : ""}`); erros.push(label); }
}

// Palavras que só um texto português produz. Nada de "de", "a", "e" — essas
// aparecem em nomes próprios e em espanhol; estas não aparecem em inglês
// nenhum. A lista é curta e cada entrada foi escolhida por não colidir.
const SO_PORTUGUES = [
  // Gramática: nenhuma destas é palavra inglesa, e uma frase portuguesa
  // dificilmente escapa a todas. A primeira versão desta lista tinha
  // trinta e tal palavras e deixou passar uma fala da Dona Manga porque
  // calhou a que não tinha nenhuma delas — a fala é sorteada entre duas, e
  // metade das vezes o teste passava. Um teste que passa por sorte é pior
  // do que nenhum.
  "não", "você", "eu", "tu", "que", "uma", "com", "para", "por", "mais",
  "muito", "tudo", "todos", "todas", "isto", "isso", "aqui", "quando",
  "onde", "quem", "qual", "está", "estão", "foi", "são", "ser", "ter",
  "tem", "teu", "tua", "meu", "minha", "este", "esta", "esse", "essa",
  "já", "ainda", "também", "então", "agora", "depois", "antes", "sempre",
  "nunca", "vez", "vezes", "menos", "outra", "outro", "nenhum", "nenhuma",
  // Palavras do jogo, que aparecem em quase todos os ecrãs.
  "ronda", "rondas", "pontos", "pontuação", "jogador", "jogadores", "jogo",
  "jogos", "palavra", "palavras", "letra", "letras", "categoria",
  "categorias", "resposta", "respostas", "próxima", "voltar", "sair",
  "começar", "tempo", "segundos", "certas", "erradas", "acertaste",
  "erraste", "ganhaste", "perdeste", "escolhe", "conquista", "conquistas",
];

// As CATEGORIAS do jogo (Animal, Cidade, Palavra em inglês...) são conteúdo
// e não chrome: vivem no data.js e traduzi-las decide em que língua se
// RESPONDE, que é decisão do dono. Aparecem na grelha da Memória e na folha
// do clássico, por isso o varrimento tem de as conhecer para não as contar.
let categorias = new Set();
async function lerCategorias(page) {
  const nomes = await page.evaluate(async () => (await import("./js/data.js")).CATEGORIES);
  categorias = new Set((nomes || []).map((c) => String(c).toLowerCase()));
}

// Lê o que está VISÍVEL, e devolve as palavras portuguesas que encontrou.
async function fugas(page, onde) {
  const texto = await page.evaluate(() => {
    const visivel = (el) => el.offsetParent !== null || el === document.body;
    const pedacos = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (!visivel(el)) return;
      const proprio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
      if (proprio) pedacos.push(proprio);
      for (const at of ["title", "aria-label", "placeholder"]) {
        const v = el.getAttribute?.(at);
        if (v) pedacos.push(v);
      }
    });
    return pedacos.join(" \n ");
  });
  // Fora as categorias, que são conteúdo do jogo e não tradução por fazer,
  // e fora o nome do jogo — "Eu sei!" não se traduz, e o "eu" dele fazia a
  // lista disparar em cima do botão do modo clássico.
  const limpo = texto.split("\n").map((l) => l.trim())
    .filter((l) => !categorias.has(l.toLowerCase()))
    .join(" \n ").replace(/Eu sei/g, "");
  const palavras = new Set(limpo.toLowerCase().match(/[\p{L}]+/gu) || []);
  const achadas = SO_PORTUGUES.filter((p) => palavras.has(p));
  if (achadas.length) {
    // Mostra a frase inteira, não só a palavra: sem ela ninguém sabe onde
    // procurar num ficheiro de três mil linhas.
    const linhas = limpo.split("\n").map((l) => l.trim())
      .filter((l) => achadas.some((p) => new RegExp(`\\b${p}\\b`, "i").test(l)));
    console.error(`   ${onde}: ${[...new Set(linhas)].slice(0, 8).join(" | ").slice(0, 400)}`);
  }
  return achadas;
}

const page = await browser.newPage({ locale: "en-US" });
const consola = [];
page.on("pageerror", (e) => consola.push(e.message));
await page.addInitScript(() => { localStorage.setItem("euSei_lingua", "en"); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await lerCategorias(page);

// ---- 1. UMA RONDA DO CLÁSSICO A SOZINHO ----
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 10000 });
await page.click("#solo-classic-btn");
await page.click("#solo-setup-start-btn");
await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 5000 });
const naLetra = await fugas(page, "escolha da letra");

const letra = (await page.locator("#solo-letter-buttons .letter-btn .letter-big").first().textContent()).trim();
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 5000 });
const naRonda = await fugas(page, "a escrever as respostas");

const campos = await page.locator("#solo-cat-list .cat-item input").all();
for (let i = 0; i < campos.length; i++) {
  await campos[i].fill(i < campos.length - 1 ? `${letra}aaa${i}` : "zzz");
}
await page.click("#solo-finish-btn");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 5000 });
const noResultado = await fugas(page, "o resultado da ronda");

check("a escolha da letra não deixa português", naLetra.length === 0, naLetra.join(", "));
check("a folha de respostas não deixa português", naRonda.length === 0, naRonda.join(", "));
check("o resultado da ronda não deixa português", noResultado.length === 0, noResultado.join(", "));

// ---- 2. UM MINI-JOGO ATÉ AO FIM ----
// O ecrã de FIM de mini-jogo é onde vivem as frases que mais se leem: os
// pontos ganhos, o XP, a boca da Dona Manga. A primeira versão disto
// carregava em "Próxima ronda" e esperava 1,2 segundos — e passou a verde
// sem nunca lá chegar. Falsifiquei-a (pus português de volta no título do
// ecrã de fim) e ficou verde na mesma, que é como se descobre uma
// verificação que não verifica nada.
//
// Agora entra-se pela porta do jogo (como o solo-monkey-lifesaver faz) e
// salta-se com o botão do HUD, que leva direito ao fim.
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 10000 });
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 10000 });
await page.click("#memory-setup-start-btn");
// Todos os jogos avulsos passam pelo portão "pronto?" — o cronómetro só
// arranca depois de se carregar nele.
await page.waitForSelector("#ready-start-btn", { state: "visible", timeout: 10000 });
// O portão "pronto?" traz uma fala da casa, e é a primeira coisa que se lê
// antes de cada mini-jogo.
const noPortao = await fugas(page, "o portão pronto?");
check("o portão pronto? não deixa português", noPortao.length === 0, noPortao.join(", "));
await page.click("#ready-start-btn");
// A Memória mostra as cartas, esconde-as e pede que se escolham as que lá
// estavam. Não interessa acertar: interessa CHEGAR ao ecrã de fim, por isso
// confirma-se sem escolher nada.
await page.waitForSelector("#mem-confirm-btn:not(.hidden)", { timeout: 20000 });
await page.click("#mem-confirm-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 10000 });
const noFimDoMini = await fugas(page, "o fim do mini-jogo");
check("o fim do mini-jogo não deixa português", noFimDoMini.length === 0, noFimDoMini.join(", "));

// ---- 2b. AS CONQUISTAS E OS RECORDES ----
await page.click("#mge-exit-btn").catch(() => {});
await page.waitForTimeout(400);
await page.click("#solo-achievements-btn");
await page.waitForSelector('[data-screen="solo-achievements"].active', { timeout: 5000 });
const nasConquistas = await fugas(page, "as conquistas");
check("as conquistas não deixam português", nasConquistas.length === 0, nasConquistas.join(", "));
await page.click('[data-screen="solo-achievements"] [data-solo-leave]');
await page.waitForTimeout(300);
await page.click("#solo-leaderboard-btn");
await page.waitForSelector('[data-screen="solo-leaderboard"].active', { timeout: 5000 });
const nosRecordes = await fugas(page, "os recordes");
check("os recordes não deixam português", nosRecordes.length === 0, nosRecordes.join(", "));

// ---- 3. O QUADRO BRANCO ----
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("[data-open-board]");
await page.waitForSelector('[data-screen="board"].active', { timeout: 15000 });
await page.waitForTimeout(600);
await page.locator("#board-panel summary").click();
await page.waitForTimeout(200);
const noQuadro = await fugas(page, "o quadro branco");
check("o quadro branco não deixa português", noQuadro.length === 0, noQuadro.join(", "));

// ---- 4. O QUE SE JOGA EM SALA ----
// Precisa de dois jogadores para existir, por isso o resto deste caso não
// lá chega. O quadro partilhado e o Desenha e Adivinha são os dois jogos que
// o dono manteve, e são os que mais texto escrevem enquanto se joga.
const sala = await browser.newContext({ locale: "en-US" });
await sala.addInitScript(() => { localStorage.setItem("euSei_lingua", "en"); });
const anfitriao = await sala.newPage();
const convidado = await sala.newPage();
await anfitriao.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await anfitriao.fill("#name-input", "Ana");
await anfitriao.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await anfitriao.click("#create-room-btn");
await anfitriao.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const codigo = (await anfitriao.locator("#lobby-code").textContent()).trim();
await convidado.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await convidado.fill("#name-input", "Beto");
await convidado.fill("#join-code-input", codigo);
await convidado.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await convidado.click("#join-room-btn");
await convidado.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });

const naSala = await fugas(anfitriao, "a sala de espera com dois");
check("a sala com dois jogadores não deixa português", naSala.length === 0, naSala.join(", "));

// AS QUATRO TELAS DO JOGO CLÁSSICO NA SALA. Nenhum varrimento chegava aqui:
// o de ecrãs só vê o que está escrito no index.html, e este caso, até agora,
// entrava no quadro e ficava por lá. Foi assim que "As tuas respostas" —
// português fixo, dentro do renderVoting — sobreviveu a todas as passagens.
// São forçadas pelo stub porque jogar a partida inteira aqui era outro caso.
{
  const codigoSala = codigo;
  const anfitriaoUid = await anfitriao.evaluate((c) => window.__testDb.get(`rooms/${c}`).hostId, codigoSala);
  const telas = [
    ["a bola", "ball", { state: "ball", ball: { appearAt: Date.now() - 1000, winnerId: null } }],
    ["a escolha da letra", "letterpick", {
      state: "letterPick",
      ball: { appearAt: Date.now() - 5000, winnerId: anfitriaoUid },
      letterPick: { candidates: ["M", "P", "T"], votes: {}, chosen: null, startedAt: Date.now(), endAt: Date.now() + 600000 },
    }],
    ["a folha de respostas", "categories", {
      state: "categories",
      categoriesRound: { letter: "P", categoryIndexes: [0, 1], endAt: Date.now() + 600000, finishedBy: null },
    }],
    ["a votação", "voting", {
      state: "voting",
      answers: { [anfitriaoUid]: { c0: "Pedro", c1: "Porto" } },
      voting: { endAt: Date.now() + 600000 },
    }],
  ];
  for (const [nome, ecra, patch] of telas) {
    await anfitriao.evaluate(({ c, patch }) => window.__testDb.update(`rooms/${c}`, patch), { c: codigoSala, patch });
    await anfitriao.waitForSelector(`[data-screen="${ecra}"].active`, { timeout: 5000 });
    await anfitriao.waitForTimeout(200);
    const achadas = await fugas(anfitriao, nome);
    check(`${nome} não deixa português`, achadas.length === 0, achadas.join(", "));
  }
  // Devolver a sala ao lobby, que é onde o resto do caso a espera.
  await anfitriao.evaluate((c) => window.__testDb.update(`rooms/${c}`, {
    state: "lobby", ball: null, letterPick: null, categoriesRound: null, answers: null, voting: null,
  }), codigoSala);
  await anfitriao.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
}

await anfitriao.click('[data-mp-game="hangman"]');
await anfitriao.waitForSelector('[data-screen="hangman"].active', { timeout: 10000 });
await convidado.waitForSelector('[data-screen="hangman"].active', { timeout: 10000 });
await anfitriao.waitForTimeout(800);
const noQuadroDeSala = await fugas(anfitriao, "o quadro de sala (quem tem a caneta)");
check("o quadro de sala não deixa português a quem desenha", noQuadroDeSala.length === 0, noQuadroDeSala.join(", "));
const noQuadroConvidado = await fugas(convidado, "o quadro de sala (quem vê)");
check("o quadro de sala não deixa português a quem vê", noQuadroConvidado.length === 0, noQuadroConvidado.join(", "));

// DESENHA E ADIVINHA, os dois lados. O varrimento nunca cá tinha entrado — e
// era aqui que estava a linha de quem desenha ("Ronda 1/2 — desenha: X"),
// escrita em português fixo dentro do renderDraw. Quem desenha e quem
// adivinha leem coisas DIFERENTES, por isso leem-se as duas páginas.
await anfitriao.evaluate((c) => window.__testDb.update(`rooms/${c}`, { state: "lobby", hangman: null }), codigo);
await anfitriao.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await anfitriao.click('[data-mp-game="draw"]');
await anfitriao.waitForSelector('[data-screen="draw"].active', { timeout: 10000 });
await convidado.waitForSelector('[data-screen="draw"].active', { timeout: 10000 });
await anfitriao.waitForTimeout(600);
for (const [pagina, quem] of [[anfitriao, "a anfitriã"], [convidado, "o convidado"]]) {
  const achadas = await fugas(pagina, `o Desenha e Adivinha (${quem})`);
  check(`o Desenha e Adivinha não deixa português (${quem})`, achadas.length === 0, achadas.join(", "));
}

await browser.close();
const reais = consola.filter((e) => !/gstatic|googleapis|TUNNEL|CONNECTION_RESET/.test(e));
if (reais.length) { console.error("ERROS:\n" + reais.join("\n")); erros.push("erros de consola"); }
if (erros.length) { console.error(`\n${erros.length} verificações falharam.`); process.exit(1); }
console.log("\nTodos os testes passaram.");
