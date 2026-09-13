// Gera public/capa.png — a imagem que aparece quando alguém cola o convite
// no WhatsApp. Reusa a mascote que já está no index.html, para a antevisão
// ser a mesma cara que se abre a seguir.
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");
const mascote = html.match(/<svg class="mascot"[\s\S]*?<\/svg>/)[0].replace('class="mascot"', 'class="mascot" width="560"');

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  @import url("");
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;background:#f6efdd;color:#3a3126;
       font-family:Georgia,"Times New Roman",serif;
       display:flex;align-items:center;gap:40px;padding:0 70px;box-sizing:border-box;
       background-image:radial-gradient(#e6dcc2 1.4px, transparent 1.4px);background-size:22px 22px;}
  .texto{flex:1 1 auto}
  h1{font-size:104px;margin:0 0 10px;letter-spacing:-1px}
  p{font-size:40px;margin:0;line-height:1.35;color:#6b5f4c}
  .fita{display:inline-block;margin-top:28px;background:#b24b38;color:#f6efdd;
        font-size:30px;padding:12px 26px;border-radius:999px}
  svg.mascot{flex:0 0 auto}
</style></head><body>
  <div class="texto">
    <h1>Eu sei!</h1>
    <p>Jogos de festa,<br>cada um no seu telemóvel.</p>
    <span class="fita">Uma sala, quatro letras, e já está</span>
  </div>
  ${mascote}
</body></html>`);
await page.screenshot({ path: "public/capa.png" });
await browser.close();
console.log("capa.png feita");
