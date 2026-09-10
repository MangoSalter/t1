// O mapa-múndi partilhado: as regras da sala, sem browser e sem rede.
//
// A pergunta que este ficheiro responde é a que dá o jogo: quando dois
// jogadores querem o mesmo país, quem fica com ele — e quanto vale ficar com
// um país que outro acabou de falhar.
import {
  chaveDePais, mapaEstadoInicial, mapaDono, mapaEmCausa, mapaPodeConquistar,
  mapaPontosNaSala, mapaClassificacao, mapaEscolhaDaManga, computeMapaPayout,
  MAPA_ROUBO_MS, MAPA_ROUBO_FATOR, MAPA_PODIO, MAPA_PODIO_MIN,
  CORES_DO_MAPA,
} from "./js/room.js";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${JSON.stringify(esperado)}, tenho ${JSON.stringify(real)}`}`);
  if (!ok) falhas += 1;
};

const agora = 1_700_000_000_000;
const sala = (mapa, players = {}) => ({ mapa: { ...mapaEstadoInicial(), ...mapa }, players });

console.log("1) As chaves: um nome de país tem de poder ser guardado...");
check("um nome normal fica igual", chaveDePais("Brasil"), "Brasil");
check("os acentos e os hífenes ficam", chaveDePais("Guiné-Bissau"), "Guiné-Bissau");
check("os pontos não podem ir para uma chave", chaveDePais("R.D. Congo"), "R_D_ Congo");
check("nem as barras", chaveDePais("a/b"), "a_b");

console.log("2) Um país só tem um dono, e o dono não se troca...");
const comDono = sala({ donos: { Brasil: "ana" } });
check("o dono é quem lá está", mapaDono(comDono, "Brasil"), "ana");
check("um país com dono não se conquista", mapaPodeConquistar(comDono, "Brasil"), false);
check("nem pelo próprio dono", mapaPodeConquistar(comDono, "Brasil"), false);
check("um país livre conquista-se", mapaPodeConquistar(comDono, "Chile"), true);

console.log("3) Errar põe o país em causa por uns segundos...");
const emCausa = sala({ abertos: { Chile: { ate: agora + MAPA_ROUBO_MS, porCausaDe: "ana" } } });
check("dentro da janela está em causa", mapaEmCausa(emCausa, "Chile", agora + 1000), true);
check("passada a janela já não está", mapaEmCausa(emCausa, "Chile", agora + MAPA_ROUBO_MS + 1), false);
// E se alguém o conquistou entretanto, a janela deixa de valer: o país é dele.
const jaConquistado = sala({
  donos: { Chile: "beto" },
  abertos: { Chile: { ate: agora + MAPA_ROUBO_MS, porCausaDe: "ana" } },
});
check("um país já conquistado não está em causa", mapaEmCausa(jaConquistado, "Chile", agora + 1000), false);

console.log("4) Roubar o país que outro falhou vale o dobro — a quem não falhou...");
check("quem estava a ver leva o dobro",
  mapaPontosNaSala(emCausa, "Chile", "beto", 10, agora + 1000),
  { pontos: 10 * MAPA_ROUBO_FATOR, roubo: true });
check("quem falhou não leva o dobro do próprio erro",
  mapaPontosNaSala(emCausa, "Chile", "ana", 10, agora + 1000),
  { pontos: 10, roubo: false });
check("fora da janela é o preço normal",
  mapaPontosNaSala(emCausa, "Chile", "beto", 10, agora + MAPA_ROUBO_MS + 1),
  { pontos: 10, roubo: false });
check("um país que ninguém falhou é o preço normal",
  mapaPontosNaSala(emCausa, "Peru", "beto", 10, agora),
  { pontos: 10, roubo: false });

console.log("5) A classificação: quem sabe mais países ganha a quem fez mais pontos...");
// De propósito. Fazer 200 pontos com três roubos não pode valer mais do que
// saber vinte países — o jogo é sobre saber o mapa.
const disputa = sala(
  {
    donos: { Brasil: "ana", Chile: "ana", Peru: "ana", Japão: "beto" },
    marcadores: { ana: { pontos: 40, erros: 1, melhorCadeia: 3 }, beto: { pontos: 300, erros: 0, melhorCadeia: 1 } },
  },
  { ana: { name: "Ana" }, beto: { name: "Beto" } },
);
const tabela = mapaClassificacao(disputa);
console.log(`   ${tabela.map((l) => `${l.nome}: ${l.paises} países, ${l.pontos} pts`).join(" | ")}`);
check("à frente vai quem tem mais países", tabela[0].nome, "Ana");
check("com a contagem certa", tabela[0].paises, 3);
check("e os pontos vêm do marcador", tabela[1].pontos, 300);
check("os nomes vêm da sala", tabela[1].nome, "Beto");

console.log("6) A Dona Manga só rouba a quem já tem alguma coisa...");
check("num mapa quase vazio não rouba nada",
  mapaEscolhaDaManga(sala({ donos: { Brasil: "ana" } }), () => 0), null);
check("com países que cheguem, rouba um deles",
  mapaEscolhaDaManga(disputa, () => 0), "Brasil");
check("e o sorteio chega ao último da lista",
  mapaEscolhaDaManga(disputa, () => 0.99), "Japão");

console.log("7) O placar da sala leva um pódio, não os pontos todos do mapa...");
// Conquistar o mapa inteiro dava centenas de pontos ao placar quando os outros
// bónus dão vinte e poucos — um jogo decidia a partida sozinho. O marcador
// rico fica cá dentro; para fora vai um pódio da grandeza dos outros.
const pagamento = computeMapaPayout(disputa);
console.log(`   pagamento: ${JSON.stringify(pagamento)}`);
check("quem tem mais países leva o primeiro lugar", pagamento.ana, MAPA_PODIO[0]);
check("o segundo leva o segundo lugar", pagamento.beto, MAPA_PODIO[1]);
check("300 pontos no marcador não viram 300 no placar", pagamento.beto < 50, true);

// Quem esteve na sala e não conquistou nada não leva o mínimo: o mínimo é de
// quem jogou.
const comEspetador = sala(
  { donos: { Brasil: "ana" }, marcadores: { ana: { pontos: 10 }, zeca: { pontos: 0, erros: 4 } } },
  { ana: { name: "Ana" }, zeca: { name: "Zeca" } },
);
const pag2 = computeMapaPayout(comEspetador);
console.log(`   com um jogador a zero: ${JSON.stringify(pag2)}`);
check("quem conquistou leva", pag2.ana, MAPA_PODIO[0]);
check("quem não conquistou nada não leva nada", String(pag2.zeca), "undefined");

// Numa sala grande, do quinto para baixo é o mínimo — e é sempre menos do que
// o quarto lugar, senão valia a pena chegar em último.
const muitos = sala(
  {
    donos: { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" },
    marcadores: {},
  },
  Object.fromEntries("abcdef".split("").map((u) => [u, { name: u }])),
);
const pag3 = computeMapaPayout(muitos);
check("seis jogadores, seis pagamentos", Object.keys(pag3).length, 6);
check("do quinto para baixo é o mínimo", pag3[mapaClassificacao(muitos)[4].uid], MAPA_PODIO_MIN);
check("e o mínimo é menos do que o último lugar do pódio", MAPA_PODIO_MIN < MAPA_PODIO[3], true);

console.log("8) Uma sala acabada de começar não tem nada guardado...");
const nova = mapaEstadoInicial("europa", "apontado");
check("guarda o modo escolhido", nova.modo, "europa");
check("e a dificuldade", nova.dificuldade, "apontado");
check("sem donos", Object.keys(nova.donos).length, 0);
check("sem países em causa", Object.keys(nova.abertos).length, 0);
check("e a classificação de uma sala vazia é vazia", mapaClassificacao(sala({})), []);




// --- AS CORES TÊM DE SE DISTINGUIR, E NÃO SÓ PARA QUEM AS VÊ TODAS ---
//
// No mapa em sala a cor é a única coisa que diz de quem é cada país: a
// bandeira desenhada dentro dele é a bandeira DO PAÍS. Uma pessoa em cada
// doze não distingue o vermelho do verde, e a lista antiga punha o vermelho e
// o castanho a 4,0 de ΔE em deuteranopia — iguais — e dois verdes a 12,5 em
// visão NORMAL.
//
// Mede-se aqui em vez de se confiar no olho de quem escolheu: converte-se
// cada cor para Lab, simula-se a visão de quem não distingue vermelho/verde
// (Viénot-Brettel-Mollon, em espaço LMS) e exige-se distância em todos os
// pares. Assim ninguém pode "arranjar" a paleta a olho e piorá-la em
// silêncio.
console.log("24) As cores do mapa distinguem-se umas das outras, em três visões...");
{
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const delin = (c) => {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, v));
  };
  const doHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const paraLab = ([r, g, b]) => {
    const R = lin(r), G = lin(g), B = lin(b);
    let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    let y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const simula = ([r, g, b], tipo) => {
    if (tipo === "normal") return [r, g, b];
    const R = lin(r), G = lin(g), B = lin(b);
    const L = 17.8824 * R + 43.5161 * G + 4.11935 * B;
    const M = 3.45565 * R + 27.1554 * G + 3.86714 * B;
    const S = 0.0299566 * R + 0.184309 * G + 1.46709 * B;
    let L2 = L, M2 = M;
    if (tipo === "deuteranopia") M2 = 0.494207 * L + 1.24827 * S;
    if (tipo === "protanopia") L2 = 2.02344 * M - 2.52581 * S;
    return [
      delin(0.080944 * L2 - 0.130504 * M2 + 0.116721 * S),
      delin(-0.0102485 * L2 + 0.0540194 * M2 - 0.113615 * S),
      delin(-0.000365294 * L2 - 0.00412163 * M2 + 0.693513 * S),
    ];
  };
  const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const MINIMO = 20;

  check("dez cores, uma por jogador", CORES_DO_MAPA.length, 10);
  check("todas escritas em #rrggbb", CORES_DO_MAPA.every((c) => /^#[0-9a-f]{6}$/i.test(c)), true);
  check("nenhuma repetida", new Set(CORES_DO_MAPA.map((c) => c.toLowerCase())).size, 10);

  for (const visao of ["normal", "deuteranopia", "protanopia"]) {
    const labs = CORES_DO_MAPA.map((c) => paraLab(simula(doHex(c), visao)));
    let pior = Infinity;
    let quais = "";
    for (let i = 0; i < labs.length; i += 1) {
      for (let j = i + 1; j < labs.length; j += 1) {
        const d = distancia(labs[i], labs[j]);
        if (d < pior) { pior = d; quais = `${CORES_DO_MAPA[i]}~${CORES_DO_MAPA[j]}`; }
      }
    }
    console.log(`   ${visao}: pior par ${pior.toFixed(1)} (${quais})`);
    check(`${visao}: o par mais parecido está acima de ${MINIMO}`, pior >= MINIMO, true);
  }
}

// --- Empates na tabela do mapa ---
//
// Há três desempates (países, pontos, erros), por isso um empate a sério é
// raro — mas quando acontece a tabela dizia 1º e 2º a duas pessoas com
// exatamente o mesmo, e quem decidia era a ordem por que entraram.
{
  const sala = {
    players: { a: { name: "Ana" }, b: { name: "Beto" }, c: { name: "Carla" } },
    mapa: {
      donos: { Franca: "a", Espanha: "b", Peru: "c" },
      marcadores: {
        a: { pontos: 10, erros: 0, melhorCadeia: 1 },
        b: { pontos: 10, erros: 0, melhorCadeia: 1 },
        c: { pontos: 5, erros: 2, melhorCadeia: 1 },
      },
    },
  };
  const lugares = mapaClassificacao(sala).map((l) => l.lugar).join(",");
  if (lugares !== "1,1,3") {
    console.log(`FALHOU: dois empatados deviam partilhar o 1º e o seguinte ser 3º — deu ${lugares}`);
    falhas += 1;
  } else {
    console.log(`OK: empate na tabela do mapa partilha o lugar (${lugares})`);
  }
}

if (falhas > 0) { console.log(`=> mapa-sala FALHOU (${falhas})`); process.exit(1); }
console.log("=> mapa-sala ok");
