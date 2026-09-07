import {
  CATEGORIES, ALPHABET, HARD_LETTERS, pickLetters, pickCategories, catKey, catIndexFromKey,
  LANDMARKS, pickLandmark,
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

// --- O baralho do "Onde Fica Isto?" ---
//
// Cada marco tem de trazer a frase de revelação ESCRITA À MÃO. Montá-la por
// regra dava "Era a Big Ben, em Reino Unido": em português o artigo muda com
// o nome e a preposição muda com o país. É a frase que a pessoa lê no fim da
// ronda, e é onde o jogo ensina alguma coisa — sair torta estraga o momento.
{
  assert(LANDMARKS.length >= 12, `o baralho tem pelo menos 12 marcos (tem ${LANDMARKS.length})`);
  assert(new Set(LANDMARKS.map((l) => l.id)).size === LANDMARKS.length, "ids dos marcos são únicos");
  const paises = new Set(LANDMARKS.map((l) => l.answer));
  assert(paises.size === LANDMARKS.length, "cada marco fica num país diferente (o solo faz distratores com isto)");

  const semCampo = LANDMARKS.filter((l) => !l.name || !l.answer || !l.onde || !l.frase || !l.svg);
  assert(semCampo.length === 0, `todos os marcos têm nome, país, "onde", frase e desenho${semCampo.length ? ` (faltam em ${semCampo.map((l) => l.id).join(", ")})` : ""}`);

  const semPais = LANDMARKS.filter((l) => !l.frase.includes(l.answer));
  assert(semPais.length === 0, `a frase de cada marco diz o país${semPais.length ? ` (não diz em ${semPais.map((l) => l.id).join(", ")})` : ""}`);
  const semNome = LANDMARKS.filter((l) => !l.frase.toLowerCase().includes(l.name.toLowerCase()));
  assert(semNome.length === 0, `a frase de cada marco diz o nome do monumento${semNome.length ? ` (não diz em ${semNome.map((l) => l.id).join(", ")})` : ""}`);
  // "em França" e não "em a França": o artigo tem de vir já contraído.
  const ondeTorto = LANDMARKS.filter((l) => !/^(em|no|na|nos|nas) /.test(l.onde) || / a | o /.test(l.onde));
  assert(ondeTorto.length === 0, `o "onde" de cada marco começa por preposição contraída${ondeTorto.length ? ` (torto em ${ondeTorto.map((l) => l.id).join(", ")})` : ""}`);

  // Esgotar o baralho não pode encravar a partida: recomeça.
  const esgotado = pickLandmark(LANDMARKS.map((l) => l.id));
  assert(!!esgotado && !!esgotado.id, "com o baralho todo usado, pickLandmark recomeça em vez de devolver vazio");
  const semUmSo = new Set();
  for (let i = 0; i < 40; i++) semUmSo.add(pickLandmark([LANDMARKS[0].id]).id);
  assert(!semUmSo.has(LANDMARKS[0].id), "pickLandmark nunca repete um marco que já saiu");
}

console.log(process.exitCode ? "\nAlguns testes falharam." : "\nTodos os testes passaram.");
