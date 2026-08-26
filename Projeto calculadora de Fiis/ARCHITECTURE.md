# Arquitetura e Diretrizes do Sistema Pessoal

## 1. Stack Tecnológica Oficial
- **Backend:** PHP 8.x (Estruturado/Modular, sem frameworks pesados).
- **Conexão com Banco:** PDO (PHP Data Objects) para segurança contra SQL Injection.
- **Frontend:** HTML5, CSS3 e JavaScript puro (Vanilla JS).
- **Comunicação:** Requisições assíncronas via `fetch()` trafegando dados estritamente em formato JSON.
- **Banco de Dados:** MySQL / MariaDB (SQL).

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
O sistema é 100% modular (Feature-Driven). Cada funcionalidade tem sua pasta própria espelhada:
- `HTML/NomeDoModulo/nomedomodulo.html`
- `CSS/NomeDoModulo/nomedomodulo.css`
- `JS/NomeDoModulo/nomedomodulo.js`
- `PHP/NomeDoModulo/arquivos_especializados.php`
- `SQL/NomeDoModulo/001_migracao.sql`

### Regra de Caminhos Relativos:
Os arquivos HTML devem importar CSS e JS usando caminhos de saída (`../../CSS/` ou `../../JS/`). O JavaScript deve apontar requisições para a pasta `../../PHP/`.

## 5. Gestão do Banco de Dados (SQL)
As mudanças no MySQL local são feitas **manualmente** pelo desenvolvedor humano.
- O assistente deve apenas **gerar** os arquivos SQL numerados de forma incremental (Ex: `001_criacao.sql`, `002_add_campo.sql`) dentro da pasta `SQL/Modulo/`.
- Após o humano aplicar o script no banco local, ele avisará para continuar.

## 6. Instruções Críticas de Lembrete
- **Economia Severa de Tokens:** Gere apenas o código estritamente necessário. Não faça refatorações não solicitadas.
- **Apenas Um Módulo por Vez:** Não mexa em múltiplos módulos simultaneamente.
- **Arquivos Focados no PHP:** Divida o PHP por funções (`buscar.php`, `salvar.php`). Evite um único arquivo gigante.
- **Sem Códigos Embutidos:** Não insira CSS ou JS dentro do arquivo HTML, nem HTML dentro do PHP. Mantenha a separação absoluta.
- **Checklist Atualizado:** Sempre consulte e atualize o `PROGRESS.md` ao finalizar qualquer tarefa.
