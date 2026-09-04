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
  bonusGames: ["hangman", "mapTrivia"],
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

export function shuffleArray(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const shuffle = shuffleArray;

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

// --- Dados do Mapa-Múndi (partilhados entre o mini-jogo solo e a versão
// em equipa do multiplayer) — posições aproximadas de um mapa-múndi
// equiretangular simplificado, suficientes para um jogo casual. ---
export const MAP_COUNTRIES = [
  { name: "Portugal", x: 47.8, y: 28.1, continent: "Europa", english: false, euro: true },
  { name: "Espanha", x: 48.9, y: 27.6, continent: "Europa", english: false, euro: true },
  { name: "França", x: 50.6, y: 24.1, continent: "Europa", english: false, euro: true },
  { name: "Alemanha", x: 52.9, y: 21.6, continent: "Europa", english: false, euro: true },
  { name: "Itália", x: 53.5, y: 26.7, continent: "Europa", english: false, euro: true },
  { name: "Reino Unido", x: 49.6, y: 20.8, continent: "Europa", english: true, euro: false },
  { name: "Irlanda", x: 47.8, y: 20.3, continent: "Europa", english: true, euro: true },
  { name: "Suécia", x: 54.2, y: 15.6, continent: "Europa", english: false, euro: false },
  { name: "Polónia", x: 55.3, y: 21.2, continent: "Europa", english: false, euro: false },
  { name: "Rússia", x: 60.4, y: 19.1, continent: "Europa", english: false, euro: false },
  { name: "Estados Unidos", x: 22.8, y: 28.3, continent: "América do Norte", english: true, euro: false },
  { name: "Canadá", x: 20.6, y: 18.9, continent: "América do Norte", english: true, euro: false },
  { name: "México", x: 21.7, y: 37.2, continent: "América do Norte", english: false, euro: false },
  { name: "Brasil", x: 35.8, y: 55.6, continent: "América do Sul", english: false, euro: false },
  { name: "Argentina", x: 32.2, y: 68.9, continent: "América do Sul", english: false, euro: false },
  { name: "Chile", x: 30.3, y: 66.7, continent: "América do Sul", english: false, euro: false },
  { name: "Colômbia", x: 29.4, y: 47.8, continent: "América do Sul", english: false, euro: false },
  { name: "Peru", x: 28.9, y: 55.6, continent: "América do Sul", english: false, euro: false },
  { name: "Egito", x: 58.6, y: 35.6, continent: "África", english: false, euro: false },
  { name: "Nigéria", x: 52.2, y: 45, continent: "África", english: true, euro: false },
  { name: "África do Sul", x: 56.7, y: 66.1, continent: "África", english: true, euro: false },
  { name: "Quénia", x: 60.6, y: 50, continent: "África", english: true, euro: false },
  { name: "Marrocos", x: 48.1, y: 32.2, continent: "África", english: false, euro: false },
  { name: "Angola", x: 55, y: 56.7, continent: "África", english: false, euro: false },
  { name: "China", x: 78.9, y: 30.6, continent: "Ásia", english: false, euro: false },
  { name: "Japão", x: 88.3, y: 30, continent: "Ásia", english: false, euro: false },
  { name: "Índia", x: 71.7, y: 38.3, continent: "Ásia", english: true, euro: false },
  { name: "Austrália", x: 87.2, y: 63.9, continent: "Oceânia", english: true, euro: false },
  { name: "Nova Zelândia", x: 98.3, y: 72.8, continent: "Oceânia", english: true, euro: false },
  { name: "Indonésia", x: 81.4, y: 51.1, continent: "Ásia", english: false, euro: false },
  { name: "Coreia do Sul", x: 85.3, y: 30, continent: "Ásia", english: false, euro: false },
  { name: "Arábia Saudita", x: 62.5, y: 36.7, continent: "Ásia", english: false, euro: false },
];

export const MAP_BACKGROUND_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 14,14 C 10,20 8,30 14,36 C 12,40 18,42 22,38 C 26,42 32,40 30,34 C 36,32 38,24 32,18 C 34,12 26,8 20,12 C 18,8 14,10 14,14 Z" class="map-blob" />
  <path d="M 28,46 C 24,52 22,60 26,66 C 24,70 28,74 32,70 C 36,74 40,68 36,62 C 40,56 38,48 32,46 C 30,44 28,44 28,46 Z" class="map-blob" />
  <path d="M 46,14 C 44,18 44,24 48,26 C 46,30 50,32 54,28 C 58,30 62,26 58,22 C 60,18 56,14 52,16 C 50,12 46,12 46,14 Z" class="map-blob" />
  <path d="M 48,34 C 44,40 44,50 48,56 C 46,62 50,68 56,66 C 60,70 64,64 60,58 C 64,52 62,44 56,40 C 58,36 52,32 48,34 Z" class="map-blob" />
  <path d="M 62,14 C 58,20 60,28 66,26 C 64,32 68,38 74,34 C 78,40 86,38 84,30 C 90,32 94,26 88,20 C 92,14 84,10 78,14 C 74,10 66,10 62,14 Z" class="map-blob" />
  <path d="M 82,60 C 80,64 82,70 88,70 C 90,74 96,72 94,66 C 96,62 90,58 86,60 C 84,58 82,58 82,60 Z" class="map-blob" />
  <path d="M 96,70 C 95,72 96,75 98,74 C 99,76 100,74 99,72 Z" class="map-blob" />
</svg>`;

// Critério aleatório para uma ronda de Mapa-Múndi: um país específico, um
// continente, "fala inglês" ou "usa o Euro". `matchNames` é um array (não
// Set) para poder ir direto para a Realtime Database.
export function pickMapCriteria() {
  const types = ["country", "language", "continent", "currency"];
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === "country") {
    const country = MAP_COUNTRIES[Math.floor(Math.random() * MAP_COUNTRIES.length)];
    return { type, matchNames: [country.name], promptText: `Onde fica ${country.name}?` };
  }
  if (type === "language") {
    const matchNames = MAP_COUNTRIES.filter((c) => c.english).map((c) => c.name);
    return { type, matchNames, promptText: "Clica num país onde a maioria fala inglês." };
  }
  if (type === "currency") {
    const matchNames = MAP_COUNTRIES.filter((c) => c.euro).map((c) => c.name);
    return { type, matchNames, promptText: "Clica num país que usa o Euro." };
  }
  const continents = [...new Set(MAP_COUNTRIES.map((c) => c.continent))];
  const continent = continents[Math.floor(Math.random() * continents.length)];
  const matchNames = MAP_COUNTRIES.filter((c) => c.continent === continent).map((c) => c.name);
  return { type, matchNames, promptText: `Clica num país da ${continent}.` };
}
