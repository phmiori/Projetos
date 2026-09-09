/**
 * JS/Assistente/assistente.js
 * Botão do Assistente de IA no cabeçalho + janela flutuante e arrastável do chat (compartilhada
 * por todos os módulos), com histórico persistido, sugestões de investimento com base nos dados
 * reais do usuário e envio de e-mails a pedido (tudo processado no backend).
 */

const API_BASE_ASSISTENTE = '/api/assistente';

let enviandoMensagem = false;
let historicoCarregado = false;

document.addEventListener('DOMContentLoaded', () => {
    const btnAbrir = document.getElementById('btnAssistenteIA');
    const painel = document.getElementById('assistenteFloatPanel');
    const cabecalho = document.getElementById('assistenteFloatHeader');
    const btnFechar = document.getElementById('btnAssistenteFechar');
    const btnLimpar = document.getElementById('btnAssistenteLimpar');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');

    if (!btnAbrir || !painel) return;

    btnAbrir.addEventListener('click', () => {
        const vaiAbrir = !painel.classList.contains('is-open');
        painel.classList.toggle('is-open');
        if (vaiAbrir && !historicoCarregado) {
            historicoCarregado = true;
            carregarHistorico();
        }
    });

    btnFechar.addEventListener('click', () => painel.classList.remove('is-open'));
    btnLimpar.addEventListener('click', limparConversa);

    ativarArrastar(painel, cabecalho);

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        enviarMensagem();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensagem();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    });
});

/**
 * Arrastar a janela flutuante pela alça do cabeçalho, com Pointer Events (funciona com mouse e
 * toque). Ao começar a arrastar, troca o posicionamento de bottom/right (padrão inicial) para
 * top/left em pixels, e mantém a janela sempre dentro dos limites visíveis da tela.
 */
function ativarArrastar(painel, alca) {
    let arrastando = false;
    let offsetX = 0, offsetY = 0;

    alca.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.assistente-float-icon-btn')) return;
        arrastando = true;
        const rect = painel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        painel.style.left = rect.left + 'px';
        painel.style.top = rect.top + 'px';
        painel.style.right = 'auto';
        painel.style.bottom = 'auto';
        alca.setPointerCapture(e.pointerId);
    });

    alca.addEventListener('pointermove', (e) => {
        if (!arrastando) return;
        const largura = painel.offsetWidth;
        const altura = painel.offsetHeight;
        const novoX = Math.max(4, Math.min(e.clientX - offsetX, window.innerWidth - largura - 4));
        const novoY = Math.max(4, Math.min(e.clientY - offsetY, window.innerHeight - altura - 4));
        painel.style.left = novoX + 'px';
        painel.style.top = novoY + 'px';
    });

    alca.addEventListener('pointerup', () => { arrastando = false; });
    alca.addEventListener('pointercancel', () => { arrastando = false; });
}

async function carregarHistorico() {
    try {
        const resp = await fetch(`${API_BASE_ASSISTENTE}/historico`);
        if (!resp.ok) return;
        const mensagens = await resp.json();
        if (!Array.isArray(mensagens) || mensagens.length === 0) return;

        esconderEstadoVazio();
        mensagens.forEach(m => renderizarMensagem(m.papel === 'assistente' ? 'assistente' : 'usuario', m.conteudo));
        rolarParaFinal();
    } catch (err) {
        console.error('Erro ao carregar histórico do assistente:', err);
    }
}

async function enviarMensagem() {
    if (enviandoMensagem) return;

    const chatInput = document.getElementById('chatInput');
    const texto = chatInput.value.trim();
    if (!texto) return;

    esconderEstadoVazio();
    renderizarMensagem('usuario', texto);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    rolarParaFinal();

    definirEnviando(true);
    const loadingEl = renderizarCarregando();

    try {
        const resp = await fetch(`${API_BASE_ASSISTENTE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensagem: texto })
        });

        loadingEl.remove();

        if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            renderizarMensagem('erro', erro.error || 'Não foi possível falar com o assistente agora.');
        } else {
            const dados = await resp.json();
            renderizarMensagem('assistente', dados.resposta, dados.emailEnviado, dados.fiiAdicionado);

            // Avisa a página do módulo FII (se estiver aberta) para recarregar a tabela sozinha
            if (dados.fiiAdicionado) {
                window.dispatchEvent(new CustomEvent('financehub:fii-atualizado', { detail: dados.fiiAdicionado }));
            }
        }
    } catch (err) {
        loadingEl.remove();
        renderizarMensagem('erro', 'Falha de conexão ao falar com o assistente. Tente novamente.');
        console.error('Erro no chat do assistente:', err);
    } finally {
        definirEnviando(false);
        rolarParaFinal();
    }
}

async function limparConversa() {
    if (!(await confirmarAcao('Tem certeza que deseja apagar toda a conversa com o assistente?', { perigo: true }))) return;

    try {
        await fetch(`${API_BASE_ASSISTENTE}/historico`, { method: 'DELETE' });
    } catch (err) {
        console.error('Erro ao limpar conversa:', err);
    }

    const chatMensagens = document.getElementById('chatMensagens');
    chatMensagens.innerHTML = `
        <div class="chat-empty-state" id="chatEmptyState">
            <p><strong>Pergunte algo para começar:</strong></p>
            <ul>
                <li>"Como está minha carteira de FIIs hoje?"</li>
                <li>"Onde eu poderia investir meu próximo aporte?"</li>
                <li>"Manda um resumo do meu patrimônio pro meu e-mail"</li>
            </ul>
        </div>
    `;
}

function renderizarMensagem(tipo, texto, emailEnviado, fiiAdicionado) {
    const chatMensagens = document.getElementById('chatMensagens');
    const div = document.createElement('div');

    if (tipo === 'usuario') {
        div.className = 'chat-msg chat-msg-usuario';
        div.textContent = texto;
    } else if (tipo === 'erro') {
        div.className = 'chat-msg chat-msg-assistente chat-msg-erro';
        div.textContent = texto;
    } else {
        div.className = 'chat-msg chat-msg-assistente';
        div.textContent = texto;

        if (emailEnviado) {
            const tag = document.createElement('span');
            tag.className = 'chat-msg-email-tag';
            tag.textContent = `✓ E-mail enviado para ${emailEnviado.destinatario}`;
            div.appendChild(document.createElement('br'));
            div.appendChild(tag);
        }

        if (fiiAdicionado) {
            const tag = document.createElement('span');
            tag.className = 'chat-msg-email-tag';
            const acao = fiiAdicionado.tipo === 'aporte' ? 'atualizado' : 'adicionado';
            tag.textContent = `✓ ${fiiAdicionado.ticker} ${acao}: ${fiiAdicionado.cotas} cotas, preço médio R$ ${fiiAdicionado.precoMedio.toFixed(2)}`;
            div.appendChild(document.createElement('br'));
            div.appendChild(tag);
        }
    }

    chatMensagens.appendChild(div);
}

function renderizarCarregando() {
    const chatMensagens = document.getElementById('chatMensagens');
    const div = document.createElement('div');
    div.className = 'chat-msg-loading';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatMensagens.appendChild(div);
    rolarParaFinal();
    return div;
}

function esconderEstadoVazio() {
    const estadoVazio = document.getElementById('chatEmptyState');
    if (estadoVazio) estadoVazio.remove();
}

function rolarParaFinal() {
    const chatMensagens = document.getElementById('chatMensagens');
    chatMensagens.scrollTop = chatMensagens.scrollHeight;
}

function definirEnviando(valor) {
    enviandoMensagem = valor;
    const btn = document.getElementById('btnEnviarChat');
    const input = document.getElementById('chatInput');
    if (btn) btn.disabled = valor;
    if (input) input.disabled = valor;
}
