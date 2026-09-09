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
  App.js                     entrada do app
  app.json                   config do Expo (nome, ícone, URL da API)
  src/
    api/                     chamadas para /api/... (mesmos endpoints do site)
    context/AuthContext.js   sessão de login (cookie, igual ao site)
    navigation/              abas do app
    screens/                 telas (Login, Visão Geral, FIIs)
    theme/colors.js          mesma paleta de CSS/Global/global_tokens.css
```

## O que já funciona

- Login/logout de verdade (mesmo usuário e senha do site, `POST /api/auth/login`)
- Aba "FIIs": lista a carteira real do usuário logado (`GET /api/fii`)

## O que falta (módulo por módulo, igual ao site)

Cripto, Cofrinho, Finanças, Calendário, Clima, Garagem, Treinos & Saúde, Carros/Casas de
Leilão, Notificações, Assistente de IA, Configurações — cada um vira uma tela nova em
`src/screens/`, reaproveitando o padrão de `FiiScreen.js` (chama a API, mostra lista).
