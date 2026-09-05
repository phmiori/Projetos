# Arquitetura e Diretrizes do Sistema Pessoal

## 1. Stack Tecnológica Oficial
> ⚠️ Nota de divergência: este documento originalmente previa um backend PHP, mas o projeto evoluiu para Node.js/Express (`server.js`) com Prisma ORM sobre PostgreSQL. As seções abaixo que mencionam `PHP/`, PDO ou MySQL/MariaDB são aspiracionais e não refletem a implementação atual — mantidas apenas como referência histórica da intenção original.
- **Backend:** Node.js com Express (rotas REST em `server.js`).
- **Conexão com Banco:** Prisma ORM (`SQL/schema.prisma`) para segurança contra SQL Injection.
- **Frontend:** HTML5, CSS3 e JavaScript puro (Vanilla JS).
- **Comunicação:** Requisições assíncronas via `fetch()` trafegando dados estritamente em formato JSON.
- **Banco de Dados:** PostgreSQL (hospedado no Neon).

## 2. Identidade Visual e Layout (Partido Missão + Finanças)
O sistema adota uma estética minimalista, moderna (estilo Apple) e de alto contraste, suportando **Modo Escuro (Padrão)** e **Modo Claro**.

### Variáveis Semânticas Centrais:
- **Tema Padrão:** Dark Mode (Definido em `:root` e `[data-theme="dark"]`).
- **Tema Claro:** Ativado ao aplicar `data-theme="light"` na tag `<html>` ou `<body>`.
- **Cores Semânticas Finanças:** `--color-income` (Receitas/Verde) e `--color-expense` (Despesas/Vermelho).
- **Cor da Marca:** `--accent-color` (`#EEBB00` - Amarelo Ouro) para botões principais e elementos ativos.
- **Bordas e Elementos:** Cantos arredondados padronizados em `8px` (`border-radius: 8px`).

### Regra Estrita de Estilização:
- **NUNCA** insira cores hexadecimais estáticas (`#FFFFFF`, `#000000`, etc.) nos CSS dos módulos (`index.css`, `calendario.css`).
- Use **estritamente** as variáveis semânticas declaradas no `global_tokens.css` (Ex: `var(--bg-main)`, `var(--bg-surface)`, `var(--text-main)`, `var(--border-color)`). Isso garante compatibilidade automática com troca de temas gastando o mínimo de tokens.

## 3. Layout Mobile-First & Responsividade Automática
Todo o layout deve adaptar-se automaticamente a qualquer tamanho de tela (Smartphones, Tablets, Notebooks e Desktops ultrawide):
- **Meta Tag Obrigatória:** Todos os arquivos HTML devem conter `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
- **Containers Fluídos:** Utilize CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`) e Flexbox com `flex-wrap: wrap` para reorganizar dashboards, cards e tabelas automaticamente.
- **Unidades Relativas:** Prefira `rem`, `%`, e `vh/vw` em vez de larguras fixas em `px`.
- **Media Queries Padronizadas:**
  - Mobile Small: `<= 480px` (empilhar todos os botões e formulários em largura total `width: 100%`).
  - Tablet / Notebook: `<= 768px` e `<= 1024px` (ajustar colunas do grid e barras laterais).
  - Desktop: `>= 1025px`.

## 4. Padrão Estrito de Organização de Pastas
O sistema é 100% modular (Feature-Driven). Cada funcionalidade tem sua pasta própria espelhada no frontend:
- `HTML/NomeDoModulo/nomedomodulo.html`
- `CSS/NomeDoModulo/nomedomodulo.css`
- `JS/NomeDoModulo/nomedomodulo.js`

> ⚠️ As linhas `PHP/NomeDoModulo/arquivos_especializados.php` e `SQL/NomeDoModulo/001_migracao.sql` originalmente previstas aqui não se aplicam: o backend real é um único `server.js` (Express) com rotas REST por módulo, e o schema do banco vive todo em `SQL/schema.prisma` (Prisma), sem pasta `PHP/` nem migrações SQL numeradas por módulo.

### Regra de Caminhos Relativos:
Os arquivos HTML devem importar CSS e JS usando caminhos de saída (`../../CSS/` ou `../../JS/`). O JavaScript deve apontar requisições para a pasta `/api/` (rotas REST do `server.js`), não `PHP/`.

## 5. Gestão do Banco de Dados (Prisma)
As mudanças no PostgreSQL (Neon) são feitas **manualmente** pelo desenvolvedor humano.
- O assistente deve apenas **editar** o `SQL/schema.prisma` com o novo modelo/campo.
- Após o humano rodar `npm run prisma:push` (com o servidor Node parado), ele avisará para continuar.

## 6. Instruções Críticas de Lembrete
- **Economia Severa de Tokens:** Gere apenas o código estritamente necessário. Não faça refatorações não solicitadas.
- **Apenas Um Módulo por Vez:** Não mexa em múltiplos módulos simultaneamente (exceto quando o usuário pedir explicitamente uma mudança que atravessa vários módulos de propósito).
- **Arquivos Focados no Backend:** Divida as rotas do `server.js` por módulo (ex.: `routes/fii.js`, `routes/cripto.js`). Evite um único arquivo gigante.
- **Sem Códigos Embutidos:** Não insira CSS ou JS dentro do arquivo HTML. Mantenha a separação absoluta.
- **Checklist Atualizado:** Sempre consulte e atualize o `PROGRESS.md` ao finalizar qualquer tarefa.
