# FinanceHub Mobile

App Android (React Native / Expo) do FinanceHub. **Não tem banco próprio** — fala com a
mesma API REST do site (`server.js`, na raiz do projeto), que por sua vez usa o mesmo
Postgres (Neon). Ou seja: o que você cadastra no site aparece no app, e vice-versa.

## Como rodar (celular físico, mais fácil)

1. Instale o app **Expo Go** na Play Store do seu celular
2. Nesta pasta (`App/`), rode:
   ```bash
   npm install
   npm start
   ```
3. Aparece um QR code no terminal — escaneie com o Expo Go (celular e computador precisam
   estar na mesma rede Wi-Fi)

Se der o erro `'"node"' não é reconhecido...` (é um bug conhecido do npm no Windows quando o
caminho da pasta tem espaço, o mesmo que já apareceu com `npm run prisma:push`), rode direto
pelo `node`, sem passar pelo `npm`/`npx`:
```bash
node node_modules/expo/bin/cli start
```

## Qual backend o app usa

Por padrão, o app já aponta para a **produção** (`https://projetos-mnw4.onrender.com`),
configurado em `app.json` → `expo.extra.apiUrl`. Ou seja, funciona direto, sem precisar rodar
nada no computador — só precisa estar logado com um usuário que já existe no banco.

Se quiser testar contra o servidor local (`npm run dev` na raiz do projeto) em vez da
produção, troque esse valor pelo **IP da sua máquina na rede local** (não `localhost` —
o celular não entende isso), por exemplo `"apiUrl": "http://192.168.1.50:3000"`.

## Gerar um .apk para instalar direto (sem Expo Go)

Precisa de uma conta gratuita em [expo.dev](https://expo.dev) e do EAS CLI:
```bash
node node_modules/expo/bin/cli install eas-cli --dev  # (ou: npm install --save-dev eas-cli)
node node_modules/.bin/eas build --platform android --profile preview
```
O EAS builda na nuvem (gratuito, com fila) e devolve um link pra baixar o `.apk`.

## Estrutura

```
App/
  App.js                     entrada do app (envolve tudo em GestureHandlerRootView)
  app.json                   config do Expo (nome, ícone, URL da API)
  src/
    api/                     chamadas para /api/... (mesmos endpoints do site)
    components/              ListaTela, CartaoItem, BotaoFab, FormularioModal (modal de cadastro/edição reutilizável)
    context/AuthContext.js   sessão de login (cookie, igual ao site) + editar perfil
    hooks/useLista.js         estado comum de "buscar lista" (loading/erro/refresh)
    navigation/RootNavigator.js  menu lateral (Drawer), mesmo agrupamento Hub Financeiro/Hub Pessoal do site
    screens/                 uma tela por módulo (financas/ tem sub-abas: Visão Geral, Transações, Contas, Categorias)
    theme/colors.js          mesma paleta de CSS/Global/global_tokens.css
    utils/formatadores.js    formatarMoeda/formatarData/formatarDataHora
```

## O que já funciona

- Login/logout de verdade (mesmo usuário e senha do site, `POST /api/auth/login`)
- Menu lateral (Drawer) com o mesmo agrupamento Hub Financeiro / Hub Pessoal da sidebar do site, respeitando os negócios que você ocultou em Configurações
- **Visão Geral com os 4 KPIs reais do site** (Patrimônio Líquido Total, Capital Alocado em Operações, Lucro Líquido Realizado, ROI Médio) + resumo por módulo
- **Cadastrar, editar e excluir** (não é só visualização) em:
  - **Hub Financeiro**: Fundos Imobiliários (carteira + "Atualizar Cotações" + Lista de Observação com alerta por e-mail), Cripto Moedas, Carros de Leilão, Casas de Leilão, Cofrinho
  - **Hub Pessoal**: Calendário, Garagem, Treinos & Saúde (blocos + exercícios + registros de saúde), Finanças (Transações, Cartões de Crédito + pagar fatura, Contas, Categorias)
  - **Configurações**: editar perfil, alterar senha, mostrar/ocultar negócios do Hub Financeiro, baixar meus dados (backup), e administração de usuários (só para admins)
- **Só visualização** (ainda): Clima (local favorito), Notificações — nenhum desses tem "cadastrar" no site também (Notificações é derivada do Calendário/Faturas; Clima só tem o favorito, que se configura no site)

Também tem o **Assistente de IA** (chat), item próprio no menu — mesmo backend do site: responde perguntas com os dados reais da carteira, sugere alocações, manda e-mail e adiciona FII na carteira quando você pede na conversa.

## O que falta

- **Finanças**: parcelamento no cartão de crédito ainda só no site (Transações no app cobrem Crédito sem parcelar, mas não a divisão em N parcelas)
- **Gastos detalhados** de Carros/Casas de Leilão (lançador de gastos linha a linha) e **Manutenções** da Garagem — hoje só os campos agregados, sem o histórico detalhado
- Gráficos da Visão Geral (doughnut/barras) — só os números, sem os gráficos do Chart.js
- Notificações push (o site tem via Web Push; o app ainda não pede permissão nem registra token)
- Ícone e splash screen definitivos (`App/assets/icon.png` está usando o mesmo placeholder do PWA do site)
- Publicar na Play Store (hoje só dá para instalar via Expo Go ou gerar um `.apk` manualmente com EAS Build)
