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
  // O quadro e o mapa novo — os dois que estão no site. Estava aqui o
  // Mapa-Múndi antigo, que foi para a oficina: uma sala acabada de criar
  // trazia por omissão um jogo que já não se mostra a ninguém.
  bonusGames: ["hangman", "mapa"],
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

// --- CATEGORIAS DA CASA ---
//
// O jogo traz 40, mas cada grupo tem as suas: "marcas de carro", "coisas na
// mala da avó", "personagens da Disney". Escrever as próprias é a coisa que
// mais se pede neste género — o "Stop" de papel joga-se assim desde sempre, e
// é o que falta às aplicações que existem (deixam ESCOLHER da lista, não
// ACRESCENTAR).
//
// Vivem num espaço de índices próprio, a partir do 100. Podia ser
// CATEGORIES.length, mas então acrescentar uma categoria de origem mudava o
// significado dos índices já guardados numa sala a meio de uma partida — as
// respostas ficam gravadas por índice (`answers/{uid}/c7`).
export const CUSTOM_CAT_OFFSET = 100;
export const MAX_CUSTOM_CATEGORIES = 8;
export const MAX_CUSTOM_CATEGORY_LEN = 28;

export function ehCategoriaPropria(indice) {
  return indice >= CUSTOM_CAT_OFFSET;
}

// Uma lista escrita à mão chega sempre suja: espaços, vazios, repetidos, e
// alguém a escrever "Comida" que já lá está. Limpa-se num sítio só, e tanto
// quem escreve como quem lê passa por aqui.
export function limparCategoriasProprias(lista) {
  const vistas = new Set(CATEGORIES.map((c) => c.toLowerCase()));
  const saida = [];
  for (const bruta of Array.isArray(lista) ? lista : []) {
    const nome = String(bruta || "").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_CATEGORY_LEN);
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(nome);
    if (saida.length >= MAX_CUSTOM_CATEGORIES) break;
  }
  return saida;
}

// O nome a mostrar, venha ele da lista de origem ou da casa. Nunca devolve
// vazio: um índice que já não existe (a sala guardou uma categoria que
// entretanto foi apagada) mostra-se como categoria sem nome em vez de deixar
// um "undefined" no ecrã a meio de uma ronda.
export function nomeDaCategoria(indice, proprias = []) {
  if (ehCategoriaPropria(indice)) return proprias[indice - CUSTOM_CAT_OFFSET] || "Categoria da casa";
  return CATEGORIES[indice] || "Categoria";
}

// --- O DESAFIO DO DIA ---
//
// Uma ronda por dia, igual para toda a gente, sorteada a partir da data. É o
// que faz voltar a um jogo destes sem ter de haver ninguém do outro lado —
// e o que as pessoas comparam entre si sem precisarem de estar na mesma sala.
//
// Determinístico de propósito e sem servidor: a mesma data dá sempre a mesma
// letra e as mesmas categorias, em qualquer telemóvel. Um sorteio normal aqui
// não servia — cada pessoa jogava um desafio diferente e não haveria nada
// para comparar.
export const DESAFIO_CATEGORIAS = 6;
export const DESAFIO_SEGUNDOS = 90;

// Dia em hora LOCAL, não UTC: o desafio muda à meia-noite de quem joga, que é
// quando se espera que mude.
export function diaDoDesafio(quando = new Date()) {
  const ano = quando.getFullYear();
  const mes = String(quando.getMonth() + 1).padStart(2, "0");
  const dia = String(quando.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Hash simples e estável (FNV-1a de 32 bits). Não precisa de ser bom em
// criptografia; precisa de dar sempre o mesmo número para o mesmo texto, em
// qualquer browser, hoje e daqui a um ano.
function semente(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function proximo(estado) {
  // xorshift32: um número a seguir ao outro, sempre os mesmos.
  let x = estado;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  return x >>> 0;
}

export function desafioDoDia(dia = diaDoDesafio(), quantas = DESAFIO_CATEGORIAS) {
  let estado = semente(`eu-sei:${dia}`) || 1;
  const tira = (limite) => {
    estado = proximo(estado);
    return estado % limite;
  };
  // As letras difíceis ficam de fora: um desafio único do dia em K ou W é uma
  // maneira de gastar o dia de toda a gente ao mesmo tempo.
  const letras = ALPHABET.filter((l) => !HARD_LETTERS.has(l));
  const letra = letras[tira(letras.length)];
  // Categorias da lista de origem apenas: o desafio é o mesmo para todos, e
  // as categorias da casa são de cada sala.
  const restantes = CATEGORIES.map((_, i) => i);
  const categorias = [];
  const quantasReais = Math.min(quantas, restantes.length);
  for (let i = 0; i < quantasReais; i += 1) {
    categorias.push(restantes.splice(tira(restantes.length), 1)[0]);
  }
  return { letra, categorias };
}

// `enabledIndexes`: Set opcional de índices permitidos (categorias ativadas
// pelo jogador/anfitrião), já com as da casa lá dentro se as houver. Omitido
// ou vazio = todas as 40 de origem estão disponíveis.
export function pickCategories(count, usedIndexes, enabledIndexes) {
  const pool = enabledIndexes && enabledIndexes.size > 0
    ? [...enabledIndexes]
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
    id: "sagrada", name: "Sagrada Família", answer: "Espanha",
    onde: "em Espanha", frase: "Era a Sagrada Família, em Espanha.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="90" x2="96" y2="90" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#e0d3b4" stroke="var(--ink)" stroke-width="1.8">
        <path d="M20,90 L20,44 Q24,22 28,44 L28,90 Z"/>
        <path d="M34,90 L34,34 Q38,10 42,34 L42,90 Z"/>
        <path d="M58,90 L58,34 Q62,10 66,34 L66,90 Z"/>
        <path d="M72,90 L72,44 Q76,22 80,44 L80,90 Z"/>
      </g>
      <path d="M44,90 L44,54 Q50,40 56,54 L56,90 Z" fill="#efe6d0" stroke="var(--ink)" stroke-width="2"/>
      <g fill="var(--accent)" stroke="var(--ink)" stroke-width="1.2">
        <circle cx="24" cy="40" r="3"/><circle cx="38" cy="30" r="3"/>
        <circle cx="62" cy="30" r="3"/><circle cx="76" cy="40" r="3"/>
      </g>
      <path d="M46,68 Q50,60 54,68 L54,90 L46,90 Z" fill="var(--ink)" opacity="0.65"/>
      <g stroke="var(--ink)" stroke-width="1" opacity="0.5">
        <path d="M20,60 L28,60 M34,54 L42,54 M58,54 L66,54 M72,60 L80,60"/>
      </g>
    </svg>`,
  },
  {
    id: "brandemburgo", name: "Portão de Brandemburgo", answer: "Alemanha",
    onde: "na Alemanha", frase: "Era o Portão de Brandemburgo, na Alemanha.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="88" x2="96" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#efe7d4" stroke="var(--ink)" stroke-width="1.8">
        <rect x="16" y="44" width="8" height="44"/><rect x="30" y="44" width="8" height="44"/>
        <rect x="44" y="44" width="8" height="44"/><rect x="58" y="44" width="8" height="44"/>
        <rect x="72" y="44" width="8" height="44"/>
      </g>
      <rect x="10" y="34" width="76" height="11" fill="#e4d9bd" stroke="var(--ink)" stroke-width="2"/>
      <rect x="12" y="26" width="72" height="8" fill="#efe7d4" stroke="var(--ink)" stroke-width="1.8"/>
      <g fill="#c9a877" stroke="var(--ink)" stroke-width="1.6">
        <rect x="38" y="14" width="24" height="6"/>
        <circle cx="44" cy="10" r="3"/><circle cx="52" cy="10" r="3"/>
        <path d="M60,20 L60,10 L66,14 Z"/>
      </g>
      <path d="M40,88 L40,52 L46,52 L46,88 Z" fill="var(--ink)" opacity="0.25"/>
    </svg>`,
  },
  {
    id: "mesquitaazul", name: "Mesquita Azul", answer: "Turquia",
    onde: "na Turquia", frase: "Era a Mesquita Azul, na Turquia.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="90" x2="96" y2="90" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#e8e0cc" stroke="var(--ink)" stroke-width="1.6">
        <path d="M12,90 L12,40 Q16,32 20,40 L20,90 Z"/>
        <path d="M80,90 L80,40 Q84,32 88,40 L88,90 Z"/>
      </g>
      <path d="M12,40 Q16,26 20,40 Z" fill="#5f86ad" stroke="var(--ink)" stroke-width="1.4"/>
      <path d="M80,40 Q84,26 88,40 Z" fill="#5f86ad" stroke="var(--ink)" stroke-width="1.4"/>
      <rect x="26" y="60" width="48" height="30" fill="#efe7d4" stroke="var(--ink)" stroke-width="2"/>
      <path d="M26,60 Q50,28 74,60 Z" fill="#5f86ad" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M34,62 Q42,46 50,62 Z" fill="#7ba3c9" stroke="var(--ink)" stroke-width="1.4"/>
      <path d="M50,62 Q58,46 66,62 Z" fill="#7ba3c9" stroke="var(--ink)" stroke-width="1.4"/>
      <path d="M50,28 L50,20" stroke="var(--ink)" stroke-width="1.8"/>
      <circle cx="50" cy="18" r="2.5" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.2"/>
      <rect x="45" y="74" width="10" height="16" fill="var(--ink)" opacity="0.6"/>
    </svg>`,
  },
  {
    id: "petra", name: "O Tesouro de Petra", answer: "Jordânia",
    onde: "na Jordânia", frase: "Era o Tesouro de Petra, na Jordânia.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100" fill="#c98f63"/>
      <path d="M0,0 L18,0 L14,100 L0,100 Z M86,0 L100,0 L100,100 L82,100 Z" fill="#a97245"/>
      <rect x="24" y="26" width="52" height="64" fill="#dda878" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#e8bd91" stroke="var(--ink)" stroke-width="1.5">
        <rect x="28" y="52" width="7" height="38"/><rect x="40" y="52" width="7" height="38"/>
        <rect x="53" y="52" width="7" height="38"/><rect x="65" y="52" width="7" height="38"/>
      </g>
      <polygon points="50,26 76,48 24,48" fill="#e8bd91" stroke="var(--ink)" stroke-width="2"/>
      <path d="M44,90 L44,66 Q50,58 56,66 L56,90 Z" fill="var(--ink)" opacity="0.75"/>
      <circle cx="50" cy="40" r="5" fill="#dda878" stroke="var(--ink)" stroke-width="1.6"/>
      <line x1="0" y1="90" x2="100" y2="90" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "angkor", name: "Angkor Wat", answer: "Camboja",
    onde: "no Camboja", frase: "Era Angkor Wat, no Camboja.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="80" width="100" height="20" fill="#8fa87b"/>
      <line x1="0" y1="80" x2="100" y2="80" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#cbbf9c" stroke="var(--ink)" stroke-width="1.8">
        <path d="M14,80 L14,52 Q20,34 26,52 L26,80 Z"/>
        <path d="M74,80 L74,52 Q80,34 86,52 L86,80 Z"/>
        <path d="M32,80 L32,44 Q38,24 44,44 L44,80 Z"/>
        <path d="M56,80 L56,44 Q62,24 68,44 L68,80 Z"/>
      </g>
      <path d="M40,80 L40,36 Q50,10 60,36 L60,80 Z" fill="#ddd2b0" stroke="var(--ink)" stroke-width="2.2"/>
      <rect x="10" y="70" width="80" height="10" fill="#ddd2b0" stroke="var(--ink)" stroke-width="1.8"/>
      <g stroke="var(--ink)" stroke-width="1" opacity="0.55">
        <path d="M44,52 L56,52 M42,60 L58,60 M16,62 L24,62 M76,62 L84,62"/>
      </g>
      <path d="M0,88 Q25,84 50,88 T100,88" fill="none" stroke="#7ba3c9" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "kinderdijk", name: "Moinhos de Kinderdijk", answer: "Países Baixos",
    onde: "nos Países Baixos", frase: "Eram os moinhos de Kinderdijk, nos Países Baixos.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="76" width="100" height="24" fill="#9dbb84"/>
      <path d="M0,88 Q30,84 60,88 T100,86 L100,100 L0,100 Z" fill="#7ba3c9"/>
      <line x1="0" y1="76" x2="100" y2="76" stroke="var(--ink)" stroke-width="1.8"/>
      <path d="M24,76 L30,34 L46,34 L52,76 Z" fill="#c9a877" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M28,30 L48,30 L46,36 L30,36 Z" fill="#8f5f3a" stroke="var(--ink)" stroke-width="1.8"/>
      <g stroke="var(--ink)" stroke-width="2.2" fill="#efe7d4">
        <path d="M38,33 L38,6 M38,33 L64,33 M38,33 L38,60 M38,33 L12,33"/>
      </g>
      <g fill="#efe7d4" stroke="var(--ink)" stroke-width="1.4">
        <rect x="35" y="6" width="6" height="14"/><rect x="50" y="30" width="14" height="6"/>
        <rect x="35" y="46" width="6" height="14"/><rect x="12" y="30" width="14" height="6"/>
      </g>
      <rect x="34" y="60" width="9" height="16" fill="var(--ink)" opacity="0.6"/>
      <path d="M70,76 L74,52 L84,52 L88,76 Z" fill="#c9a877" stroke="var(--ink)" stroke-width="1.6" opacity="0.8"/>
    </svg>`,
  },
  {
    id: "obelisco", name: "Obelisco de Buenos Aires", answer: "Argentina",
    onde: "na Argentina", frase: "Era o Obelisco de Buenos Aires, na Argentina.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="84" width="100" height="16" fill="#b9b3a6"/>
      <line x1="0" y1="84" x2="100" y2="84" stroke="var(--ink)" stroke-width="2"/>
      <path d="M42,84 L45,20 L50,10 L55,20 L58,84 Z" fill="#efe7d4" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M50,10 L55,20 L50,20 Z" fill="#d8cfb8" stroke="none"/>
      <rect x="38" y="84" width="24" height="6" fill="#e0d9c6" stroke="var(--ink)" stroke-width="1.8"/>
      <g stroke="var(--ink)" stroke-width="1" opacity="0.45">
        <path d="M44,40 L56,40 M43,58 L57,58"/>
      </g>
      <g fill="#7ba3c9" stroke="var(--ink)" stroke-width="1.2">
        <rect x="8" y="70" width="18" height="14"/><rect x="74" y="66" width="18" height="18"/>
      </g>
      <circle cx="50" cy="6" r="2" fill="var(--accent)" stroke="var(--ink)" stroke-width="1"/>
    </svg>`,
  },
  {
    id: "torrecn", name: "Torre CN", answer: "Canadá",
    onde: "no Canadá", frase: "Era a Torre CN, no Canadá.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="88" width="100" height="12" fill="#8f9aa8"/>
      <line x1="0" y1="88" x2="100" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <path d="M44,88 L47,44 L53,44 L56,88 Z" fill="#d9d3c6" stroke="var(--ink)" stroke-width="2"/>
      <path d="M40,44 Q50,32 60,44 Q50,50 40,44 Z" fill="#efe7d4" stroke="var(--ink)" stroke-width="2"/>
      <rect x="42" y="36" width="16" height="8" fill="#c4bdae" stroke="var(--ink)" stroke-width="1.6"/>
      <path d="M48,36 L48,16 L52,16 L52,36 Z" fill="#d9d3c6" stroke="var(--ink)" stroke-width="1.8"/>
      <line x1="50" y1="16" x2="50" y2="4" stroke="var(--ink)" stroke-width="2"/>
      <circle cx="50" cy="3" r="2" fill="var(--accent)" stroke="var(--ink)" stroke-width="1"/>
      <g fill="#a8b4c2" stroke="var(--ink)" stroke-width="1.2">
        <rect x="10" y="70" width="14" height="18"/><rect x="28" y="76" width="10" height="12"/>
        <rect x="66" y="72" width="12" height="16"/><rect x="82" y="78" width="10" height="10"/>
      </g>
    </svg>`,
  },
  {
    id: "belem", name: "Torre de Belém", answer: "Portugal",
    onde: "em Portugal", frase: "Era a Torre de Belém, em Portugal.",
    // A primeira da casa: o jogo é português e o baralho não tinha um único
    // sítio que se pudesse ir ver ao domingo.
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,80 Q25,76 50,80 T100,80 L100,100 L0,100 Z" fill="#9fc4d8" stroke="none"/>
      <rect x="26" y="52" width="44" height="30" fill="#e8dcc0" stroke="var(--ink)" stroke-width="2.2"/>
      <rect x="38" y="18" width="22" height="36" fill="#efe4cb" stroke="var(--ink)" stroke-width="2.2"/>
      <g fill="#efe4cb" stroke="var(--ink)" stroke-width="1.6">
        <rect x="26" y="48" width="6" height="5"/><rect x="36" y="48" width="6" height="5"/>
        <rect x="46" y="48" width="6" height="5"/><rect x="56" y="48" width="6" height="5"/>
        <rect x="64" y="48" width="6" height="5"/>
        <rect x="38" y="14" width="5" height="5"/><rect x="47" y="14" width="5" height="5"/><rect x="55" y="14" width="5" height="5"/>
      </g>
      <g fill="#efe4cb" stroke="var(--ink)" stroke-width="1.8">
        <circle cx="28" cy="60" r="5"/><circle cx="68" cy="60" r="5"/>
      </g>
      <path d="M45,82 L45,66 Q49,60 53,66 L53,82 Z" fill="var(--ink)" opacity="0.75"/>
      <path d="M42,30 L56,30 M42,38 L56,38" stroke="var(--ink)" stroke-width="1.4"/>
    </svg>`,
  },
  {
    id: "coliseu", name: "Coliseu de Roma", answer: "Itália",
    onde: "em Itália", frase: "Era o Coliseu de Roma, em Itália.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="86" x2="94" y2="86" stroke="var(--ink)" stroke-width="2"/>
      <path d="M16,86 L16,34 Q50,20 84,34 L84,86 Z" fill="#e3d5b6" stroke="var(--ink)" stroke-width="2.4"/>
      <path d="M74,30 L84,34 L84,86 L74,86 Z" fill="#cbb992" stroke="var(--ink)" stroke-width="1.6"/>
      <g fill="#a99570" stroke="var(--ink)" stroke-width="1.2">
        <path d="M22,52 L22,44 Q26,40 30,44 L30,52 Z"/><path d="M36,48 L36,40 Q40,36 44,40 L44,48 Z"/>
        <path d="M50,46 L50,38 Q54,34 58,38 L58,46 Z"/><path d="M64,48 L64,40 Q68,36 72,40 L72,48 Z"/>
        <path d="M22,74 L22,64 Q26,60 30,64 L30,74 Z"/><path d="M36,72 L36,62 Q40,58 44,62 L44,72 Z"/>
        <path d="M50,70 L50,60 Q54,56 58,60 L58,70 Z"/><path d="M64,72 L64,62 Q68,58 72,62 L72,72 Z"/>
      </g>
      <path d="M16,56 Q50,48 84,56" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
    </svg>`,
  },
  {
    id: "partenon", name: "Partenon", answer: "Grécia",
    onde: "na Grécia", frase: "Era o Partenon, na Grécia.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,88 Q30,80 50,84 T100,88 L100,100 L0,100 Z" fill="#c9b98f" stroke="none"/>
      <rect x="14" y="80" width="72" height="6" fill="#efe7d2" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#f4eddb" stroke="var(--ink)" stroke-width="1.8">
        <rect x="20" y="46" width="8" height="34"/><rect x="33" y="46" width="8" height="34"/>
        <rect x="46" y="46" width="8" height="34"/><rect x="59" y="46" width="8" height="34"/>
        <rect x="72" y="46" width="8" height="34"/>
      </g>
      <rect x="14" y="40" width="72" height="7" fill="#efe7d2" stroke="var(--ink)" stroke-width="2"/>
      <polygon points="50,18 88,40 12,40" fill="#f4eddb" stroke="var(--ink)" stroke-width="2.4"/>
      <path d="M34,38 L50,26 L66,38" fill="none" stroke="var(--ink)" stroke-width="1.4"/>
    </svg>`,
  },
  {
    id: "machupicchu", name: "Machu Picchu", answer: "Peru",
    onde: "no Peru", frase: "Era Machu Picchu, no Peru.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,92 L0,60 L20,30 L34,54 L48,20 L70,58 L84,40 L100,66 L100,92 Z" fill="#7fa06a" stroke="var(--ink)" stroke-width="2"/>
      <polygon points="48,20 62,46 34,46" fill="#93ad7d" stroke="var(--ink)" stroke-width="1.6"/>
      <g fill="#cdbf9a" stroke="var(--ink)" stroke-width="1.4">
        <rect x="22" y="72" width="56" height="6"/><rect x="28" y="64" width="44" height="6"/>
        <rect x="34" y="56" width="32" height="6"/>
      </g>
      <g fill="#e0d4b4" stroke="var(--ink)" stroke-width="1.4">
        <path d="M38,56 L38,48 L46,42 L54,48 L54,56 Z"/>
        <path d="M58,64 L58,58 L64,54 L70,58 L70,64 Z"/>
      </g>
      <line x1="0" y1="92" x2="100" y2="92" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "fuji", name: "Monte Fuji", answer: "Japão",
    onde: "no Japão", frase: "Era o monte Fuji, no Japão.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="76" cy="24" r="11" fill="#e8776b" stroke="var(--ink)" stroke-width="1.8"/>
      <path d="M4,84 L50,20 L96,84 Z" fill="#8fa8c4" stroke="var(--ink)" stroke-width="2.4"/>
      <path d="M34,40 L50,20 L66,40 Q60,34 55,40 Q50,33 45,40 Q40,34 34,40 Z" fill="#f6f4ef" stroke="var(--ink)" stroke-width="1.8"/>
      <line x1="0" y1="84" x2="100" y2="84" stroke="var(--ink)" stroke-width="2"/>
      <path d="M8,90 Q20,86 32,90 M40,94 Q52,90 64,94 M68,88 Q80,84 92,88" fill="none" stroke="#7f9ab8" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "chichen", name: "Chichén Itzá", answer: "México",
    onde: "no México", frase: "Era Chichén Itzá, no México.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="88" x2="96" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <g fill="#d8c9a4" stroke="var(--ink)" stroke-width="1.8">
        <rect x="14" y="78" width="72" height="10"/><rect x="20" y="68" width="60" height="10"/>
        <rect x="26" y="58" width="48" height="10"/><rect x="32" y="48" width="36" height="10"/>
        <rect x="38" y="38" width="24" height="10"/>
      </g>
      <rect x="41" y="26" width="18" height="13" fill="#c3b184" stroke="var(--ink)" stroke-width="1.8"/>
      <rect x="46" y="30" width="8" height="9" fill="var(--ink)" opacity="0.7"/>
      <path d="M44,88 L44,26 M56,88 L56,26" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
      <path d="M44,88 L56,88 L56,26 L44,26 Z" fill="#e6d9b8" stroke="none" opacity="0.45"/>
    </svg>`,
  },
  {
    id: "moai", name: "Moais da Ilha da Páscoa", answer: "Chile",
    onde: "no Chile", frase: "Eram os moais da Ilha da Páscoa, no Chile.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,84 Q50,78 100,84 L100,100 L0,100 Z" fill="#8ba36f" stroke="none"/>
      <line x1="0" y1="84" x2="100" y2="84" stroke="var(--ink)" stroke-width="2"/>
      <path d="M62,84 L62,50 Q62,42 70,42 Q78,42 78,50 L78,84 Z" fill="#9c968c" stroke="var(--ink)" stroke-width="2"/>
      <path d="M22,84 L22,34 Q22,18 40,18 Q58,18 58,34 L58,84 Z" fill="#b3ada2" stroke="var(--ink)" stroke-width="2.4"/>
      <path d="M26,40 Q31,36 36,40 M44,40 Q49,36 54,40" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <ellipse cx="31" cy="46" rx="4" ry="3" fill="var(--ink)" opacity="0.75"/>
      <ellipse cx="49" cy="46" rx="4" ry="3" fill="var(--ink)" opacity="0.75"/>
      <path d="M40,46 L40,60 Q36,62 40,64 Q44,62 40,60" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <path d="M32,70 Q40,74 48,70" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "saobasilio", name: "Catedral de São Basílio", answer: "Rússia",
    onde: "na Rússia", frase: "Era a catedral de São Basílio, na Rússia.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="88" x2="94" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <rect x="18" y="62" width="64" height="26" fill="#e6dcc6" stroke="var(--ink)" stroke-width="2.2"/>
      <rect x="38" y="40" width="24" height="24" fill="#efe6d2" stroke="var(--ink)" stroke-width="2.2"/>
      <rect x="20" y="52" width="18" height="12" fill="#efe6d2" stroke="var(--ink)" stroke-width="1.8"/>
      <rect x="62" y="52" width="18" height="12" fill="#efe6d2" stroke="var(--ink)" stroke-width="1.8"/>
      <path d="M38,42 Q30,30 50,14 Q70,30 62,42 Z" fill="#c0574f" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M20,54 Q15,45 29,34 Q43,45 38,54 Z" fill="#4f7fb0" stroke="var(--ink)" stroke-width="1.8"/>
      <path d="M62,54 Q57,45 71,34 Q85,45 80,54 Z" fill="#5f9a63" stroke="var(--ink)" stroke-width="1.8"/>
      <path d="M50,14 L50,8 M29,34 L29,29 M71,34 L71,29" stroke="var(--ink)" stroke-width="1.8"/>
      <rect x="45" y="74" width="10" height="14" fill="var(--ink)" opacity="0.7"/>
    </svg>`,
  },
  {
    id: "eiffel", name: "Torre Eiffel", answer: "França",
    onde: "em França", frase: "Era a Torre Eiffel, em França.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="10" y1="88" x2="90" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <path d="M50,10 L30,88 M50,10 L70,88 M38,55 L62,55 M32,72 L68,72 M42,35 L58,35" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M44,10 L50,4 L56,10 Z" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/>
    </svg>`,
  },
  {
    id: "piramides", name: "Pirâmides de Gizé", answer: "Egito",
    onde: "no Egito", frase: "Eram as Pirâmides de Gizé, no Egito.",
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
    onde: "no Brasil", frase: "Era o Cristo Redentor, no Brasil.",
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
    onde: "na China", frase: "Era a Grande Muralha da China.",
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
    onde: "nos Estados Unidos", frase: "Era a Estátua da Liberdade, nos Estados Unidos.",
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
    onde: "no Reino Unido", frase: "Era o Big Ben, no Reino Unido.",
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
    onde: "na Austrália", frase: "Era a Ópera de Sydney, na Austrália.",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="88" x2="94" y2="88" stroke="var(--ink)" stroke-width="2"/>
      <path d="M14,88 C 14,60 30,40 34,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M34,88 C 34,52 54,28 58,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
      <path d="M58,88 C 58,62 72,44 76,88 Z" fill="#f6efdd" stroke="var(--ink)" stroke-width="2.2"/>
    </svg>`,
  },
  {
    id: "tajmahal", name: "Taj Mahal", answer: "Índia",
    onde: "na Índia", frase: "Era o Taj Mahal, na Índia.",
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

// Escolhe um marco ainda não usado, para a versão DESENHADA do "Onde Fica
// Isto?" (ver pickLandmarkRound logo abaixo, que é a versão de escolha
// múltipla). Aceita um Set ou um array: o solo guarda os usados num Set, a
// sala guarda-os em lista, porque tem de os escrever na base de dados.
export function pickLandmark(usados) {
  const jaSaiu = new Set(usados || []);
  const livres = LANDMARKS.filter((l) => !jaSaiu.has(l.id));
  const pool = livres.length > 0 ? livres : LANDMARKS;
  return pool[Math.floor(Math.random() * pool.length)];
}

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

// --- Conquistas ---
//
// Só usam números que a conta local já guarda (XP, jogos jogados, favoritos,
// histórico de pontuações), para não ser preciso instrumentar cada mini-jogo
// outra vez. Cada uma traz uma fala da Dona Manga ou do Brasa: é o momento
// em que a gata se lembra que existes.
export const ACHIEVEMENTS = [
  {
    id: "primeiroJogo", icon: "🐣", name: "Primeira vez",
    desc: "Termina o teu primeiro mini-jogo.",
    who: "Brasa", quip: "Vieste! A Dona Manga disse que não vinhas.",
    check: (c) => c.gamesPlayed >= 1,
  },
  {
    id: "dezJogos", icon: "🎮", name: "Já cá anda",
    desc: "Termina 10 mini-jogos.",
    who: "Dona Manga", quip: "Dez? Está bem. Continua, que eu vou dormindo.",
    check: (c) => c.gamesPlayed >= 10,
  },
  {
    id: "cinquentaJogos", icon: "🏟️", name: "Habitué",
    desc: "Termina 50 mini-jogos.",
    who: "Dona Manga", quip: "Cinquenta. Já não vale a pena fingir que não te conheço.",
    check: (c) => c.gamesPlayed >= 50,
  },
  {
    id: "xp500", icon: "⭐", name: "Meio milhar",
    desc: "Junta 500 XP na conta deste browser.",
    who: "Brasa", quip: "Guardei os teus pontos debaixo do sofá. Ninguém os rouba lá.",
    check: (c) => c.xp >= 500,
  },
  {
    id: "xp2000", icon: "🌟", name: "Cofre cheio",
    desc: "Junta 2000 XP na conta deste browser.",
    who: "Dona Manga", quip: "Dois mil. Vou ter de roubar mais depressa.",
    check: (c) => c.xp >= 2000,
  },
  {
    id: "curioso", icon: "🧭", name: "Curioso",
    desc: "Joga 5 mini-jogos diferentes (ou todos, se houver menos).",
    who: "Brasa", quip: "Já experimentaste cinco! Eu ainda só sei dormir.",
    // O mínimo existe porque o número de jogos no menu MUDA: com oito na
    // oficina sobram quatro, e pedir cinco a quem tem quatro é uma conquista
    // que nunca ninguém ganha.
    check: (c) => c.distinctGames >= Math.min(5, c.totalGames),
  },
  {
    id: "colecionador", icon: "🗺️", name: "Provaste tudo",
    desc: "Joga todos os mini-jogos pelo menos uma vez.",
    who: "Dona Manga", quip: "Jogaste tudo. Agora joga outra vez, mas melhor.",
    check: (c) => c.distinctGames >= c.totalGames,
  },
  {
    id: "viciado", icon: "🔁", name: "Aquele jogo",
    desc: "Joga o mesmo mini-jogo 15 vezes.",
    who: "Dona Manga", quip: "Sempre o mesmo. Percebo-te: eu durmo sempre no mesmo sítio.",
    check: (c) => Math.max(0, ...Object.values(c.favorites || {})) >= 15,
  },
  {
    id: "run100", icon: "💯", name: "Cem à campainha",
    desc: "Termina uma run com 100 pontos ou mais.",
    who: "Brasa", quip: "Cem! Escondi a folha para a Dona Manga não ver.",
    check: (c) => c.bestScore >= 100,
  },
  {
    id: "run250", icon: "🔥", name: "Isto já é exibição",
    desc: "Termina uma run com 250 pontos ou mais.",
    who: "Dona Manga", quip: "Duzentos e cinquenta. Devolve metade, é meu.",
    check: (c) => c.bestScore >= 250,
  },
  {
    id: "dezRuns", icon: "📚", name: "Tabela cheia",
    desc: "Guarda 10 runs na tabela de recordes.",
    who: "Brasa", quip: "Dez folhas! Fiz uma pilha e dormi em cima.",
    check: (c) => c.runs >= 10,
  },
  {
    id: "combo8", icon: "⚡", name: "Em brasa",
    desc: "Chega a um combo de 8 seguidas.",
    who: "Brasa", quip: "Oito seguidas! Foi por isso que me puseram este nome.",
    check: (c) => c.bestCombo >= 8,
  },
  {
    id: "forca5", icon: "🪢", name: "Sequência na Forca",
    desc: "Acerta 5 palavras seguidas na Forca.",
    who: "Dona Manga", quip: "Cinco palavras seguidas? Alguém te anda a soprar.",
    check: (c) => c.bestHangmanStreak >= 5,
  },
];

// --- Falas de abertura das mascotes, uma lista por mini-jogo ---
//
// O ecrã "pronto?" já aparece antes de qualquer mini-jogo; era o sítio óbvio
// para a Dona Manga e o Brasa aparecerem, e é o que amarra os mini-jogos ao
// mesmo mundo em vez de serem doze coisas soltas. As falas são específicas
// de cada jogo de propósito: uma frase genérica lida-se uma vez e ignora-se
// para sempre.
export const MASCOT_INTROS = {
  // O QUADRO E O MAPA são os dois jogos que ficaram em pé, e eram os dois
  // únicos sem falas: havia-as para os doze mini-jogos que entretanto saíram
  // do site e nenhuma para estes. (As do mapa vivem no i18n.js, porque o mapa
  // fala três línguas.)
  board: [
    { who: "Dona Manga", text: "Folha em branco. Eu costumo deitar-me em cima destas." },
    { who: "Dona Manga", text: "Desenha o que quiseres. Eu depois passo por cima." },
    { who: "Brasa", text: "Uma vez desenhei a Dona Manga. Ela não gostou. Cuidado." },
    { who: "Brasa", text: "Se te enganares, diz que era de propósito. Funciona quase sempre." },
  ],
  reflex: [
    { who: "Dona Manga", text: "Olho de lince? Eu vejo tudo com os olhos fechados. Tenta acompanhar." },
    { who: "Brasa", text: "Se não encontrares, pisca duas vezes. Às vezes ajuda. A mim nunca ajudou." },
  ],
  word: [
    { who: "Dona Manga", text: "Palavras. Que desperdício de tempo que se podia passar a dormir." },
    { who: "Brasa", text: "Eu sei escrever 'miau'. É um começo!" },
  ],
  bug: [
    { who: "Brasa", text: "Insetos! Deixa alguns, são os meus amigos. Deixa dois. Está bem, um." },
    { who: "Dona Manga", text: "Caçar é a única coisa em que te vou dar conselhos. Sê rápido e sem piedade." },
  ],
  monkey: [
    { who: "Dona Manga", text: "Cada macaco no seu galho. Eu fico com o galho de todos." },
    { who: "Brasa", text: "Já tentei trepar a uma árvore. Fiquei lá em cima três horas." },
  ],
  memory: [
    { who: "Dona Manga", text: "Memória. Eu lembro-me de tudo o que fizeste de mal. Vamos ver se te lembras de cartas." },
    { who: "Brasa", text: "Eu decorei os pares todos! ...esqueci-me outra vez." },
  ],
  hangman: [
    { who: "Dona Manga", text: "Uma palavra escondida. Se ganhares, roubo-a para a próxima ronda." },
    { who: "Brasa", text: "A letra 'A' costuma estar lá. Não disse nada, não disse nada." },
  ],
  map: [
    { who: "Dona Manga", text: "Geografia. Eu já estive em todo o lado: na cama, no sofá, e naquela caixa." },
    { who: "Brasa", text: "Um dia vou ver o mundo! Assim que ela adormecer a sério." },
  ],
  pacman: [
    { who: "Dona Manga", text: "Foges de quatro bandeiras. Eu fujo de responsabilidades. Somos iguais." },
    { who: "Brasa", text: "Corre! E se te apanharem, diz que foi ideia minha, ela acredita." },
  ],
  golf: [
    { who: "Dona Manga", text: "Uma bola pequena e um buraco. Empurra-a lá para dentro, é o que eu faço com tudo." },
    { who: "Brasa", text: "Meti a bola ao segundo toque uma vez! Estava a jogar sozinho. Ninguém viu." },
  ],
  cards: [
    { who: "Dona Manga", text: "Cartas. Avisa-me quando tiveres uma boa mão, para eu ta tirar." },
    { who: "Brasa", text: "Descarta as más! É o que eu faço às ideias de rebelião." },
  ],
  car: [
    { who: "Dona Manga", text: "Estrada maluca. Se bateres, não me chames." },
    { who: "Brasa", text: "Eu ia contigo, mas enjoo. E tenho medo. E é longe." },
  ],
  landmark: [
    { who: "Dona Manga", text: "Monumentos. Sítios onde muita gente vai só para ficar de pé a olhar. Como eu à janela." },
    { who: "Brasa", text: "Este eu sei! ...não sei. Boa sorte." },
  ],
};

export function pickMascotIntro(gameKey) {
  const list = MASCOT_INTROS[gameKey];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// A OFICINA: os jogos que existem mas ainda não estão para se mostrar.
//
// A lista vive AQUI, no data.js, e não no oficina.js, por uma razão de
// arrumação que já custou uma vez: o oficina.js mexe no localStorage e no
// documento, e o room.js não pode importar nada disso sem partir os testes
// puros. Mas o room.js precisa da lista — senão esconde os botões e continua
// a meter os jogos escondidos na fila de bónus, e a pessoa acaba a jogar um
// jogo que mandou tirar do site.
// O interrutor da oficina. A chave vive aqui, com a lista, para o oficina.js
// e o room.js não guardarem cada um a sua cópia da mesma string — divergirem
// significava esconder os jogos num sítio e continuar a jogá-los no outro.
export const CHAVE_OFICINA = "euSei_oficina";

// Está a oficina aberta? Seguro em Node (onde não há localStorage): os testes
// puros importam o room.js fora do browser, e uma exceção aqui partia-os
// todos.
export function oficinaAberta() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CHAVE_OFICINA) === "1";
  } catch {
    return false;
  }
}

export const JOGOS_NA_OFICINA = [
  "reflex",    // Olho de Lince
  "bug",       // Mata o Inseto
  "monkey",    // Cada Macaco no Seu Galho
  "map",       // Mapa-Múndi antigo (substituído pelo mapa a sério)
  "mapTrivia", // o mesmo, na sala
  "pacman",    // Kota Corre!
  "cards",     // Descartando Juntos
  "car",       // Estrada Maluca (solo)
  "race",      // Estrada Maluca (sala)
  "landmark",  // Onde Fica Isto? — só a versão SOLO, de escolha múltipla; a
               // versão em sala foi refeita como desenho ("marcos") e está no site
];

// --- Eventos de "caos" da Dona Manga ---
//
// Disparam UMA vez a meio de um mini-jogo, para nenhuma partida ser igual à
// anterior. Regra de desenho que os limita de propósito: nenhum evento pode
// tornar um jogo imperdível OU imganhável — só mexem no que se vê e num
// bónus no fim. Um evento que te matasse seria a app a jogar contra ti, e
// isso não é variedade, é injustiça.
export const CHAOS_EVENTS = [
  {
    id: "pata", kind: "paw", ms: 4000,
    who: "Dona Manga", text: "Pôs a pata no ecrã. Não vai tirar já.",
  },
  {
    id: "sono", kind: "wobble", ms: 4000,
    who: "Dona Manga", text: "Espreguiçou-se em cima da mesa. Está tudo a abanar.",
  },
  {
    id: "brasa", kind: "bonus", ms: 2600, bonus: 5,
    who: "Brasa", text: "Distraí-a com um novelo! Toma uns pontos por baixo da mesa.",
  },
  // Mais falas para os MESMOS três estorvos (pata, abanão, ajuda do Brasa).
  // Nenhum feitio novo: o que muda é só o que eles dizem. Com três frases, uma
  // maratona de mini-jogos repetia-as em minutos, que é a queixa que se lê nas
  // críticas dos jogos deste género — a piada gasta-se à terceira vez.
  {
    id: "pataVista", kind: "paw", ms: 4000,
    who: "Dona Manga", text: "Sentou-se em cima do ecrã. Diz que a vista é melhor daqui.",
  },
  {
    id: "pataProva", kind: "paw", ms: 4000,
    who: "Dona Manga", text: "Pata no vidro. Está a ver se isto se come.",
  },
  {
    id: "salto", kind: "wobble", ms: 4000,
    who: "Dona Manga", text: "Saltou para a mesa sem avisar. Está tudo a tremer.",
  },
  {
    id: "banho", kind: "wobble", ms: 4000,
    who: "Dona Manga", text: "Decidiu lavar-se aqui mesmo. A mesa que aguente.",
  },
  {
    id: "brasaTampa", kind: "bonus", ms: 2600, bonus: 5,
    who: "Brasa", text: "Levei-lhe uma tampa de garrafa para o corredor. Aproveita.",
  },
  {
    id: "brasaSono", kind: "bonus", ms: 2600, bonus: 5,
    who: "Brasa", text: "Está a dormir em cima do comando. Empurro-te uns pontos.",
  },
];

// Nunca duas vezes a mesma de seguida: com poucas falas, ver a mesma coisa
// duas vezes seguidas é o que faz parecer que são só três.
export function pickChaosEvent(anterior = null) {
  const possiveis = CHAOS_EVENTS.filter((e) => e.id !== anterior);
  const pool = possiveis.length > 0 ? possiveis : CHAOS_EVENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Como se joga cada mini-jogo, numa frase. Existe para o MODO GUIADO poder
// dizer em voz alta o que se faz, a quem está a jogar sozinho e não tem
// ninguém ao lado para explicar. Escrito para ser OUVIDO e não lido: frases
// curtas, sem parênteses nem símbolos, porque um sintetizador de voz lê tudo.
export const GAME_HOWTO = {
  reflex: "Procura no cenário o objeto que te pedirem e toca nele antes do tempo acabar.",
  word: "Escreve uma palavra que comece pela letra que aparecer, o mais depressa que conseguires.",
  bug: "Toca nos insetos que aparecem. Quanto mais seguidos acertares, mais valem.",
  monkey: "Apanha os macacos que caem, movendo-te para a esquerda e para a direita.",
  memory: "Vira as cartas duas a duas e encontra os pares iguais.",
  hangman: "Adivinha a palavra escondida, uma letra de cada vez.",
  map: "Escreve o nome de um país que cumpra o que for pedido, e vê-o acender no mapa.",
  pacman: "Come tudo pelo labirinto e foge da Dona Manga. Usa as setas do teclado.",
  golf: "Manda a bola ao buraco com o menor número de tacadas.",
  cards: "Escolhe cartas para fazer pontos. Podes descartar as que não servem.",
  car: "Guia o carro pelas faixas e desvia-te do que vier pela estrada.",
  landmark: "Vê a fotografia e diz onde fica aquele sítio.",
  // O quadro e o mapa não são mini-jogos e não passam pelo ecrã do "pronto?",
  // por isso durante muito tempo não tiveram frase nenhuma aqui — a narração
  // nasceu para os doze mini-jogos, e os mini-jogos foram quase todos para a
  // oficina. Ficaram os dois melhores jogos da casa sem quem lhes dissesse o
  // que fazer, que é justamente para quem o modo guiado existe.
  board: "Tens uma folha em branco. Escolhe uma cor e desenha com o dedo ou com o rato.",
};

export function gameHowTo(key) {
  return GAME_HOWTO[key] || "";
}

// --- Falas do quadro: a Dona Manga a gozar com os erros ---
//
// ESCRITAS, em balões — não faladas. A voz falada fica para muito mais tarde
// (decisão do utilizador): um balão lê-se numa sala com barulho, não depende
// de o browser ter vozes portuguesas instaladas, e não obriga ninguém a ter o
// som ligado para perceber o jogo.
//
// Servem o modo em que os erros NÃO acabam o jogo (a definição "Sem limite"):
// aí a punição por errar deixa de ser mecânica e passa a ser social, que é o
// que uma sala de amigos quer. A gata olha de lado; não é um sistema a acusar.
//
// O Brasa entra de vez em quando a contrapor, porque é o que ele faz — ajuda
// às escondidas e as rebeliões correm-lhe mal.
export const BOARD_QUIPS = [
  { who: "Dona Manga", text: "Miau. Essa letra não existe nem no dicionário dela." },
  { who: "Dona Manga", text: "Continua. Estou a fazer uma lista." },
  { who: "Dona Manga", text: "Interessante. Errado, mas interessante." },
  { who: "Dona Manga", text: "Já vi gatos a dormir acertarem mais depressa." },
  { who: "Dona Manga", text: "Não faz mal. Faz, mas eu digo que não." },
  { who: "Dona Manga", text: "Esse erro foi tão bom que quase o guardei." },
  { who: "Dona Manga", text: "Estou a ver. Estou sempre a ver." },
  { who: "Dona Manga", text: "Tenta outra vez. Eu espero — é o que faço melhor." },
  { who: "Dona Manga", text: "Ronron. Isso foi de propósito, não foi?" },
  { who: "Dona Manga", text: "A palavra está mesmo aí. Aí não, mas está." },
  { who: "Brasa", text: "Eu sei qual é! ...não posso dizer. Ela está a olhar." },
  { who: "Brasa", text: "Psst. Estás perto. (Não estás, mas anima-te.)" },
  { who: "Brasa", text: "Ela também erra, só que apaga antes de alguém ver." },
  { who: "Brasa", text: "Tentei ajudar-te e caí da mesa. Outra vez." },
];

export function pickBoardQuip(evitarIndice) {
  if (BOARD_QUIPS.length <= 1) return 0;
  let i = Math.floor(Math.random() * BOARD_QUIPS.length);
  // Nunca a mesma fala duas vezes seguidas: repetida, deixa de se ler como
  // alguém a comentar e passa a ler-se como uma avaria.
  if (i === evitarIndice) i = (i + 1) % BOARD_QUIPS.length;
  return i;
}

// --- O caos da Dona Manga NO QUADRO ---
//
// Os eventos do solo não servem aqui: uma pata no ecrã ou um abanão são
// visuais e não mexem no jogo. No quadro, o caos tem de fazer alguma coisa ao
// que está a acontecer — senão é decoração e cansa à segunda vez.
//
// A regra que nenhum deles quebra: NUNCA revelam a palavra toda e NUNCA
// tornam o jogo impossível. Uma gata que estraga a ronda deixa de ter piada à
// primeira vez que acontece a sério.
export const BOARD_CHAOS = [
  {
    id: "letraGratis", kind: "revealLetter",
    who: "Dona Manga", text: "Está bem, está bem. Toma uma letra e não digas a ninguém.",
  },
  {
    id: "roubaVez", kind: "skipTurn",
    who: "Dona Manga", text: "Sentei-me em cima do teclado de alguém. Passa a vez.",
  },
  {
    id: "limpaCanto", kind: "eraseBit",
    who: "Dona Manga", text: "Passei a cauda pelo quadro. Não foi de propósito. Foi.",
  },
  {
    id: "brasaAjuda", kind: "revealLetter",
    who: "Brasa", text: "Ela está a dormir! Rápido, olha uma letra — não contes.",
  },
  {
    id: "apagaErro", kind: "forgiveMiss",
    who: "Brasa", text: "Apaguei um erro da lista dela antes que reparasse.",
  },
];

export function pickBoardChaos(evitarId) {
  const opcoes = BOARD_CHAOS.filter((e) => e.id !== evitarId);
  const lista = opcoes.length > 0 ? opcoes : BOARD_CHAOS;
  return lista[Math.floor(Math.random() * lista.length)];
}

// --- Ferramentas do quadro (solo e de sala) ---
// widthScale multiplica a espessura escolhida; alpha multiplica a
// transparência escolhida; composite é o que dá a cada uma o seu carácter.
// O fluorescente usa "multiply" para que, ao passar por cima do que já está
// escrito, a tinta escureça em vez de tapar — é o que um marcador
// fluorescente de verdade faz ao papel.
export const BOARD_TOOLS = {
  pen:         { label: "Caneta",       icon: "🖊️", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round" },
  marker:      { label: "Marcador",     icon: "🖍️", widthScale: 2.6, alpha: 0.95, composite: "source-over", cap: "round" },
  pencil:      { label: "Lápis",        icon: "✏️", widthScale: 0.5, alpha: 0.75, composite: "source-over", cap: "round" },
  highlighter: { label: "Fluorescente", icon: "🖌️", widthScale: 5,   alpha: 0.4,  composite: "multiply",    cap: "square" },
  eraser:      { label: "Borracha",     icon: "🧽", widthScale: 3.5, alpha: 1,    composite: "destination-out", cap: "round" },
  line:        { label: "Linha",        icon: "📏", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true },
  arrow:       { label: "Seta",         icon: "➡️", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true },
  rect:        { label: "Retângulo",    icon: "▭",  widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true, fillable: true },
  ellipse:     { label: "Círculo",      icon: "⭕", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true, fillable: true },
  text:        { label: "Texto",        icon: "🔤", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", text: true },
  hand:        { label: "Mover",        icon: "✋", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", pan: true },
};


// Só os nomes, para quem precisa de validar sem carregar o resto.
export const BOARD_TOOL_KEYS = Object.keys(BOARD_TOOLS).filter((k) => !BOARD_TOOLS[k].pan);

// Duas palavras são a mesma palavra? Sem acentos, sem maiúsculas, sem espaços
// a mais. Vive aqui, e não no módulo da rede, porque quem precisa disto são os
// JOGOS — e um jogo que só precisa de comparar dois nomes não devia ter de
// arrastar a Firebase atrás de si.
export function sameWord(a, b) {
  const limpa = (t) => String(t || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt").trim().replace(/\s+/g, " ");
  return !!limpa(a) && limpa(a) === limpa(b);
}
