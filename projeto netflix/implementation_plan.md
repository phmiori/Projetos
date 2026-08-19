# Evolução do Flixora: Backend e Novas Páginas

Para adicionar um banco de dados real e as páginas que faltam, vamos transformar o projeto (que atualmente é apenas estático) em uma aplicação Full-Stack usando Node.js e SQLite (um banco de dados leve que não precisa de instalação complexa).

## User Review Required

> [!IMPORTANT]
> A estrutura do projeto vai mudar um pouco. Todos os arquivos atuais de front-end (HTML, CSS, JS, assets) serão movidos para uma pasta chamada `public`. O servidor rodará na raiz do projeto com um arquivo `server.js`. Você concorda com essa mudança na organização dos arquivos?

## Open Questions

- Quer que o sistema exija validações fortes de senha (como letras maiúsculas, números, etc), ou manter simples para o portfólio?
- Quer que a página "Minha Lista" realmente salve os filmes selecionados no banco de dados, ou podemos mantê-la visual por agora?

## Proposed Changes

### 1. Configuração do Servidor (Node.js + SQLite)

Será criado o backend que fornecerá o banco de dados e hospedará os arquivos.

#### [NEW] `package.json`
- Configuração do projeto com as dependências `express` e `sqlite3`.

#### [NEW] `server.js`
- Servidor web usando Express.
- Criação automática do banco de dados SQLite (`database.sqlite`) com a tabela `users` (id, email, password).
- Criação das rotas API: `/api/login` e `/api/register`.

### 2. Novas Páginas (Front-end)

#### [NEW] `public/cadastro.html`
- Tela de criação de conta (registro) que salvará o novo usuário no banco de dados.

#### [NEW] `public/perfis.html`
- A clássica tela da Netflix "Quem está assistindo?". Redirecionará para o catálogo.

#### [NEW] `public/minha-lista.html`
- Uma página dedicada para ver os filmes e séries salvos.

### 3. Ajustes no Código Existente

#### [MODIFY] `public/login.html`
- Integração do formulário com a rota real da API via JavaScript (`fetch('/api/login')`).
- Redirecionamento para a página de `perfis.html` após o login com sucesso.

#### [MODIFY] `public/index.html`
- Redirecionamento do campo de e-mail (CTA) para a tela de `cadastro.html` em vez da tela de login.

## Verification Plan

### Manual Verification
- Iniciar o servidor rodando `node server.js`.
- Acessar `localhost:3000/cadastro.html` e criar um novo usuário.
- Acessar `localhost:3000/login.html` e fazer login com as credenciais criadas.
- Verificar o fluxo: Login -> Seleção de Perfis -> Catálogo.
- Acessar a página "Minha Lista".
