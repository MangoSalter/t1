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

// Mapa-múndi estilizado (não é geograficamente exato, mas as massas de
// terra estão nas posições relativas certas e são coloridas por
// continente, com fronteiras a tinta — para dar contexto visual à ronda,
// já que a resposta agora é escrita, não clicada). viewBox 2:1 para bater
// certo com o aspect-ratio do .map-arena (sem preserveAspectRatio="none",
// para não esticar as formas).
export const MAP_BACKGROUND_SVG = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <g stroke="var(--paper-line)" stroke-width="0.4" opacity="0.6">
    <line x1="0" y1="20" x2="200" y2="20" /><line x1="0" y1="40" x2="200" y2="40" />
    <line x1="0" y1="60" x2="200" y2="60" /><line x1="0" y1="80" x2="200" y2="80" />
    <line x1="25" y1="0" x2="25" y2="100" /><line x1="50" y1="0" x2="50" y2="100" />
    <line x1="75" y1="0" x2="75" y2="100" /><line x1="100" y1="0" x2="100" y2="100" />
    <line x1="125" y1="0" x2="125" y2="100" /><line x1="150" y1="0" x2="150" y2="100" />
    <line x1="175" y1="0" x2="175" y2="100" />
  </g>
  <path d="M 20,12 C 14,10 8,14 9,20 C 5,24 6,32 12,34 C 10,38 14,42 19,40 C 18,44 22,48 26,44 C 30,48 36,44 34,38 C 40,36 42,28 36,24 C 40,20 36,12 30,14 C 28,9 22,8 20,12 Z
    M 22,46 C 18,50 20,58 26,60 C 24,68 30,84 34,88 C 37,92 41,88 39,82 C 43,76 41,66 37,62 C 39,56 35,48 29,48 C 27,44 24,43 22,46 Z"
    class="map-land map-land-americas" />
  <path d="M 96,10 C 92,9 88,12 89,16 C 85,18 86,24 90,26 C 88,30 92,34 96,31 C 100,34 104,30 101,26 C 105,24 104,18 99,17 C 100,12 99,10 96,10 Z"
    class="map-land map-land-europe" />
  <path d="M 92,28 C 87,32 86,40 90,44 C 87,50 89,58 93,60 C 91,66 94,74 98,78 C 100,84 106,86 108,80 C 112,78 112,70 108,66 C 112,60 110,50 105,46 C 108,42 106,34 100,32 C 100,28 96,26 92,28 Z"
    class="map-land map-land-africa" />
  <path d="M 108,14 C 104,20 106,28 112,26 C 110,32 116,36 120,32 C 124,40 134,42 138,36 C 148,38 158,32 156,24 C 164,26 172,20 166,14 C 170,8 162,6 156,10 C 150,6 140,8 138,14 C 130,10 118,10 114,16 C 112,12 110,12 108,14 Z
    M 128,44 C 124,48 126,56 132,58 C 130,62 134,66 138,62 C 142,58 140,50 136,46 C 134,42 130,41 128,44 Z"
    class="map-land map-land-asia" />
  <path d="M 158,68 C 154,70 152,76 156,80 C 154,84 158,88 164,86 C 170,90 178,86 176,80 C 182,78 180,70 174,70 C 172,66 162,66 158,68 Z"
    class="map-land map-land-oceania" />
</svg>`;

// Remove acentos e normaliza para comparar respostas escritas sem exigir
// que o jogador acerte a acentuação exata (ex.: "frança" == "França").
export function normalizeCountryName(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Critério aleatório para uma ronda de Mapa-Múndi: um continente, "fala
// inglês" ou "usa o Euro" — o jogador escreve o nome de QUALQUER país que
// cumpra o critério (mais do que uma resposta certa possível, por ser
// escrita e não clicada). `matchNames` é um array (não Set) para poder ir
// direto para a Realtime Database.
export function pickMapCriteria() {
  const types = ["language", "continent", "currency"];
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === "language") {
    const matchNames = MAP_COUNTRIES.filter((c) => c.english).map((c) => c.name);
    return { type, matchNames, promptText: "Escreve o nome de um país onde a maioria fala inglês." };
  }
  if (type === "currency") {
    const matchNames = MAP_COUNTRIES.filter((c) => c.euro).map((c) => c.name);
    return { type, matchNames, promptText: "Escreve o nome de um país que usa o Euro." };
  }
  const continents = [...new Set(MAP_COUNTRIES.map((c) => c.continent))];
  const continent = continents[Math.floor(Math.random() * continents.length)];
  const matchNames = MAP_COUNTRIES.filter((c) => c.continent === continent).map((c) => c.name);
  return { type, matchNames, promptText: `Escreve o nome de um país da ${continent}.` };
}

// --- "Onde Fica Isto?": mini-jogo de identificar um marco/monumento
// famoso a partir de um desenho simples (estilo postal ilustrado à mão,
// sem fotos reais), com escolha múltipla. Partilhado entre o mini-jogo
// solo e uma futura versão em equipa. ---
export const LANDMARKS = [
  {
    id: "eiffel", name: "Torre Eiffel", answer: "França",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="10" y1="88" x2="90" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <path d="M50,10 L30,88 M50,10 L70,88 M38,55 L62,55 M32,72 L68,72 M42,35 L58,35" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M44,10 L50,4 L56,10 Z" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "piramides", name: "Pirâmides de Gizé", answer: "Egito",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="88" x2="94" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <circle cx="80" cy="22" r="10" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.6"/>
      <polygon points="50,20 20,88 80,88" fill="#e3c98f" stroke="var(--ink)" stroke-width="2.4"/>
      <polygon points="50,20 65,88 80,88" fill="#d9ba75" stroke="var(--ink)" stroke-width="2" opacity="0.7"/>
      <polygon points="20,88 40,50 50,88" fill="#e3c98f" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "cristo", name: "Cristo Redentor", answer: "Brasil",
    // Silhueta de figura vestida com túnica, braços abertos ao alto (como
    // a estátua real, não um simples "mais" em cima de uma colina).
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M6,92 C 24,68 76,68 94,92 Z" fill="#8fb56f" stroke="var(--ink)" stroke-width="2"/>
      <path d="M50,50 L18,38 M50,50 L82,38" fill="none" stroke="#e7e2d3" stroke-width="7" stroke-linecap="round"/>
      <path d="M50,50 L18,38 M50,50 L82,38" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
      <path d="M41,88 L41,50 C 41,38 59,38 59,50 L59,88 Z" fill="#e7e2d3" stroke="var(--ink)" stroke-width="2.2"/>
      <circle cx="50" cy="27" r="8" fill="#f0cf8f" stroke="var(--ink)" stroke-width="2.2"/>
    </svg>`,
  },
  {
    id: "muralha", name: "Grande Muralha da China", answer: "China",
    // Muralha em degraus a subir colinas, com ameias (dentes) no topo e uma
    // torre de vigia — a versão anterior era só uma linha ondulada com uma
    // casinha ao lado, irreconhecível como muralha.
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,84 L14,58 L26,74 L40,48 L56,70 L70,44 L86,66 L100,52 L100,100 L0,100 Z" fill="#a8bf8a" stroke="none"/>
      <path d="M4,80 L18,80 L18,68 L30,68 L30,76 L42,76 L42,60 L54,60 L54,70 L66,70 L66,52 L78,52 L78,62 L94,62"
        fill="none" stroke="#c9a877" stroke-width="9" stroke-linejoin="round"/>
      <path d="M4,80 L18,80 L18,68 L30,68 L30,76 L42,76 L42,60 L54,60 L54,70 L66,70 L66,52 L78,52 L78,62 L94,62"
        fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>
      <g fill="#c9a877" stroke="var(--ink)" stroke-width="1.2">
        <rect x="6" y="75" width="4" height="5"/>
        <rect x="13" y="75" width="4" height="5"/>
        <rect x="20" y="63" width="4" height="5"/>
        <rect x="34" y="71" width="4" height="5"/>
        <rect x="46" y="55" width="4" height="5"/>
        <rect x="58" y="65" width="4" height="5"/>
        <rect x="70" y="47" width="4" height="5"/>
        <rect x="82" y="57" width="4" height="5"/>
        <rect x="89" y="57" width="4" height="5"/>
      </g>
      <rect x="46" y="42" width="12" height="18" fill="#c9a877" stroke="var(--ink)" stroke-width="1.8"/>
      <polygon points="44,42 52,32 60,42" fill="var(--primary)" stroke="var(--ink)" stroke-width="1.6"/>
    </svg>`,
  },
  {
    id: "liberdade", name: "Estátua da Liberdade", answer: "Estados Unidos",
    // Braço ligado ao corpo a erguer a tocha (antes era uma linha solta ao
    // lado da figura, parecia um poste de luz em vez de um braço erguido).
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="38" y="82" width="24" height="8" fill="#9db89a" stroke="var(--ink)" stroke-width="2"/>
      <path d="M42,82 L42,48 C 42,38 58,38 58,48 L58,82 Z" fill="#a8c4a3" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M56,52 C 66,48 70,32 68,17" fill="none" stroke="#a8c4a3" stroke-width="7" stroke-linecap="round"/>
      <path d="M56,52 C 66,48 70,32 68,17" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
      <path d="M68,17 L62,9 L70,7 L76,15 Z" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.8"/>
      <circle cx="50" cy="32" r="9" fill="#a8c4a3" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M43,24 L47,13 M50,24 L50,11 M57,24 L53,13" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "bigben", name: "Big Ben", answer: "Reino Unido",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="38" y="30" width="24" height="58" fill="#d9a563" stroke="var(--ink)" stroke-width="2.2"/>
      <polygon points="34,30 50,10 66,30" fill="var(--primary)" stroke="var(--ink)" stroke-width="2.2"/>
      <circle cx="50" cy="42" r="9" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <line x1="50" y1="42" x2="50" y2="36" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/>
      <line x1="50" y1="42" x2="55" y2="44" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/>
      <line x1="12" y1="88" x2="88" y2="88" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "opera", name: "Ópera de Sydney", answer: "Austrália",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="88" x2="94" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <path d="M14,88 C 14,60 30,40 34,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M34,88 C 34,52 54,28 58,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M58,88 C 58,62 72,44 76,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
    </svg>`,
  },
  {
    id: "tajmahal", name: "Taj Mahal", answer: "Índia",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="8" y1="88" x2="92" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <rect x="30" y="55" width="40" height="33" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M35,55 C 35,35 65,35 65,55 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <circle cx="50" cy="30" r="3" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.4"/>
      <rect x="14" y="65" width="8" height="23" fill="#f6efdd" stroke="var(--ink)" stroke-width="1.8"/>
      <rect x="78" y="65" width="8" height="23" fill="#f6efdd" stroke="var(--ink)" stroke-width="1.8"/>
    </svg>`,
  },
];

export function pickLandmarkRound(usedIds) {
  const available = LANDMARKS.filter((l) => !usedIds.has(l.id));
  const pool = available.length > 0 ? available : LANDMARKS;
  const landmark = pool[Math.floor(Math.random() * pool.length)];
  const otherAnswers = shuffleArray(LANDMARKS.filter((l) => l.answer !== landmark.answer).map((l) => l.answer));
  const uniqueDistractors = [...new Set(otherAnswers)].slice(0, 3);
  const options = shuffleArray([landmark.answer, ...uniqueDistractors]);
  return { landmark, options };
}

// --- Palavras para o "Desenha e Adivinha" ---
// Escolhidas por serem DESENHÁVEIS (coisas concretas, com forma óbvia), ao
// contrário do banco da Forca, que tem palavras como "ENGENHEIRO" — boas
// para adivinhar letra a letra, impossíveis de desenhar.
export const DRAW_WORDS = [
  "Elefante", "Girafa", "Pinguim", "Tartaruga", "Golfinho", "Caranguejo", "Borboleta", "Aranha",
  "Bicicleta", "Comboio", "Avião", "Barco", "Foguetão", "Helicóptero", "Trator", "Autocarro",
  "Guarda-chuva", "Óculos", "Chapéu", "Sapato", "Relógio", "Chave", "Escada", "Martelo",
  "Banana", "Melancia", "Ananás", "Pizza", "Gelado", "Bolo", "Ovo estrelado", "Cachupa",
  "Casa", "Farol", "Ponte", "Castelo", "Igreja", "Moinho", "Tenda", "Piscina",
  "Sol", "Nuvem", "Trovoada", "Arco-íris", "Vulcão", "Ilha", "Cascata", "Palmeira",
  "Violão", "Tambor", "Piano", "Microfone", "Televisão", "Telemóvel", "Câmara", "Livro",
  "Fantasma", "Robô", "Dragão", "Sereia", "Bruxa", "Coroa", "Espada", "Tesouro",
  "Futebol", "Basquetebol", "Surf", "Skate", "Paraquedas", "Pesca", "Xadrez", "Balão de ar quente",
];

// Escolhe uma palavra ainda não usada nesta partida (recomeça se esgotar).
export function pickDrawWord(usedWords) {
  const used = new Set(usedWords || []);
  const available = DRAW_WORDS.filter((w) => !used.has(w));
  const pool = available.length > 0 ? available : DRAW_WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}
