// O ORÇAMENTO DA PRIMEIRA ABERTURA.
//
// Isto é um jogo de festa: dez pessoas abrem o site ao mesmo tempo, cada uma
// no seu telemóvel, muitas vezes na rede de dados de casa de outra pessoa. O
// que se paga nessa primeira abertura decide se o jogo começa ou se alguém
// desiste a olhar para um ecrã branco.
//
// Estava medido no CLAUDE.md — 868 KB em 23 ficheiros — e medido não é
// guardado: um "import" novo no sítio errado passa a fazer parte da primeira
// abertura sem ninguém dar por isso, e o número no documento envelhece calado.
//
// O que se mede aqui são BYTES e FICHEIROS, não segundos: os segundos deste
// contentor não são os segundos de um telemóvel, e com quatro casos em
// paralelo seriam ruído. Bytes são iguais em toda a parte.
//
// Os tetos são generosos de propósito: não são uma meta, são o ponto onde
// alguma coisa mudou de grandeza.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

const TETO_KB = 1100;
const TETO_FICHEIROS = 32;

const pedidos = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!url.startsWith("http://localhost:")) return; // fontes e afins não são nossas
  let bytes = 0;
  try { bytes = (await res.body()).length; } catch { bytes = 0; }
  pedidos.push({ nome: url.split("/").pop().split("?")[0], bytes });
});

console.log("1) Abrir o site num telemóvel e contar o que se paga...");
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
// Interativo é isto: dá para escrever o nome e criar uma sala.
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 10000 });

const total = pedidos.reduce((n, p) => n + p.bytes, 0);
const kb = Math.round(total / 1024);
const maiores = [...pedidos].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
  .map((p) => `${p.nome} ${Math.round(p.bytes / 1024)}KB`);
console.log(`   ${pedidos.length} ficheiros, ${kb} KB (tetos: ${TETO_FICHEIROS} e ${TETO_KB} KB)`);
console.log(`   os maiores: ${maiores.join(", ")}`);
if (kb > TETO_KB) fail(`a primeira abertura pesa ${kb} KB`);
if (pedidos.length > TETO_FICHEIROS) fail(`a primeira abertura faz ${pedidos.length} pedidos`);

console.log("2) E o mapa não pode vir junto: são 191 KB que a maioria não abre...");
// paises.json é o ficheiro mais pesado do projeto e só serve a Conquistar o
// Mapa. Se aparecer aqui, é porque alguém pôs um "import" do mapa num módulo
// que a página carrega de início — e paga-o toda a gente, jogue ou não.
const mapaCedo = pedidos.filter((p) => /paises\.json|mapa/.test(p.nome));
console.log(`   ficheiros do mapa na primeira abertura: ${mapaCedo.length ? mapaCedo.map((p) => p.nome).join(", ") : "nenhum"}`);
if (mapaCedo.some((p) => p.nome === "paises.json")) fail("paises.json veio na primeira abertura");

console.log("3) E ao abrir o mapa é que ele chega...");
const antes = pedidos.length;
await page.click('[data-screen="home"] [data-open-mapa]');
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await page.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 20000 });
const depois = pedidos.slice(antes);
const trouxePaises = depois.some((p) => p.nome === "paises.json");
console.log(`   mais ${depois.length} ficheiros ao abrir o mapa, paises.json entre eles: ${trouxePaises}`);
if (!trouxePaises) fail("paises.json não foi pedido ao abrir o mapa — a medição não diz nada");

await browser.close();
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
