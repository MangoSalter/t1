// Ajudas partilhadas pelos testes do modo sozinho.
//
// Estes testes foram escritos quando "Próxima ronda" ia direto para a escolha
// de letra. Hoje passa SEMPRE por um mini-jogo primeiro (com ecrã de fim), e
// os testes ficavam presos à espera de um ecrã que só chega depois disso.
// Em vez de espalhar cliques por todos, o caminho fica aqui: atravessa o que
// estiver pelo meio (portão "pronto?", HUD a jogar, ecrã de fim) até chegar à
// escolha de letra.
export async function backToLetterpick(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  const visible = (sel) => page.locator(sel).isVisible().catch(() => false);
  while (Date.now() < deadline) {
    if (await visible('[data-screen="solo-letterpick"].active')) return;
    if (await visible("#ready-overlay:not(.hidden) #ready-start-btn")) {
      await page.click("#ready-start-btn");
    } else if (await visible("#minigame-end-overlay:not(.hidden) #mge-continue-btn")) {
      await page.click("#mge-continue-btn");
    } else if (await visible("#game-hud:not(.hidden) #game-hud-skip-btn")) {
      await page.click("#game-hud-skip-btn");
    }
    await page.waitForTimeout(250);
  }
  const screen = await page.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
  throw new Error(`não voltou à escolha de letra (ficou em "${screen}")`);
}

// O modo sozinho carrega-se ao entrar nele (ver o carregador no index.html):
// o PRIMEIRO clique em "Jogar sozinho" traz 143 KB antes de haver ecrã. Um
// clique do Playwright espera que o elemento seguinte fique visível, por isso
// a maior parte dos testes nem dá por isso — mas quem carrega e LÊ o DOM a
// seguir lê o HTML por pintar. Entra-se por aqui.
export async function entrarNoSolo(page, timeoutMs = 10000) {
  await page.click("#solo-menu-btn");
  await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: timeoutMs });
}

// A LÍNGUA EM QUE O CASO ESTÁ A JOGAR TEM DE SER DITA.
//
// Sem escolha guardada, a app arranca na língua do browser — de propósito:
// quem chega de fora e encontra tudo em português fecha a página antes de
// descobrir o seletor. O Chromium do Playwright diz en-US, por isso um caso
// que não diga nada está a jogar em INGLÊS.
//
// Isto não incomodou ninguém enquanto só o mapa estava traduzido: tudo o
// resto saía em português fosse qual fosse a escolha. Assim que a porta de
// entrada passou a falar três línguas, o `lobby-catpicker-test` foi à procura
// de "Definições" e encontrou "Match settings". Nove casos em setenta e cinco
// fixavam a língua; os outros dependiam de um acidente.
//
// O `locale` do contexto é o único sítio onde isto se resolve de uma vez: o
// `--lang` do Chromium não mexe no `navigator.language` (medido), e pôr
// `localStorage` depois do goto chega tarde para o primeiro pintar. Por isso
// o browser sai daqui com os contextos já em português, e quem quiser outra
// língua passa `{ locale: "en-US" }` como sempre passaria.
export async function abrirBrowser(chromium, opcoes = {}) {
  const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined, ...opcoes });
  const comLingua = (fn) => (o = {}) => fn({ locale: "pt-PT", ...o });
  browser.newContext = comLingua(browser.newContext.bind(browser));
  browser.newPage = comLingua(browser.newPage.bind(browser));
  return browser;
}
