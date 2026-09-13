// Gera public/capa.png — a imagem que aparece quando alguém cola o convite do
// lobby no WhatsApp. Corre-se à mão (`node tools/capa.mjs`) quando a mascote
// ou a letra da casa mudarem; a imagem fica no repositório, porque quem a vai
// buscar é o robô da antevisão e não um telemóvel a jogar.
//
// Duas coisas que este ficheiro NÃO inventa, e por isso o cartão não se
// desencontra do jogo: a mascote é recortada do próprio index.html, e a letra
// é a que o style.css importa. Ler o nome da fonte de cabeça era escrever uma
// terceira cópia de uma coisa que já está escrita duas vezes.
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");
const css = readFileSync("public/style.css", "utf8");

const mascote = html.match(/<svg class="mascot"[\s\S]*?<\/svg>/)[0].replace('class="mascot"', 'class="mascot" width="500"');
const enderecoDaFonte = css.match(/@import url\('([^']+)'\)/)?.[1];
if (!enderecoDaFonte) throw new Error("o style.css deixou de importar uma fonte — vê a primeira linha");
const familia = decodeURIComponent(enderecoDaFonte).match(/family=([^&:]+)/)[1].replace(/\+/g, " ");

// Embutida em base64 de propósito: assim o desenho não depende de o browser
// chegar à rede no instante da fotografia, e duas corridas dão a mesma capa.
// Se a rede faltar, isto ESTOIRA — uma capa com a letra errada é pior do que
// nenhuma, porque ninguém repara e ela fica publicada.
const folha = await (await fetch(enderecoDaFonte, { headers: { "user-agent": "Mozilla/5.0" } })).text();
const urlDaLetra = folha.match(/src:\s*url\(([^)]+)\)/)?.[1];
if (!urlDaLetra) throw new Error(`não achei o ficheiro da letra em ${enderecoDaFonte}`);
const letra = Buffer.from(await (await fetch(urlDaLetra)).arrayBuffer()).toString("base64");
const formato = urlDaLetra.endsWith(".woff2") ? "woff2" : "truetype";

// A mesma escolha que o tests/run.mjs faz, e pela mesma razão: se esta
// máquina trouxer um Chromium já instalado usa-se esse, senão pede-se o que o
// Playwright instalou sozinho. Escrever o caminho aqui dentro era prender o
// ficheiro a um computador.
const doSistema = "/opt/pw-browsers/chromium";
const executablePath = process.env.EU_SEI_CHROMIUM || (existsSync(doSistema) ? doSistema : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: "${familia}"; src: url(data:font/${formato};base64,${letra}) format("${formato}"); }
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;background:#f6efdd;color:#3a3126;
       font-family:"${familia}", cursive;
       display:flex;align-items:center;gap:40px;padding:0 70px;box-sizing:border-box;
       background-image:radial-gradient(#e6dcc2 1.4px, transparent 1.4px);background-size:22px 22px;}
  .texto{flex:1 1 auto}
  h1{font-size:118px;margin:0 0 10px;line-height:1}
  p{font-size:38px;margin:0;line-height:1.35;color:#6b5f4c}
  .fita{display:inline-block;margin-top:30px;background:#b24b38;color:#f6efdd;
        font-size:28px;padding:10px 26px;border-radius:999px;white-space:nowrap}
  svg.mascot{flex:0 0 auto}
</style></head><body>
  <div class="texto">
    <h1>Eu sei!</h1>
    <p>Jogos de festa,<br>cada um no seu telemóvel.</p>
    <span class="fita">Uma sala, quatro letras, e já está</span>
  </div>
  ${mascote}
</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/capa.png" });
await browser.close();
console.log(`capa.png feita com "${familia}"`);
