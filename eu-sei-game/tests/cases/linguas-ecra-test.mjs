// QUANTO DO JOGO É QUE ESTÁ MESMO NAS TRÊS LÍNGUAS.
//
// O seletor de língua está na primeira coisa que se vê, e promete três. Até
// aqui cumpria uma: só o mapa passava pelo t(). Medido com o próprio
// i18n-ecra.js a correr, a marcação estática tinha 9 textos traduzidos e 285
// em português — o ecrã de entrada, o menu de jogar sozinho e a sala de
// espera incluídos. Quem escolhia English criava a sala em português.
//
// Este caso mede, não confia. Um tecto por ecrã na porta de entrada (zero, e
// é zero mesmo) e um tecto global que só pode descer. Como o carga-inicial:
// um número que alguém tem de mexer de propósito, não uma nota que envelhece
// sozinha.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const erros = [];
function check(label, cond, extra = "") {
  if (cond) console.log(`OK: ${label}`);
  else { console.error(`FALHOU: ${label}${extra ? ` — ${extra}` : ""}`); erros.push(label); }
}

// O que sobra em português não é tudo defeito. Três famílias ficam de fora
// de propósito:
//
// - os nomes próprios (Eu sei!, Dona Manga, Kota) não se traduzem em jogo
//   nenhum, e traduzi-los partia a coesão da casa;
// - os nomes das línguas dentro do seletor são sempre a língua que nomeiam —
//   "English" tem de dizer English mesmo a quem lê espanhol, senão não se
//   encontra;
// - as CATEGORIAS do jogo clássico (Animal, Cidade, Fruta...) são conteúdo e
//   vivem no data.js. Traduzi-las decide em que língua se RESPONDE, que é
//   coisa do dono e não arrumação; ficam listadas aqui para o tecto não as
//   contar como trabalho por fazer.
const PROPRIOS = ["Eu sei!", "Português", "English", "Español"];

// ---- 1. A PORTA DE ENTRADA ESTÁ TRADUZIDA ----
// Os três ecrãs que decidem se alguém fica: o inicial, o menu de jogar
// sozinho e a sala de espera. Aqui o tecto é zero, tirando as categorias do
// clássico, que são conteúdo.
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => { localStorage.setItem("euSei_lingua", "en"); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

const categorias = await page.evaluate(() =>
  [...document.querySelectorAll("#cfg-cat-grid label")].map((l) => l.textContent.trim()));

const nus = await page.evaluate((props) => {
  const temLetra = (s) => /\p{L}/u.test(s);
  const proprio = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
  const out = {};
  document.querySelectorAll("[data-screen]").forEach((sec) => {
    const antes = sec.classList.contains("active");
    sec.classList.add("active");
    const lista = [];
    sec.querySelectorAll("*").forEach((el) => {
      if (el.offsetParent === null) return;
      if (el.closest("[data-i18n]")) return;
      // Umas quantas frases levam peças a encaixar (pontos, dias seguidos) e
      // por isso não cabem num data-i18n: quem as pinta volta a pintá-las no
      // aoMudarLingua. Marcam-se com data-i18n-js para se saber que estão
      // tratadas — e o passo 4 confirma que estão mesmo.
      if (el.closest("[data-i18n-js]")) return;
      if (el.closest("#cfg-cat-grid")) return;
      const txt = proprio(el).replace(/\s+/g, " ");
      if (!txt || !temLetra(txt) || props.includes(txt)) return;
      lista.push(txt.slice(0, 50));
    });
    if (!antes) sec.classList.remove("active");
    out[sec.dataset.screen] = lista;
  });
  return out;
}, PROPRIOS);

for (const ecra of ["home", "solo-menu", "lobby"]) {
  const restam = nus[ecra] || [];
  check(`${ecra}: nada por traduzir`, restam.length === 0, restam.join(" | "));
}
check("o mapa das categorias do clássico está lá (são conteúdo, não chrome)", categorias.length >= 30, `${categorias.length}`);

// ---- 2. O TECTO GLOBAL ----
// 41 ecrãs. Este número desce à medida que a tradução avança e nunca deve
// subir; quem o subir está a acrescentar português novo a um jogo que promete
// três línguas.
const TECTO = 150;
const total = Object.values(nus).reduce((s, v) => s + v.length, 0);
const piores = Object.entries(nus).filter(([, v]) => v.length).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
console.log(`Por traduzir: ${total} textos. Piores ecrãs: ${piores.map(([e, v]) => `${e}=${v.length}`).join(", ")}`);
check(`o que falta traduzir está dentro do tecto (${total} <= ${TECTO})`, total <= TECTO);

// ---- 3. TROCAR DE LÍNGUA REPINTA MESMO O ECRÃ ----
// A tabela pode estar certa e o ecrã continuar em português: basta o
// aoMudarLingua não chegar ao elemento. Lê-se o botão de criar sala nas três.
const lido = {};
for (const lingua of ["pt", "en", "es"]) {
  await page.selectOption("#lingua-select", lingua);
  lido[lingua] = {
    criar: (await page.textContent("#create-room-btn")).trim(),
    nome: await page.getAttribute("#name-input", "placeholder"),
    aria: await page.getAttribute("#name-input", "aria-label"),
  };
}
check("criar sala muda nas três línguas",
  lido.pt.criar === "Criar sala" && lido.en.criar === "Create room" && lido.es.criar === "Crear sala",
  JSON.stringify(lido));
check("o campo do nome muda de placeholder e de nome acessível",
  lido.en.nome === "Your name" && lido.en.aria === "Your name" && lido.es.nome === "Tu nombre",
  JSON.stringify(lido));

// ---- 4. O DESAFIO DO DIA TAMBÉM ----
// A frase leva pontos e dias seguidos lá dentro, por isso não é o data-i18n
// que a repõe: é o aoMudarLingua no app.js. Sem ele ficava em português no
// meio de um ecrã inglês.
await page.selectOption("#lingua-select", "en");
const desafioEn = (await page.textContent("#home-desafio-estado")).trim();
await page.selectOption("#lingua-select", "es");
const desafioEs = (await page.textContent("#home-desafio-estado")).trim();
check("a frase do desafio do dia é repintada ao trocar de língua",
  desafioEn.startsWith("One round") && desafioEs.startsWith("Una ronda"),
  `en=${desafioEn} es=${desafioEs}`);

await browser.close();
if (erros.length) { console.error(`\n${erros.length} verificações falharam.`); process.exit(1); }
console.log("\nTodos os testes passaram.");
