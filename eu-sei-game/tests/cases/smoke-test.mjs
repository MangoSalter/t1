import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

const messages = [];
page.on("console", (msg) => messages.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => messages.push({ type: "pageerror", text: err.message }));
page.on("requestfailed", (req) => console.log("REQUEST FAILED:", req.url(), req.failure()?.errorText));
page.on("response", (res) => { if (res.status() >= 400) console.log("HTTP", res.status(), res.url()); });

await page.goto("http://localhost:8934/index.html", { waitUntil: "networkidle" });

// Ecrã inicial deve estar visível com os elementos certos.
const homeVisible = await page.locator('[data-screen="home"].active').isVisible();
console.log("Ecrã home visível:", homeVisible);

await page.fill("#name-input", "Ana");
const createBtnVisible = await page.locator("#create-room-btn").isVisible();
console.log("Botão criar sala visível:", createBtnVisible);

// Tentar criar sala vai falhar (credenciais placeholder), mas não deve
// rebentar a página nem lançar erros de referência/sintaxe.
await page.click("#create-room-btn");
await page.waitForTimeout(2500);

const stillOnHome = await page.locator('[data-screen="home"].active').isVisible();
console.log("Continua no ecrã home após falha esperada de auth:", stillOnHome);

const errorText = await page.locator("#home-error").textContent();
console.log("Texto de erro mostrado ao utilizador:", JSON.stringify(errorText));

await browser.close();

console.log("\n--- Mensagens de consola/página ---");
for (const m of messages) {
  console.log(`[${m.type}] ${m.text}`);
}

// Falhar o script se houver erros que NÃO sejam relacionados com a
// autenticação Firebase (credenciais placeholder são esperadas de falhar).
const unexpected = messages.filter((m) => {
  if (m.type !== "error" && m.type !== "pageerror") return false;
  const t = m.text.toLowerCase();
  if (t.includes("firebase") || t.includes("auth") || t.includes("api-key") || t.includes("api key") || t.includes("400") || t.includes("failed to fetch") || t.includes("network")) {
    return false; // esperado, por causa das credenciais placeholder
  }
  return true;
});

if (unexpected.length > 0) {
  console.error("\nERROS INESPERADOS ENCONTRADOS:");
  unexpected.forEach((m) => console.error(m));
  process.exitCode = 1;
} else {
  console.log("\nSem erros inesperados (só falhas de auth Firebase, que são esperadas com credenciais placeholder).");
}
