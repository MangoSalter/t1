import {
  CATEGORIES, ALPHABET, HARD_LETTERS, pickLetters, pickCategories, catKey, catIndexFromKey,
} from "/home/user/desktop-tutorial/eu-sei-game/public/js/data.js";

function assert(cond, label) {
  if (!cond) { console.error(`FALHOU: ${label}`); process.exitCode = 1; }
  else console.log(`OK: ${label}`);
}

assert(CATEGORIES.length === 40, `pool tem 40 categorias (tem ${CATEGORIES.length})`);
assert(new Set(CATEGORIES).size === 40, "categorias são todas únicas (sem duplicados)");
assert(ALPHABET.length === 26, "alfabeto tem 26 letras");

// pickLetters: exclui usadas e (opcionalmente) difíceis, sem repetir dentro do lote.
{
  const used = new Set(["A", "B"]);
  const letters = pickLetters(5, used, true);
  assert(letters.length === 5, "pickLetters devolve a quantidade pedida");
  assert(new Set(letters).size === 5, "pickLetters não repete letras no mesmo lote");
  assert(letters.every((l) => !used.has(l)), "pickLetters exclui letras já usadas");
  assert(letters.every((l) => !HARD_LETTERS.has(l)), "pickLetters exclui K/W/Y quando pedido");
}
{
  const letters = pickLetters(3, new Set(), false);
  assert(letters.length === 3, "pickLetters sem exclusão de difíceis devolve 3");
}

// pickCategories: exclui índices já usados, sem repetir dentro do lote, e
// consegue continuar mesmo quando o pool quase se esgota.
{
  const used = new Set([0, 1, 2]);
  const cats = pickCategories(8, used);
  assert(cats.length === 8, "pickCategories devolve a quantidade pedida");
  assert(new Set(cats).size === 8, "pickCategories não repete índices no mesmo lote");
  assert(cats.every((i) => !used.has(i)), "pickCategories exclui índices já usados");
}
{
  // quase todo o pool usado (37 de 40) — só sobram 3, mas pedem-se 8: deve recomeçar sem crashar.
  const used = new Set(Array.from({ length: 37 }, (_, i) => i));
  const cats = pickCategories(8, used);
  assert(cats.length === 8, "pickCategories recupera quando o pool está quase esgotado");
  assert(cats.every((i) => i >= 0 && i < 40), "índices devolvidos continuam válidos");
}

// catKey / catIndexFromKey: ida e volta consistente, incluindo índices de 2 dígitos.
{
  [0, 1, 9, 17, 39].forEach((i) => {
    assert(catIndexFromKey(catKey(i)) === i, `catKey/catIndexFromKey ida-e-volta para índice ${i}`);
  });
  assert(catKey(3) === "c3" && !/^\d+$/.test(catKey(3)), "catKey nunca é puramente numérica (evita bug de array do Firebase)");
}

// pickCategories com enabledIndexes: só escolhe dentro do conjunto permitido.
{
  const enabled = new Set([0, 1, 2, 3, 4, 5]);
  const cats = pickCategories(4, new Set(), enabled);
  assert(cats.length === 4, "pickCategories com enabledIndexes devolve a quantidade pedida");
  assert(cats.every((i) => enabled.has(i)), "pickCategories respeita o conjunto de categorias ativadas");
}
{
  // pool ativado mais pequeno que o pedido: não deve rebentar, devolve o que houver.
  const enabled = new Set([0, 1, 2]);
  const cats = pickCategories(8, new Set(), enabled);
  assert(cats.length === 3, "pickCategories corta para o tamanho do pool ativado quando é menor que o pedido");
}
{
  // enabledIndexes vazio = comporta-se como sem filtro (todas as 40).
  const cats = pickCategories(5, new Set(), new Set());
  assert(cats.length === 5, "pickCategories com enabledIndexes vazio ignora o filtro (todas disponíveis)");
}

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
