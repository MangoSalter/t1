// Onde o duplo de teste difere do sistema real, um teste que passa não prova
// nada. Já aconteceu quatro vezes nesta base de código: o stub transmitia a
// raiz inteira quando o Firebase transmite por caminho; não apagava as chaves
// escritas a null, que o Firebase apaga; tinha o onDisconnect a não fazer
// nada; e dava a cada separador uma identidade própria quando o Firebase dá a
// mesma conta a todos os separadores do mesmo browser. Cada uma dessas
// mentiras escondeu uma classe inteira de defeitos.
//
// A quarta foi corrigida da única maneira que fecha o assunto: os dois passaram
// a chamar o MESMO identity.js. Este ficheiro guarda essa decisão — se alguém
// voltar a dar ao stub um getUid próprio, falha aqui.
import { readFile } from "node:fs/promises";
import path from "node:path";

let falhas = 0;
const check = (nome, ok, detalhe) => {
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — ${detalhe}`}`);
  if (!ok) falhas += 1;
};

const publicDir = process.env.EU_SEI_PUBLIC;
const stubPath = process.env.EU_SEI_STUB;
if (!publicDir || !stubPath) {
  console.log("   FALHOU: sem EU_SEI_PUBLIC/EU_SEI_STUB — o test runner tem de os passar");
  process.exit(1);
}
const real = await readFile(path.join(publicDir, "js", "firebase-init.js"), "utf8");
const stub = await readFile(stubPath, "utf8");

console.log("1) A identidade vem do mesmo sítio nos dois...");
const usaOModulo = (src) => /import\s*\{[^}]*identidadeDestaAba[^}]*\}\s*from\s*"\.\/identity\.js"/.test(src)
  && /identidadeDestaAba\(/.test(src);
check("o jogo usa o identity.js", usaOModulo(real),
  "se o getUid verdadeiro voltar a decidir sozinho, os testes deixam de o poder ver");
check("o stub usa o mesmo", usaOModulo(stub),
  "um getUid próprio no stub é como o defeito original passou despercebido");
// E nenhum dos dois pode voltar a devolver o uid da conta a seco: é o mesmo em
// todos os separadores do mesmo browser.
const corpoDoGetUid = (src) => {
  const i = src.search(/export\s+(?:async\s+)?function\s+getUid\s*\(/);
  return i === -1 ? "" : src.slice(i, i + 600);
};
check("o jogo não devolve o uid da conta a seco",
  !/return\s+contaUid\s*;/.test(corpoDoGetUid(real)),
  "o uid da conta é partilhado por todos os separadores");
check("continua a autenticar-se antes", /signInAnonymously/.test(real) && /await\s+autenticar\(\)/.test(corpoDoGetUid(real)),
  "as regras da base de dados pedem auth != null; dar a identidade antes disso escreve sem acesso");

console.log("2) A decisão de quem eu sou, caso a caso...");
// A parte que os testes puros conseguem ver. O resto precisa de um browser
// (sessionStorage, BroadcastChannel), e é por isso que está separada.
const { escolherIdentidade } = await import("./js/identity.js");
const criar = () => "NOVA";
// Um F5 não muda quem eu sou.
check("já tenho a minha: fico com ela",
  escolherIdentidade({ daAba: "eu", doBrowser: "outra", emUso: false, criar }).id === "eu",
  "recarregar a página entrava como jogador novo");
// A janela anterior fechou: o lugar é meu outra vez.
const herdada = escolherIdentidade({ daAba: null, doBrowser: "antiga", emUso: false, criar });
check("ninguém a usa: herdo-a", herdada.id === "antiga" && herdada.herdada === true,
  "fechar a janela e voltar deixava o jogador antigo na sala como desligado");
// Ainda lá está alguém: sou gente nova. É isto que faz duas pessoas no mesmo
// computador serem duas pessoas.
check("está ocupada: sou gente nova",
  escolherIdentidade({ daAba: null, doBrowser: "antiga", emUso: true, criar }).id === "NOVA",
  "dois separadores abertos ao mesmo tempo voltariam a ser o mesmo jogador");
check("sem nada guardado: sou gente nova",
  escolherIdentidade({ daAba: null, doBrowser: null, emUso: false, criar }).id === "NOVA",
  "primeira visita tem de dar uma identidade");

if (falhas > 0) {
  console.log(`=> test-stub-fidelity FALHOU (${falhas})`);
  process.exit(1);
}
console.log("=> test-stub-fidelity ok");
