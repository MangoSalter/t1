// O caminho vem do runner (EU_SEI_PUBLIC), como em test-mapa.mjs: escrito à
// mão ficava preso à máquina onde foi escrito, e a suite não corria em mais
// lado nenhum.
import path from "node:path";
import { pathToFileURL } from "node:url";

const publicDir = process.env.EU_SEI_PUBLIC;
const {
  CATEGORIES, ALPHABET, HARD_LETTERS, pickLetters, pickCategories, catKey, catIndexFromKey,
  LANDMARKS, pickLandmark,
  CUSTOM_CAT_OFFSET, MAX_CUSTOM_CATEGORIES, MAX_CUSTOM_CATEGORY_LEN,
  limparCategoriasProprias, nomeDaCategoria, ehCategoriaPropria,
  desafioDoDia, diaDoDesafio, DESAFIO_CATEGORIAS,
} = await import(pathToFileURL(path.join(publicDir, "js", "data.js")).href);

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

// --- Categorias da casa ---
//
// A limpeza é o que separa "escrever uma categoria" de "estragar a sala":
// espaços a mais, a mesma escrita de outra maneira, uma repetida da lista de
// origem, ou trinta de uma vez.
{
  const limpas = limparCategoriasProprias([
    "  Marcas   de carro ", "marcas de carro", "MARCAS DE CARRO",
    "Comida", "", "   ", "x".repeat(80),
    "A", "B", "C", "D", "E", "F", "G", "H", "I",
  ]);
  assert(limpas[0] === "Marcas de carro", `junta os espaços e corta as pontas (${limpas[0]})`);
  assert(!limpas.includes("marcas de carro"), "não deixa entrar a mesma escrita de outra maneira");
  assert(!limpas.includes("Comida"), "não deixa repetir uma categoria de origem");
  assert(limpas.every((c) => c.length <= MAX_CUSTOM_CATEGORY_LEN), "corta as compridas de mais");
  assert(limpas.length === MAX_CUSTOM_CATEGORIES, `nunca passa de ${MAX_CUSTOM_CATEGORIES} (tem ${limpas.length})`);
  assert(limparCategoriasProprias(undefined).length === 0, "sem lista nenhuma devolve vazio, não rebenta");
}

{
  assert(nomeDaCategoria(0) === CATEGORIES[0], "índice normal vem da lista de origem");
  assert(nomeDaCategoria(CUSTOM_CAT_OFFSET, ["Coisas da avó"]) === "Coisas da avó", "índice da casa vem da lista da casa");
  // Uma sala pode ter guardado um índice cuja categoria já foi apagada: o
  // ecrã tem de mostrar alguma coisa em vez de "undefined" a meio da ronda.
  assert(nomeDaCategoria(CUSTOM_CAT_OFFSET + 5, ["Só uma"]) === "Categoria da casa", "índice da casa que já não existe tem nome de recurso");
  // 45 é menor do que o 100 das da casa, e maior do que a lista de origem.
  assert(nomeDaCategoria(45) === "Categoria", "índice de origem que não existe também tem nome de recurso");
  assert(ehCategoriaPropria(CUSTOM_CAT_OFFSET) && !ehCategoriaPropria(39), "a fronteira entre as duas famílias de índices");
}

{
  // O sorteio tem de saber sortear as da casa, senão escrevê-las não servia
  // para nada.
  const sorteadas = pickCategories(3, new Set(), new Set([CUSTOM_CAT_OFFSET, CUSTOM_CAT_OFFSET + 1, 4]));
  assert(sorteadas.length === 3, "sorteia as três pedidas");
  assert(sorteadas.includes(CUSTOM_CAT_OFFSET) && sorteadas.includes(CUSTOM_CAT_OFFSET + 1), "e as da casa estão lá");
  const soDaCasa = pickCategories(5, new Set(), new Set([CUSTOM_CAT_OFFSET]));
  assert(soDaCasa.length === 1 && soDaCasa[0] === CUSTOM_CAT_OFFSET, "com uma só, sorteia essa e não inventa mais");
}

// --- O desafio do dia ---
//
// Só serve para alguma coisa se for MESMO igual para toda a gente: a mesma
// data tem de dar sempre a mesma letra e as mesmas categorias, em qualquer
// telemóvel e daqui a um ano. Um sorteio normal aqui dava a cada pessoa um
// desafio diferente e não haveria nada para comparar.
{
  const a = desafioDoDia("2026-09-09");
  const b = desafioDoDia("2026-09-09");
  assert(JSON.stringify(a) === JSON.stringify(b), "o mesmo dia dá sempre o mesmo desafio");
  assert(a.categorias.length === DESAFIO_CATEGORIAS, `${DESAFIO_CATEGORIAS} categorias`);
  assert(new Set(a.categorias).size === a.categorias.length, "sem categorias repetidas");
  assert(a.categorias.every((i) => i >= 0 && i < CATEGORIES.length), "todas da lista de origem");
  assert(!HARD_LETTERS.has(a.letra), `a letra do dia não é difícil (saiu ${a.letra})`);

  // Dias diferentes têm de dar desafios diferentes quase sempre — senão a
  // "novidade do dia" era a mesma ronda semana após semana.
  const vistos = new Set();
  const letras = new Set();
  for (let d = 1; d <= 28; d += 1) {
    const r = desafioDoDia(`2026-10-${String(d).padStart(2, "0")}`);
    vistos.add(`${r.letra}|${r.categorias.join(",")}`);
    letras.add(r.letra);
    assert(new Set(r.categorias).size === DESAFIO_CATEGORIAS, `dia ${d}: ${DESAFIO_CATEGORIAS} categorias sem repetir`);
  }
  assert(vistos.size === 28, `28 dias, 28 desafios diferentes (foram ${vistos.size})`);
  assert(letras.size >= 8, `e letras variadas ao longo do mês (foram ${letras.size})`);
}

{
  // O dia é o LOCAL, não o UTC: o desafio muda à meia-noite de quem joga.
  const meiaNoiteLocal = new Date(2026, 0, 1, 0, 30);
  assert(diaDoDesafio(meiaNoiteLocal) === "2026-01-01", `dia local (deu ${diaDoDesafio(meiaNoiteLocal)})`);
  const fimDoDiaLocal = new Date(2026, 11, 31, 23, 30);
  assert(diaDoDesafio(fimDoDiaLocal) === "2026-12-31", `fim do ano local (deu ${diaDoDesafio(fimDoDiaLocal)})`);
}
