# Os jogos que existem — o que fica, o que se corta

Pediste a lista para cortar o que não vale a pena, melhorar o resto, e só
depois voltar a expor. Aqui está, com o que eu **sei** e não com o que acho.

O que eu consigo medir: quanto trabalho de desenho cada um levou, que testes
tem, e que defeitos conhecidos estão em aberto. O que eu **não** consigo medir
é se é divertido — isso só sai de te sentares a jogar com pessoas. Por isso a
coluna da direita é uma recomendação, não um veredito.

## Multijogador (na sala)

| Jogo | Estado | O que eu recomendo |
|---|---|---|
| **Quadro branco** (livre, Forca, Desenha e Adivinha) | É o jogo com mais testes de longe — mais do que qualquer outro, e não vale a pena escrever quantos (contei-os mal duas vezes num dia; se o número interessar, `ls tests/cases` e abrem-se). Auditado de ponta a ponta, 9 defeitos reais corrigidos, pontos ligados ao placar, ajuda do Brasa, telemóvel medido. Tem agora vigia ao custo de repintar: uma mudança na sala custa uma cópia de tela e zero traços, com o quadro cheio ou vazio | **Fica.** É a joia da coroa e é onde está o trabalho todo |
| **Eu sei clássico** (letra + categorias + votação) | É o jogo que dá o nome à app; tem testes de fluxo e da votação | **Fica.** Sem ele a app perde a identidade |
| **Desenha e Adivinha** (bónus de fim de partida) | Ecrã próprio, o juiz escolhe o vencedor à mão. Ganhou um segundo baralho — o dos monumentos, que é o "Onde Fica Isto?" refeito — e a saída para quando quem desenha fecha o separador a meio | **Fica.** A recomendação anterior era cortá-lo por o modo novo do quadro fazer o mesmo e melhor; mantenho que se sobrepõem, mas agora ele carrega o "Onde Fica Isto?" às costas, e isso é razão para ficar |
| **Mapa-Múndi em equipa** | 32 países como PONTOS num fundo estilizado, não como territórios | **Substituído**, feito: o mapa novo ocupou-lhe o lugar e este foi para a oficina |
| **Conquistar o Mapa — capitais** | Segunda camada no mesmo mapa: os mesmos territórios e modos, mas a pergunta passa a ser a capital. 173 capitais (a Antártida, o Kosovo, a Somalilândia e o Chipre do Norte ficam de fora por não terem). Só a sozinho, por agora | **Fica** |
| **Conquistar o Mapa** (o mapa novo, em sala) | Os 177 países como territórios a sério, cada um do primeiro que o souber; errar deixa o país em causa e vale a dobrar a quem o souber a seguir; as bandeiras que o Brasa revela aparecem no mapa de toda a gente; três línguas ao mesmo tempo na mesma sala | **Fica.** É o segundo pilar, a par do quadro |
| **Estrada Maluca** (corrida) | Corrigido: a primeira batida é a que conta (transação), e o teste deixou de assumir que o carro só bate quando ele mandar. Está na oficina | **À espera da tua decisão** (ver o fim deste ficheiro) |
| **Fuga da Infeção** (apanhada) | A intermitência foi investigada e **arranjada** (444b65d): não eram os power-ups, era o relógio da ronda — infetar o último sobrevivente fechava a ronda e o power-up ficava num jogo já morto. Corridas seguidas do teste passam. Depois disso levou a arena toda à vista, paredes novas e power-ups de fuga | **Fica** |
| **Batalha no labirinto** | Tem testes (lógica e ecrã) e ganhou as animações de golpe e baque que pediste. Auditado: (a) o golpe acerta só por distância, sem olhar a paredes, e o que impede bater através da parede mais fina é **um píxel** (16+24+16 = 56 contra 55 de alcance); (b) o labirinto é todo andável, sem bolsas fechadas; (c) as armas nunca nascem dentro de uma parede. As três coisas estão presas por teste | **Fica** |
| **Mini-golfe** | Tem testes de lógica e de ecrã. A pista passou a 2400x1200 com terreno (aceleradores, saltitões, areia) e power-ups, por a anterior ser curta e monótona | **Fica** |
| **Onde Fica Isto?** (desenhado) | **Refeito** como pediste: já não é escolha múltipla sobre um desenho pronto — uma pessoa recebe o monumento e desenha-o, os outros dizem o país. O desenho da casa passou a ser a RESPOSTA, mostrada no fim com o nome e o país. Baralho de 24 monumentos, um por país | **Fica** |

## Jogar sozinho

| Jogo | Estado | O que eu recomendo |
|---|---|---|
| **Quadro branco solo** | 18 passos de teste, câmara, ferramentas, telemóvel, e agora o rato como deve ser | **Fica** |
| **Forca** (rondas, sequência, categorias) | Bem desenvolvido, com teste de sequência e de maratona | **Fica** |
| **Maratona de mini-jogos** | Não é um jogo, é a cola que liga os outros — com as falas da Dona Manga e do Brasa pelo meio | **Fica**, mas o valor dela depende de quais é que sobram |
| **Descartando Juntos** (cartas) | O mais complexo de todos; tem testes de lógica e de "profundidade" | **Decide tu**: é muito código para um jogo que talvez não seja o que queres que a app seja |
| **Memória** e **Palavra Relâmpago** | Os dois que escolheste dos seis pequenos | **Ficam** |
| **Kota Corre!**, **Mata o Inseto**, **Cada Macaco no Seu Galho**, **Olho de Lince** | Os outros quatro, na oficina | **À espera da tua decisão** |
| **Mini-Golfe** solo | Versão solo do de cima | **Fica** |
| **Mapa-Múndi**, **Onde Fica Isto?**, **Estrada Maluca** (solo) | Na oficina. O "Onde Fica Isto?" solo continua a ser o de escolha múltipla: o refeito é Pictionary, e Pictionary precisa de duas pessoas | **À espera da tua decisão** |
| **Recordes** e **Conquistas** | Ecrãs de apoio | **Ficam** |

### O corte que eu faria, se fosse meu

Ficava com: **quadro branco** (sala e solo), **Eu sei clássico**, **Forca
solo**, **o mapa novo**, e **dois** dos seis mini-jogos pequenos — os que te
derem mais vontade de voltar. Tudo o resto sai de vista até valer a pena.

Não apagava o código de nada: tirava do menu. Um jogo escondido pode voltar; um
jogo apagado tem de ser reescrito.

---

# O jogo do mapa-múndi — plano (FEITO)

> As seis fases abaixo estão construídas e no site: os 177 países como
> territórios, o modo difícil, a sugestão quando o jogo estagna, a sala com
> transação, o pódio, e uma segunda camada com as capitais (a sozinho). Fica
> aqui como estava porque é o registo de como se decidiu — não como trabalho
> por fazer.

## O jogo, como o descreveste

Clica-se num país e escreve-se o nome. Se estiver certo, o território pinta-se
da cor de quem acertou e fica trancado — ninguém lho tira nem lhe muda a cor. A
partida acaba quando o mapa estiver completo. Quando faltarem poucos e ninguém
souber mais nenhum, chega uma sugestão de um país que ainda falta, para o jogo
não morrer parado.

E um modo **difícil**: o mapa começa vazio — os países só APARECEM à medida que
alguém escreve o nome certo, cada um na cor de quem o escreveu.

## O que isto precisa que ainda não existe

O mapa que a app tem hoje são 32 países marcados como **pontos** num fundo
desenhado à mão. Para pintar territórios e para saber em qual se clicou, é
preciso a forma de cada país. Isso não se inventa: são dados.

Já confirmei que dá para ter, e a que custo:

- **Fonte:** Natural Earth (domínio público) através do pacote `world-atlas`,
  com licença ISC. Sem contas, sem chaves, sem pedir nada a ninguém em tempo
  de jogo.
- **Convertido para o formato do jogo:** 177 países, 288 anéis, 10 570 pontos.
  **191 KB** num ficheiro só, com as coordenadas já em fração do mapa (0 a 1) e
  arredondadas a quatro casas. (Números remedidos em setembro: o plano dizia
  286 anéis, 10 587 pontos e 168 KB, do primeiro corte dos dados. O ficheiro
  só se vai buscar quando o mapa abre — está medido no
  `tests/cases/mapa-desempenho-test.mjs` —, por isso os 191 KB não pesam na
  primeira página.)
- **A projeção é a mesma da imagem que mandaste** (equiretangular): x vem da
  longitude, y da latitude, sem contas nenhumas. O que desenharmos assenta em
  cima da tua imagem.

Se 177 países for demais para uma partida, corta-se por continente ou por
tamanho — os dados trazem o nome de cada um e dá para escolher.

## Como eu o construía, por fases

**Fase 1 — os dados e o desenho (sem jogo nenhum).**
Gerar o ficheiro dos países a partir do `world-atlas`, desenhá-lo num canvas
com a mesma câmara do quadro branco (afastar, aproximar, arrastar com o botão
direito — já está feito e testado), e acertar no país onde se clicou. O teste
desta fase é objetivo: clicar em cinco sítios conhecidos e receber cinco nomes
certos.

**Fase 2 — um jogador.**
Clicar, escrever, acertar, pintar, trancar. Nomes em português com os acentos
tratados como no quadro (o "c" e o "ç" já se resolvem, e reuso isso). Contador
de quantos faltam.

**Fase 3 — a sala.**
O território é do primeiro que acertar. Como duas pessoas podem clicar no mesmo
país ao mesmo tempo, quem ganha decide-se por transação, como já se faz na bola
vermelha do jogo clássico — não por confiança, porque aqui há corrida a sério.
Cada um na sua cor, escolhida como no quadro.

**Fase 4 — não deixar o jogo morrer.**
Quando ninguém acertar nada durante algum tempo, aparece o nome de um país que
ainda falta. Preferia isto a um relógio: a sugestão chega quando **o jogo
estagna**, não quando o tempo passa — assim uma sala rápida nunca a vê, e uma
sala encravada recebe-a logo. Quanto mais tempo parado, mais fácil é o país
sugerido.

**Fase 5 — o modo difícil.**
O mapa começa em branco: só o mar. Cada país aparece quando alguém o escreve,
na cor de quem o escreveu. Sem formas para clicar, escreve-se à sorte e ao
conhecimento — é outro jogo, com o mesmo material. Vale mais pontos, porque é
mais difícil e porque escrever "Laos" de cabeça não é o mesmo que reconhecer a
forma.

**Fase 6 — a par do quadro.**
Entrada própria no menu de jogar sozinho e na sala, ecrã inteiro como o quadro,
a Dona Manga a comentar quando alguém erra três vezes seguidas, e os pontos a
subirem ao placar da sala como agora acontece no quadro.

## O que eu precisava de ti (respondido pelo caminho)

1. **Quantos países** por partida: ficaram os 177, com modos por continente
   para quem quiser mais curto.
2. **Os pontos**: cada país vale o mesmo à saída, e o que dá gosto — seguidos,
   continentes, roubos — vive no marcador de dentro do mapa. Para fora vai um
   pódio da mesma grandeza dos outros jogos (ver "A escala dos pontos").

## O corte, feito (decisão do dono, setembro)

Estes oito saíram do site e foram para a **oficina** — não foram apagados: o
código e os testes ficam, e voltam quando estiverem bons.

Olho de Lince · Mata o Inseto · Cada Macaco no Seu Galho · Mapa-Múndi antigo
(solo e sala) · Kota Corre! · Descartando Juntos · Estrada Maluca (solo e
sala) · Onde Fica Isto? (solo e sala)

Como funciona: `public/js/oficina.js` tem a lista; os botões marcados com
`data-oficina` no HTML ficam escondidos, as caixas da maratona ficam
desmarcadas, e os sorteios de mini-jogos saltam-nos. Quem os quiser ver abre a
app com **`?oficina=1`** — é assim que os testes lhes continuam a chegar, para
não apodrecerem à espera.

**Fica no site:** Quadro branco (sala e solo), Eu sei clássico, Desenha e
Adivinha, **Onde Fica Isto?** (a versão desenhada, que voltou depois de
refeita), Fuga da Infeção, Labirinto: Batalha, Mini-Golfe, Conquistar o Mapa
(países, e capitais a sozinho), Forca solo, Palavra Relâmpago, Memória.

## O que os jogos do mesmo género têm (e este não tinha)

Fui ver o que se diz dos jogos vizinhos — Jackbox, skribbl.io, Gartic Phone,
e sobretudo as aplicações de "Stop"/Scattergories, que são as que fazem o
mesmo que o teu jogo faz. Não interessa o que eles anunciam; interessa aquilo
de que as pessoas se queixam, porque é aí que se vê o que falta.

**Feito agora: as categorias da casa.** Nas críticas das aplicações de Stop, o
pedido que se repete é escolher as categorias — e as que deixam escolher de
uma lista fixa continuam a não deixar ACRESCENTAR. O jogo de papel joga-se
assim desde sempre: cada grupo tem as suas ("marcas de carro", "coisas da
avó"). O anfitrião escreve até oito, toda a gente as vê antes de entrar, e
sorteiam-se como as outras. Guardado em `config.customCategories`, com índices
a partir de 100 para não mexer no significado dos que já estão gravados nas
respostas de uma sala a meio.

**Feito também: dizer porquê os pontos.** "Pontuação pouco clara, dá para
fazer batota" é a queixa que mais se repete nas críticas do StopotS. O ecrã de
fim de ronda mostrava o total e mais nada. Agora cada resposta tem a razão ao
lado do número — "só tu · 10 pts", "alguém escreveu o mesmo · 5 pts", "não
começa por P · 0 pts", "chumbada pela maioria · 0 pts" — e as duas maneiras de
chumbar aparecem separadas, porque uma é a regra do jogo e a outra é a mesa a
decidir. A tua conta abre sozinha; as dos outros abrem-se se quiseres conferir.

**Feito também: cor e espessura no Desenha e Adivinha.** Quem desenhava tinha
uma caneta só, de uma cor só, enquanto o quadro branco ao lado tem 68 cores e
dez ferramentas — e nos jogos de desenho do género escolher a cor é o mínimo
que se espera. Agora abre a mesma paleta dos quadros e tem três espessuras. A
cor e a espessura viajam no primeiro ponto de cada traço (uma vez por traço,
não por ponto), e um traço antigo sem elas continua a sair com a tinta de
sempre — uma sala a meio de uma partida não muda de aspeto.

**E anular o último traço**, que é o pedido seguinte em qualquer jogo de
desenho: sem isso um risco enganado só se desfazia limpando a folha toda, com
o tempo a correr. Usa o mesmo `lastStrokeKeys` do quadro de sala — o que é um
"traço" tem de ser a mesma coisa nos dois sítios.

**Feito também: o desafio do dia.** Nas críticas das aplicações do género
repete-se "não encontro ninguém para jogar" — o jogo depende de haver mais
gente acordada. O desafio é a resposta que os jogos diários deram a isso: uma
ronda por dia, a MESMA para toda a gente, sorteada a partir da data (sem
servidor: a data é a semente, e a mesma data dá sempre a mesma letra e as
mesmas categorias em qualquer telemóvel). Uma vez por dia — jogar outra vez
mostra o resultado mas não conta, senão não haveria nada para comparar. Conta
dias seguidos e dá um texto para colar numa conversa (🟩⬜ como os jogos que
as pessoas partilham).

**Feito também: as cores de quem conquista o quê.** No mapa em sala a cor é a
única coisa que diz de quem é cada país — a bandeira desenhada lá dentro é a
bandeira DO PAÍS, não a de quem o ganhou. Medi a lista antiga e havia pares
que ninguém distingue: dois verdes a 12,5 de ΔE em visão normal, e para quem
não distingue vermelho de verde (uma pessoa em cada doze) o vermelho e o
castanho ficavam a 4,0 — iguais. A lista nova foi escolhida a medir: todos os
pares acima de 20 nas três visões, com contraste que chegue para o contorno a
tinta se ver. As primeiras cinco cores continuam praticamente as tuas; as
últimas tiveram de se afastar, porque dez cores distinguíveis por toda a gente
é quase o limite do que cabe.

**E uma pergunta que fica para ti sobre o mesmo ecrã:** o preenchimento do país
é a cor do dono misturada com 72% de branco (`corClara`), para a bandeira se
ler por cima. Isso deixa os preenchimentos quase iguais uns aos outros — 3,4
de ΔE na lista antiga, 6,2 na nova, quando 20 é o que se distingue à vontade.
Quem carrega a informação é o contorno de 2,2px. Baixar a mistura para uns 55%
duplicava a diferença entre países de donos diferentes, mas escurece o fundo
por baixo das bandeiras, que foi uma escolha tua. Diz-me se queres que mexa.

**E no quadro, cada um passa a ter a sua cor sem a pedir.** Por omissão toda a
gente desenhava com a tinta da casa: quem não abrisse o seletor ficava igual a
quem também não o abriu, e a cor — que é a única coisa que diz de quem é cada
traço — não dizia nada. Agora sai da ordem de chegada, como no mapa, e o
seletor passa a ser uma troca em vez de uma obrigação.

Medi também a paleta do quadro e NÃO lhe mexi: o pior par é 17,0 em visão
normal e 6,0 em deuteranopia (o do mapa era 12,5 e 4,0). Tentei encontrar dez
cores seguras para uma folha branca e o que sai são rosas-choque e quase-pretos
que não são deste jogo — dez cores distinguíveis por toda a gente sobre papel
não cabe sem estragar o aspeto. Ficam melhor as cores de sempre, agora que
ninguém fica sem a sua.

**O resto do que encontrei, por ordem do que me parece valer mais:**

| O que se queixam por aí | Como estamos | O que faria |
|---|---|---|
| "Fiquei à espera sem perceber o que fazer, sem instruções" (StopotS) | **Feito.** A ronda diz a regra com a letra desta ronda ("Todas as respostas começam por M. Uma resposta que mais ninguém escreva vale a dobrar"), e o ecrã da bola resume o jogo todo | Faltava só aqui: os mini-jogos já se explicavam no "pronto?" |
| "Estar à espera da vez" — a queixa nº1 do skribbl | Em Desenha e Adivinha quem não desenha escreve palpites, por isso não está parado; na Forca quem não tem a caneta vota letras | Sem dívida aqui, mas é o que estragaria estes dois jogos se um dia se lhes mexesse |
| Salas grandes (o StopotS deixa 50 a jogar ao mesmo tempo) | Máximo 10 | **Decisão tua.** 10 foi escolhido no primeiro build "até indicares outro valor"; a votação com 20 pessoas é outra experiência, não a mesma maior |
| O álbum do Gartic Phone (ver no fim tudo o que se desenhou) | **Feito.** Os resultados finais mostram os desenhos da noite, com quem desenhou e quem acertou; toca-se num para o guardar | Vive no browser de cada um (cada cliente já recebeu os traços), por isso a sala não engorda com imagens. O preço: quem recarregar a página a meio perde o que veio antes |
| Voltar a entrar depois de o telemóvel bloquear | Já funciona (`rejoinRoom`) e o lugar e os pontos ficam | Nada a fazer |
| Entrar a meio | Fechado de propósito, menos no quadro | Nada a fazer — entrar a meio de uma partida pontuada estraga a classificação |

## A escala dos pontos

Os jogos bónus são o extra da partida, não a partida. A regra: um bónus vale,
ao melhor jogador de uma ronda, **entre 15 e 40 pontos**.

| Jogo | O que paga |
|---|---|
| Fuga da Infeção | 1/segundo + 25 de sobrevivente (~30–55 numa ronda de 30s) |
| Labirinto: Batalha | 15 por morte + 20 de sobrevivente + 1/segundo |
| Mini-Golfe | 25 / 16 / 10 / 6, mínimo 3 |
| Conquistar o Mapa | 25 / 16 / 10 / 6, mínimo 3 |
| Desenha e Adivinha | 15 a quem acerta, 8 a quem desenhou |
| Quadro branco | 1 por letra, 3 por palavra, amortecido acima de 25 (teto 50) |

O mapa foi o que obrigou a escrever isto. Pagava ao placar da sala os pontos
do seu próprio marcador: conquistar quarenta países dava **seiscentos** pontos
quando a apanhada inteira dá trinta. Um jogo decidia a partida sozinho e os
outros deixavam de contar. Agora o marcador rico fica dentro do mapa — os
seguidos, os continentes, os roubos, que é o que dá gosto a jogá-lo — e para
fora vai um pódio da mesma grandeza dos outros.

O quadro tinha o mesmo defeito, mais devagar: o que se conta lá dentro cresce
com o tamanho da partida, que a sala escolhe. Cinco palavras dão uns vinte ao
melhor jogador; trinta palavras davam cento e vinte. As letras não se mexem —
são o jogo, e o número que se vê a subir — mas o que sai daí para o placar da
sala vale tudo até 25 e metade daí para cima, com teto em 50:

    12 -> 12    25 -> 25    40 -> 33    60 -> 43    120 -> 50

Escolheu-se amortecer em vez de pôr um teto simples porque um teto fazia 45 e
60 pagarem o mesmo — quem jogou melhor não levava mais. Numa partida normal
isto não muda nada, que é o ponto.

`tests/cases/test-equilibrio.mjs` guarda a regra: um jogo novo que pague fora
da banda falha o teste, para a conversa sobre quanto vale acontecer antes de ir
para o site. Verifica também que a amortecedor do quadro nunca inverte a ordem.

---

# Duas perguntas pequenas, para quando quiseres

## A maratona ficou com dois jogos

A "Maratona de mini-jogos" vinha com seis marcados por omissão — os curtos.
Os mais longos (Forca, Mini-Golfe) ficavam por opção, e isso fazia todo o
sentido com doze mini-jogos no menu. Com quatro, sobram **dois** marcados:
Palavra Relâmpago e Memória. Uma maratona de dois jogos de trinta segundos
não é bem uma maratona.

Experimentei marcar os quatro por omissão e desfiz: partiu cinco testes que
percorrem a maratona até ao fim, e ao olhar para o estrago percebi que a
decisão não é minha. Quanto tempo deve durar uma maratona por omissão é
gosto, não correção — e deixar os longos por opção foi escolha tua, não
descuido. Basta dizeres "marca os quatro" e são dois minutos (mais os
testes).

## Quem se desliga continua a ganhar pontos

Nos dois jogos de sobreviver — Fuga da Infeção e Batalha no Labirinto — quem
se desliga a meio da ronda continua a contar segundos e a levar o bónus de
sobrevivente, porque a conta olha para "foi apanhado?" e não para "ainda cá
está?". Na prática, sair pode ser a jogada que mais pontos dá, se ninguém se
lembrar de ir bater no boneco parado.

Não mexi nisto porque a correção óbvia — só pontuar quem está ligado — castiga
quem tem net má exatamente como castiga quem desiste, e isso pode ser pior do
que a doença. É uma decisão de gosto, não de código. Os dois jogos fazem o
mesmo, por isso não é um estar errado e o outro certo.

---

# A decisão que falta (a única)

Os oito jogos da oficina estão à espera de uma coisa que não é trabalho meu:
**quais é que queres mesmo de volta.**

Não avanço sozinho por uma razão concreta: cortaste-os por não estarem bons, e
dos seis mini-jogos pequenos disseste "escolhe dois ou três" — ficaram dois.
Pôr os outros quatro em condições é trabalho que pode ir todo ao lixo se a
resposta for "esses não". Prefiro perguntar a gastar.

**O que custa mantê-los**, medido e não estimado. As linhas de código são as
do bloco de cada jogo no `solo.js`, contadas entre os comentários de secção do
próprio ficheiro (é assim que está arrumado); os testes são os ficheiros que
existem só por causa daquele jogo:

| Na oficina | linhas no solo.js | ficheiros de teste | linhas de teste |
|---|---|---|---|
| Descartando Juntos | 413 | 3 | 298 |
| Kota Corre! | 399 | 1 | 119 |
| Estrada Maluca (solo + sala) | 183 | 3 | 350 |
| Cada Macaco | 164 | 2 | 208 |
| Olho de Lince | 141 | 1 | 130 |
| Onde Fica Isto? (solo) | 108 | 1 | 84 |
| Mapa-Múndi antigo | 104 | 1 | 95 |
| Mata o Inseto | 96 | 1 | 113 |
| **Total** | **1608 (43% do solo.js)** | **13** | **1397** |

Ou seja: quase metade do ficheiro dos jogos a sozinho, e treze dos oitenta e
seis casos de teste, existem hoje para jogos que ninguém no site pode jogar.
Não é urgente — não faz mal a ninguém e os testes continuam verdes —, mas é o
número que faltava para a conversa ser sobre factos. Dois jogos, o Descartando
Juntos e o Kota Corre!, são metade disso sozinhos.

(Correção do que escrevi aqui primeiro: eu disse que o Mapa-Múndi antigo em
SALA não tinha teste nenhum. Tem — procurei por NOME de ficheiro e não por
conteúdo, e nenhum se chama "map-trivia". Quem o testa é o
`mp-bonus-queue-test.mjs`, e a sério: joga as rondas pela interface, escreve
respostas certas e erradas, e passa pela votação. As linhas dele não estão na
coluna dos testes acima porque o ficheiro serve a fila de bónus inteira, não
este jogo.)

O que sei sobre cada um, para a resposta ser mais fácil:

| Na oficina | O que lhe falta, em concreto |
|---|---|
| Olho de Lince, Mata o Inseto, Cada Macaco, Kota Corre! | Nada de partido: funcionam e têm testes. O problema é serem quatro coisas pequenas e parecidas — é a razão do teu "escolhe dois ou três" |
| Mapa-Múndi antigo (solo e sala) | Substituído pelo mapa a sério. Só faz sentido voltar se gostares dele como jogo curto, e não como mapa |
| Descartando Juntos | Muito código para um jogo que talvez não seja o que queres que a app seja. É o que mais custa manter |
| Estrada Maluca (solo e sala) | O defeito conhecido está arranjado. Só precisa de uma passagem de qualidade como as que os do site levaram |
| Onde Fica Isto? solo | O irmão de sala voltou refeito como desenho. O solo continua a ser escolha múltipla — Pictionary precisa de duas pessoas, por isso este teria de ser outra ideia |

Enquanto não responderes, o esforço vai para os dez que estão no site. Basta
dizeres os nomes.
