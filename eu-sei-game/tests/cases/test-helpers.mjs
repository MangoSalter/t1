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
