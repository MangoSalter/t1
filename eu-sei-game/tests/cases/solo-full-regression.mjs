import { chromium } from "playwright";
import { backToLetterpick } from "./test-helpers.mjs";

const ALL_MG = ["solo-minigame", "solo-minigame-word", "solo-minigame-bug", "solo-minigame-monkey", "solo-minigame-memory"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

async function playRoundToMinigame() {
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  const letter = await page.locator("#solo-letter-buttons .letter-btn .letter-big").first().textContent();
  await page.locator("#solo-letter-buttons .letter-btn").first().click();
  await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
  const inputs = await page.locator("#solo-cat-list .cat-item input").all();
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`${letter}palavra${i}`);
  await page.click("#solo-finish-btn");
  await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
  await page.click("#solo-continue-btn");
  await page.waitForFunction(
    (ids) => ids.some((id) => {
      const el = document.querySelector(`[data-screen="${id}"]`);
      return el && el.classList.contains("active");
    }),
    ALL_MG,
    { timeout: 3000 }
  );
}

async function currentMinigame() {
  for (const id of ALL_MG) {
    const active = await page.locator(`[data-screen="${id}"].active`).count();
    if (active > 0) return id;
  }
  return null;
}

const seen = new Set();
const stale = [];
await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");

for (let attempt = 0; attempt < 40 && seen.size < ALL_MG.length; attempt++) {
  let which = null;
  // Cada tentativa é isolada: um ramo desatualizado (a apontar para um
  // elemento que um redesenho removeu) fazia cair a suite INTEIRA na primeira
  // falha, e os mini-jogos a seguir deixavam de ser testados de todo — ou
  // seja, o teste mais abrangente era o que dava menos sinal.
  try {
  await playRoundToMinigame();
  which = await currentMinigame();
  if (!seen.has(which)) {
    console.log(`\n=== Testando "${which}" pela primeira vez (tentativa ${attempt + 1}) ===`);
    seen.add(which);

    if (which === "solo-minigame") {
      // Olho de Lince: deixou de ser "clica na bola quando aparecer"
      // (#solo-mg-circle) e passou a ser "encontra o objeto pedido entre
      // vários" — o ramo antigo apontava para um elemento que já não existe.
      await page.waitForSelector("#reflex-scene .reflex-item", { timeout: 8000 });
      const spread = await page.locator("#reflex-scene .reflex-item").count();
      const prompt = await page.locator("#reflex-prompt").textContent();
      console.log(`  ${spread} objetos espalhados — pedido: "${prompt.trim()}"`);
      if (spread < 2) {
        console.log("  FALHOU: sem objetos para procurar não há jogo");
        process.exitCode = 1;
      }
      if (!prompt.includes("Encontra")) {
        console.log("  FALHOU: devia dizer o que procurar");
        process.exitCode = 1;
      }
      // Clica no objeto certo, identificado pelo title (o nome do item).
      const wanted = prompt.replace(/^\s*Encontra:\s*/, "").trim().split(" ").slice(1).join(" ");
      const target = page.locator(`#reflex-scene .reflex-item[title="${wanted}"]`).first();
      if (await target.count() > 0) {
        await target.click();
        await page.waitForTimeout(300);
        const status = await page.locator("#reflex-status").textContent();
        console.log(`  depois de acertar: "${status.trim()}"`);
      } else {
        console.log(`  FALHOU: o objeto pedido ("${wanted}") não está espalhado na cena`);
        process.exitCode = 1;
      }
      await backToLetterpick(page);
    } else if (which === "solo-minigame-word") {
      const letterShown = await page.locator("#wf-letter").textContent();
      await page.fill("#wf-input", `${letterShown}palavracomprida`); // 16 letras, deve dar bónus de comprimento
      await page.locator("#wf-input").press("Enter");
      const chipText = await page.locator(".wf-word-chip").first().textContent();
      console.log(`  Chip: ${chipText}`);
      const match = chipText.match(/\+(\d+)/);
      const points = match ? parseInt(match[1], 10) : 0;
      console.log(`  Pontos por palavra longa: ${points} (esperado > 3, base + bónus de comprimento)`);
      if (points <= 3) {
        console.log("  FALHOU: palavra longa não recebeu bónus de comprimento");
        process.exitCode = 1;
      }
      await backToLetterpick(page);
    } else if (which === "solo-minigame-bug") {
      await page.waitForSelector(".bug-arena .bug", { timeout: 3000 });
      const deadline = Date.now() + 5000;
      let comboSeen = false;
      while (Date.now() < deadline) {
        const bugs = await page.locator(".bug-arena .bug").all();
        for (const bug of bugs) {
          try { await bug.click({ timeout: 200 }); } catch { /* pode ter desaparecido */ }
        }
        const status = await page.locator("#bug-status").textContent();
        if (status.includes("Combo")) comboSeen = true;
        await page.waitForTimeout(120);
      }
      console.log(`  Combo observado em algum momento: ${comboSeen} (esperado true, com sorte suficiente de acertar 2x seguidas)`);
      await backToLetterpick(page);
    } else if (which === "solo-minigame-monkey") {
      const arenaBox = await page.locator("#monkey-arena").boundingBox();
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const monkeys = await page.locator(".falling-monkey").all();
        if (monkeys.length > 0) {
          const left = await monkeys[monkeys.length - 1].evaluate((el) => parseFloat(el.style.left));
          await page.mouse.move(arenaBox.x + left, arenaBox.y + 100);
        }
        await page.waitForTimeout(70);
      }
      await backToLetterpick(page);
      console.log("  OK: ronda de macacos terminou e avançou (verificação visual de dourado é manual)");
    } else if (which === "solo-minigame-memory") {
      const shownCards = await page.locator("#mem-grid .mem-card.shown-preview").allTextContents();
      console.log(`  Categorias mostradas (${shownCards.length}): ${shownCards.join(", ")}`);
      // Aqui a Memória calha numa ronda qualquer da run, não na 1ª: o número
      // de cartas sobe com a ronda (base 5, +1 a cada 3 rondas, teto 8), por
      // isso fixar "tem de ser 5" era uma suposição do teste, não uma regra
      // do jogo.
      if (shownCards.length < 5 || shownCards.length > 8) {
        console.log(`  FALHOU: ${shownCards.length} cartas fora do intervalo esperado (5 a 8)`);
        process.exitCode = 1;
      }
      await page.waitForSelector("#mem-confirm-btn:not(.hidden)", { timeout: 5000 });
      for (const text of shownCards) {
        await page.locator("#mem-grid .mem-card", { hasText: text }).first().click();
      }
      await page.click("#mem-confirm-btn");
      await backToLetterpick(page);
    }
  } else {
    // já testado, só avança rápido
    if (which === "solo-minigame") {
      await backToLetterpick(page);
    } else if (which === "solo-minigame-memory") {
      await page.waitForSelector("#mem-confirm-btn:not(.hidden)", { timeout: 5000 });
      await page.click("#mem-confirm-btn");
      await backToLetterpick(page);
    } else {
      await backToLetterpick(page);
    }
  }
  } catch (err) {
    const msg = String(err.message || err).split("\n")[0];
    stale.push({ which: which || "?", msg });
    console.log(`  RAMO DESATUALIZADO (${which || "?"}): ${msg}`);
    // Volta ao caminho conhecido para os mini-jogos seguintes ainda serem
    // testados, em vez de perder a corrida toda por causa de um ramo.
    try {
      await backToLetterpick(page);
    } catch {
      await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
      await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");
    }
  }
}

console.log(`\nMini-jogos testados: ${seen.size}/${ALL_MG.length}`);
if (seen.size < ALL_MG.length) {
  console.log("AVISO: nem todos os mini-jogos calharam dentro do limite de tentativas.");
  process.exitCode = 1;
}
if (stale.length > 0) {
  console.log(`\nRamos desatualizados (${stale.length}) — asserções sobre elementos que um redesenho removeu:`);
  stale.forEach((s) => console.log(`  - ${s.which}: ${s.msg}`));
  process.exitCode = 1;
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
