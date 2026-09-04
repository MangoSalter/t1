// Pool de categorias e letras do jogo "Eu sei".
// Mantido separado da lógica para ser fácil de editar/expandir mais tarde.

export const CATEGORIES = [
  "Nomes", "Países", "Comida", "Aplicação", "Cidade", "Animal", "Fruta", "Cor",
  "Profissão", "Marca", "Filme", "Desporto", "Instrumento musical",
  "Objeto de cozinha", "Peça de roupa", "Planta", "Bebida", "Carro",
  "Super-herói", "Jogo", "Rio", "Elemento químico", "Disciplina escolar",
  "Ferramenta", "Inseto", "Ave", "Peixe", "Sobremesa", "Personagem histórico",
  "Série de TV", "Livro", "Palavra em inglês", "Capital", "Doença", "Signo",
  "Rede social", "Emoção", "Verbo", "Objeto de casa de banho",
  "Insulto (leve/família-friendly)",
];

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const HARD_LETTERS = new Set(["K", "W", "Y"]);

export const DEFAULT_CONFIG = {
  numCategories: 8,
  timeLimit: 90,
  excludeHardLetters: true,
  numRounds: 5,
};

export const CONFIG_LIMITS = {
  numCategories: { min: 4, max: 15 },
  timeLimit: { min: 30, max: 300 },
  numRounds: { min: 1, max: 15 },
};

export const MAX_PLAYERS = 10;
export const VOTING_TIME_SECONDS = 60; // não especificado na spec; limite razoável para a votação não bloquear o jogo.
export const BALL_MIN_DELAY_MS = 2000;
export const BALL_MAX_DELAY_MS = 4000;

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickLetters(count, usedLetters, excludeHard) {
  let pool = ALPHABET.filter((l) => !usedLetters.has(l));
  if (excludeHard) pool = pool.filter((l) => !HARD_LETTERS.has(l));
  if (pool.length < count) {
    // Esgotou-se o alfabeto disponível: recomeça a exclui apenas as usadas nesta escolha.
    pool = ALPHABET.filter((l) => (excludeHard ? !HARD_LETTERS.has(l) : true));
  }
  return shuffle(pool).slice(0, count);
}

// Firebase Realtime Database silently turns an object into an array when
// every key looks like a plain integer ("0","1","2",...) — reading it back
// then yields `null` holes for anything not explicitly set, which breaks
// "was this category index already used" checks. Prefixing the index keeps
// the key non-numeric so this never happens, both for `usedCategories` and
// for `answers/{uid}/{categoryIndex}`.
export function catKey(i) {
  return "c" + i;
}

export function catIndexFromKey(key) {
  return parseInt(key.slice(1), 10);
}

export const MIN_ENABLED_CATEGORIES = 4;

// `enabledIndexes`: Set opcional de índices permitidos (categorias ativadas
// pelo jogador/anfitrião). Omitido ou vazio = todas as 40 estão disponíveis.
export function pickCategories(count, usedIndexes, enabledIndexes) {
  const pool = enabledIndexes && enabledIndexes.size > 0
    ? CATEGORIES.map((_, i) => i).filter((i) => enabledIndexes.has(i))
    : CATEGORIES.map((_, i) => i);
  const wanted = Math.min(count, pool.length);
  let available = pool.filter((i) => !usedIndexes.has(i));
  if (available.length < wanted) {
    available = pool;
  }
  return shuffle(available).slice(0, wanted);
}
