// A OFICINA esconde mesmo os jogos que ainda não estão para se mostrar?
//
// Este caso existe porque todos os OUTROS casos abrem a app com ?oficina=1 —
// precisam dos jogos para os testar. Se ninguém abrisse a app como um visitante
// a abre, o dia em que o esconder deixasse de funcionar era um dia em que a
// suite inteira passava e o site mostrava tudo à mesma.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

// Os jogos que o utilizador mandou tirar do site. Se um deles voltar a ser
// exposto, é aqui que se tira da lista — e no oficina.js.
const NA_OFICINA = [
  ["#solo-play-reflex-btn", "Olho de Lince"],
  ["#solo-play-bug-btn", "Mata o Inseto"],
  ["#solo-play-monkey-btn", "Cada Macaco no Seu Galho"],
  ["#solo-play-map-btn", "Mapa-Múndi antigo"],
  ["#solo-play-pac-btn", "Kota Corre!"],
  ["#solo-play-cards-btn", "Descartando Juntos"],
  ["#solo-play-car-btn", "Estrada Maluca"],
  ["#solo-play-landmark-btn", "Onde Fica Isto?"],
  ['[data-mp-game="mapTrivia"]', "Mapa-Múndi em equipa"],
  ['[data-mp-game="race"]', "Estrada Maluca em equipa"],
];

// E os que TÊM de continuar à vista. Uma lista que só verifica o esconder
// passaria com a app inteira escondida.
const NO_SITE = [
  ["#solo-play-wordflash-btn", "Palavra Relâmpago"],
  ["#solo-play-memory-btn", "Memória"],
  ["#solo-play-hangman-btn", "Forca"],
  ["#solo-play-golf-btn", "Mini-Golfe"],
  ['[data-mp-game="hangman"]', "Quadro branco em equipa"],
  // Voltou ao site refeito: já não é escolha múltipla sobre um desenho
  // pronto, é uma pessoa a desenhar o monumento e as outras a dizer o país.
  ['[data-mp-game="marcos"]', "Onde Fica Isto? em equipa (desenhado)"],
  ['[data-mp-game="mapa"]', "Conquistar o Mapa"],
];

const abrir = async (url) => {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  return page;
};
const visivel = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  // Não é o mesmo que "está no ecrã": os menus estão fechados. O que se quer
  // saber é se o botão foi ESCONDIDO — o hidden — e não se está a ser mostrado
  // agora.
  return el ? !el.hidden : null;
}, sel);

console.log("1) Um visitante normal não vê nenhum dos jogos que estão na oficina...");
const site = await abrir("http://localhost:8936/index.html");
for (const [sel, nome] of NA_OFICINA) {
  const v = await visivel(site, sel);
  if (v === null) fail(`${nome}: não encontrei o botão (${sel}) — mudou de nome?`);
  else if (v) fail(`${nome} ainda está à vista no site`);
}
console.log(`   ${NA_OFICINA.length} jogos verificados`);

console.log("2) ...mas continua a ver os que ficaram...");
for (const [sel, nome] of NO_SITE) {
  const v = await visivel(site, sel);
  if (v === null) fail(`${nome}: não encontrei o botão (${sel})`);
  else if (!v) fail(`${nome} devia estar à vista e não está`);
}
console.log(`   ${NO_SITE.length} jogos do site verificados`);

console.log("3) A maratona não conta jogos que ninguém pode escolher...");
const marcados = await site.evaluate(() => Array.from(
  document.querySelectorAll("[data-marathon-game]:checked"),
).map((cb) => cb.dataset.marathonGame));
console.log(`   marcados por omissão: ${JSON.stringify(marcados)}`);
const proibidos = ["reflex", "bug", "monkey", "map", "pacman", "car", "landmark"];
const maus = marcados.filter((k) => proibidos.includes(k));
if (maus.length) fail(`a maratona ainda vem com jogos da oficina marcados: ${maus.join(", ")}`);
if (marcados.length === 0) fail("a maratona ficou sem nenhum jogo marcado");

console.log("4) Com ?oficina=1, quem está a melhorá-los volta a vê-los...");
const oficina = await abrir("http://localhost:8936/index.html?oficina=1");
for (const [sel, nome] of NA_OFICINA) {
  if (!(await visivel(oficina, sel))) fail(`${nome} devia aparecer na oficina`);
}
console.log("   todos voltaram");

console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
