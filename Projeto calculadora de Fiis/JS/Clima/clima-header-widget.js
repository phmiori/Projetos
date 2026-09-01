/**
 * JS/Clima/clima-header-widget.js
 * Widget de clima do local favorito (ícone + temperatura), exibido no cabeçalho
 * de todos os módulos. Depende da tabela de códigos em JS/Clima/clima-codigos.js.
 */

document.addEventListener('DOMContentLoaded', carregarClimaHeaderWidget);

async function carregarClimaHeaderWidget() {
    const widget = document.getElementById('climaHeaderWidget');
    if (!widget) return;

    try {
        const resp = await fetch('/api/clima/favorito');
        if (!resp.ok) return;

        const dados = await resp.json();
        if (!dados || !dados.current) {
            widget.style.display = 'none';
            return;
        }

        const info = obterInfoClima(dados.current.weather_code, dados.current.is_day);
        document.getElementById('climaHeaderWidgetIcon').textContent = info.icone;
        document.getElementById('climaHeaderWidgetTemp').textContent = `${Math.round(dados.current.temperature_2m)}°`;
        widget.title = [dados.nome, dados.estado].filter(Boolean).join(', ');
        widget.style.display = 'inline-flex';
    } catch (err) {
        console.warn('[ClimaHeaderWidget] Erro ao carregar clima favorito.', err.message);
    }
}
