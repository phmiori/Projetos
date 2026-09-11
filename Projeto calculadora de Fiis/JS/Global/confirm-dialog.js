/**
 * JS/Global/confirm-dialog.js
 * Modal de confirmação componentizado, compartilhado por todos os módulos — substitui o
 * window.confirm() nativo do navegador por um diálogo com a identidade visual do FinanceHub.
 * Injetado dinamicamente no DOM só quando chamado (sem precisar de markup fixo na página).
 *
 * Uso simples (substitui `confirm('texto')`):
 *   if (!(await confirmarAcao('Excluir este item?'))) return;
 *
 * Uso com título e estilo de perigo (botão de confirmar em vermelho):
 *   if (!(await confirmarAcao('Essa ação não pode ser desfeita.', { titulo: 'Excluir conta', perigo: true }))) return;
 *
 * Uso com botões customizados (decisões de mais de 2 caminhos, ex.: excluir "esta" vs
 * "esta e as futuras" vs cancelar). Resolve com o `valor` do botão clicado, ou `null` se
 * fechado pelo X/backdrop/Esc:
 *   const escolha = await confirmarAcao('Este evento faz parte de uma série.', {
 *       botoes: [
 *           { valor: 'futuras', texto: 'Esta e as futuras', primario: true, perigo: true },
 *           { valor: 'uma', texto: 'Somente esta' },
 *           { valor: 'cancelar', texto: 'Cancelar' }
 *       ]
 *   });
 */
function confirmarAcao(mensagem, opcoes = {}) {
    const {
        titulo = 'Confirmação',
        textoConfirmar = 'Confirmar',
        textoCancelar = 'Cancelar',
        perigo = false,
        botoes = null
    } = opcoes;

    const listaBotoes = botoes || [
        { valor: false, texto: textoCancelar },
        { valor: true, texto: textoConfirmar, primario: true, perigo }
    ];
    const valorAoFechar = botoes ? null : false;

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitulo">
                <div class="confirm-dialog-header">
                    <h2 class="confirm-dialog-title" id="confirmDialogTitulo"></h2>
                </div>
                <div class="confirm-dialog-body"></div>
                <div class="confirm-dialog-footer"></div>
            </div>
        `;

        overlay.querySelector('.confirm-dialog-title').textContent = titulo;
        overlay.querySelector('.confirm-dialog-body').textContent = mensagem;

        const footer = overlay.querySelector('.confirm-dialog-footer');
        // Botões "primário" sempre por último (mais à direita), na ordem que o chamador passou
        const ordenados = [...listaBotoes].sort((a, b) => (a.primario ? 1 : 0) - (b.primario ? 1 : 0));

        function finalizar(valor) {
            overlay.classList.remove('is-visible');
            document.removeEventListener('keydown', aoTeclar);
            setTimeout(() => overlay.remove(), 150);
            resolve(valor);
        }

        ordenados.forEach((botao) => {
            const btnEl = document.createElement('button');
            btnEl.type = 'button';
            btnEl.className = 'confirm-dialog-btn' + (botao.primario ? (botao.perigo ? ' confirm-dialog-btn-perigo' : ' confirm-dialog-btn-primary') : '');
            btnEl.textContent = botao.texto;
            btnEl.addEventListener('click', () => finalizar(botao.valor));
            footer.appendChild(btnEl);
        });

        function aoTeclar(e) {
            if (e.key === 'Escape') finalizar(valorAoFechar);
        }
        document.addEventListener('keydown', aoTeclar);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finalizar(valorAoFechar);
        });

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('is-visible'));
    });
}
