/**
 * Busca a cotação atual (em Reais) de uma ou mais criptomoedas na CoinGecko (fonte pública, sem chave de API)
 */
async function buscarCotacaoCripto(moedaIds) {
    const ids = [...new Set(moedaIds)].join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=brl`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
        throw new Error('Cotação indisponível no momento');
    }

    return await response.json();
}

module.exports = { buscarCotacaoCripto };
