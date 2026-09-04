# Eu sei!

Versão digital multiplayer do jogo de papel "Stop"/Scattergories. Jogado no
browser, sincronizado em tempo real via Firebase — pensado para depois ser
embrulhado em Electron/Tauri e publicado na Steam.

Inclui dois modos: **multiplayer** (bola → escolha da letra → categorias →
votação → pontuação → ronda seguinte → resultados finais, até 10 jogadores,
configurável) e **solo** (runs com dificuldade crescente, totalmente
offline). Ainda não inclui: Electron/Steamworks, cosméticos/DLC. Ver secção
"O que falta" no fundo.

## Como pôr isto a funcionar (sem programar)

Precisas de criar um projeto Firebase gratuito — é a "sala de máquinas" que
sincroniza os jogadores em tempo real. Leva uns 5 minutos, só cliques:

1. Vai a [console.firebase.google.com](https://console.firebase.google.com/) e cria um novo projeto (nome sugerido: `eu-sei`).
2. No menu lateral, abre **Build → Realtime Database** → "Create Database" → escolhe uma região → começa em modo *locked* (as regras deste projeto tratam disso, ver abaixo).
3. No menu lateral, abre **Build → Authentication → Sign-in method** → ativa **Anonymous**. (É assim que cada jogador tem uma identidade única sem precisar de criar conta/password.)
4. Ainda em Authentication ou nas Definições do projeto, vai a **Project settings → General → Your apps → Add app → Web (`</>`)**. Dá-lhe um nome (ex. "Eu sei web") e regista.
5. Vai aparecer um bloco de código com `const firebaseConfig = { apiKey: ..., ... }`. Copia esses valores para o ficheiro [`public/firebase-config.js`](public/firebase-config.js) deste projeto, substituindo os textos `COLA_AQUI_...`.
6. Em **Realtime Database → Rules**, cola o conteúdo do ficheiro [`database.rules.json`](database.rules.json) deste projeto e publica.

Esses valores do `firebaseConfig` (incluindo a "API key") **não são
secretos** — o Firebase Web foi feito para eles ficarem visíveis no browser
do jogador; a segurança vem das Regras da Realtime Database, não de esconder
esta chave. Por isso não há problema em fazer commit deste ficheiro.

### Pôr o jogo online (para jogar com amigos pela internet)

A forma mais simples sem instalar nada: **GitHub Pages**.

1. No GitHub, abre este repositório → separador **Settings → Pages**.
2. Em "Build and deployment", escolhe a branch onde este código está e a pasta `/eu-sei-game/public` (ou copia o conteúdo de `public/` para a raiz de um repo dedicado, se preferires — ver nota sobre mudar de repositório mais abaixo).
3. Guarda. Ao fim de 1-2 minutos o GitHub dá-te um link (algo como `https://mangosalter.github.io/desktop-tutorial/`).
4. Esse link é o jogo. Cada jogador abre-o no browser (telemóvel, portátil, o que for), põe o nome, e um deles carrega em "Criar sala" — os outros usam "Entrar na sala" com o código de 4 letras que aparece.

### Testar já, sem publicar

Também podes só abrir `public/index.html` diretamente num browser (ou usar
a extensão "Live Server" do VS Code) para testar sozinho com dois separadores
do browser lado a lado — cada separador conta como um jogador diferente.

## Sobre mudar este código para um repositório próprio

Isto está a viver dentro do repo `desktop-tutorial` por agora (limitação da
sessão que criou isto, não do projeto). Quando quiseres dar-lhe o nome
definitivo (`eu-sei` ou parecido):

- No GitHub, o dono do repo pode ir a **Settings → General → Repository
  name** e simplesmente renomear `desktop-tutorial` — sem perder histórico,
  sem programar nada.
- Ou criar um repositório novo vazio e fazer upload da pasta `eu-sei-game/`
  para lá.

## Arquitetura (para quem pegar nisto depois)

- **Sem passo de build.** HTML/CSS/JS puro com módulos ES (`<script type="module">`),
  Firebase importado por URL a partir da CDN da Google. Não há `npm install`.
- **Firebase Realtime Database** guarda o estado de cada sala em
  `rooms/{CÓDIGO}` — jogadores, configuração, ronda atual, respostas, votos,
  pontuações. Todos os clientes ligados a uma sala ouvem esse nó e
  redesenham o ecrã conforme o campo `state` muda
  (`lobby → ball → letterPick → categories → voting → roundScore → final`).
- **Sem servidor de jogo dedicado.** O cliente do "anfitrião" (o jogador que
  criou a sala; migra automaticamente para outro jogador ligado se o
  anfitrião cair) é responsável por disparar as transições que dependem de
  tempo (acabou o tempo da ronda, acabou a votação) ou de condição partilhada
  (ninguém clicou na bola). Isto evita precisar de Cloud Functions/servidor
  próprio para este primeiro build, à custa de confiar no cliente do
  anfitrião — aceitável para jogar com amigos, a rever se isto for para
  produção pública a sério (ver "O que falta").
- **Validação de respostas:** só é verificado automaticamente se a resposta
  começa pela letra da ronda. Tudo o resto (é uma palavra real? encaixa na
  categoria?) fica para os jogadores decidirem por votação
  (✕ Inválida / 👑 Glória / 😂 Engraçada), como descrito na secção de
  pontuação do documento original.
- **Pontuação** implementada exatamente como no documento: válida e única =
  10 pts; válida e repetida = 5 pts; inválida (não começa pela letra, ou
  invalidada por mais de metade dos outros jogadores) = 0 pts; Glória = +2
  por voto, sem limite, somado ao valor base; Engraçada = 2 pts fixos
  (substitui os 0 pts de uma resposta inválida), independentemente do nº de
  votos.
- **Categorias e letras não repetem** dentro da mesma partida (evita calhar
  a mesma letra ou categoria duas vezes numa partida de 5 rondas).
- **Modo solo** (`js/solo.js`) não usa Firebase nenhum — corre inteiramente
  no browser, mesmo sem internet. Cada "run" começa com 5 categorias e 75s
  por ronda; a cada ronda o tempo desce 5s (mínimo 30s) e a partir da 3ª
  ronda entra mais 1 categoria a cada 2 rondas (máximo 12). Só se valida a
  letra (sem lista de palavras, igual ao multiplayer); precisas de acertar
  pelo menos metade das categorias da ronda para continuar a run — senão
  acaba e mostra a pontuação final. O recorde fica guardado no
  `localStorage` do browser (por isso é por aparelho/browser, não
  partilhado entre dispositivos).

### Ficheiros

```
eu-sei-game/
├── database.rules.json      # regras de segurança da Realtime Database
├── public/
│   ├── index.html            # os 7 ecrãs do jogo (lobby, bola, letra, ...)
│   ├── style.css
│   ├── firebase-config.js    # credenciais do TEU projeto Firebase (não secreto)
│   └── js/
│       ├── data.js           # pool de 40 categorias, alfabeto, letras difíceis, limites de configuração
│       ├── firebase-init.js  # ligação ao Firebase, autenticação anónima, relógio do servidor
│       ├── room.js           # todas as leituras/escritas na sala (única camada que fala com o Firebase)
│       ├── app.js            # máquina de estados da UI multiplayer, um ecrã por fase do jogo
│       └── solo.js           # modo single-player, offline, independente do resto
```

## Decisões tomadas neste build (a confirmar)

- Máximo de 10 jogadores por sala (o documento não fixava um número exato,
  só "otimizado até ~10-12"; ficou 10 até indicares outro valor).
- A votação de respostas tem um limite de tempo de 60s (não estava definido
  no documento — sem isto, uma sala podia ficar bloqueada à espera de votos
  que nunca vêm). O anfitrião também pode terminar a votação mais cedo à mão.
- Se ninguém clicar na bola 15s depois dela aparecer, a ronda da bola
  recomeça automaticamente.
- Se quem ganhou a bola desligar-se antes de escolher letra, o jogo escolhe
  automaticamente a primeira das 3 letras ao fim de 8s, para a sala não
  ficar presa.

## O que falta (próximos passos sugeridos)

- Wrap em Electron/Tauri e integração Steamworks (achievements, lobbies via
  Steam em vez de código de sala, etc.).
- Mini-jogos extra / easter eggs do modo multiplayer "de variedade".
- Se isto for para uma audiência grande/pública: mover a lógica do
  anfitrião e a validação de pontuação para Cloud Functions, para não
  depender de confiar no cliente de um jogador.
- Cosméticos (temas, skins da letra, sons) como DLC, conforme o plano de
  monetização do documento original.
