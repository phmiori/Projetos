/**
 * JS/Clima/clima-codigos.js
 * Tabela de códigos de clima (Open-Meteo) e função de ícone, compartilhadas entre
 * o módulo Clima e o widget de clima favorito exibido no cabeçalho de todos os módulos.
 */

const CODIGO_CLIMA = {
    0: { icone: '☀️', iconeNoite: '🌙', texto: 'Céu limpo' },
    1: { icone: '🌤️', iconeNoite: '🌤️', texto: 'Poucas nuvens' },
    2: { icone: '⛅', iconeNoite: '☁️', texto: 'Parcialmente nublado' },
    3: { icone: '☁️', texto: 'Nublado' },
    45: { icone: '🌫️', texto: 'Neblina' },
    48: { icone: '🌫️', texto: 'Neblina com geada' },
    51: { icone: '🌦️', texto: 'Garoa leve' },
    53: { icone: '🌦️', texto: 'Garoa moderada' },
    55: { icone: '🌧️', texto: 'Garoa densa' },
    56: { icone: '🌧️', texto: 'Garoa congelante' },
    57: { icone: '🌧️', texto: 'Garoa congelante densa' },
    61: { icone: '🌧️', texto: 'Chuva leve' },
    63: { icone: '🌧️', texto: 'Chuva moderada' },
    65: { icone: '🌧️', texto: 'Chuva forte' },
    66: { icone: '🌧️', texto: 'Chuva congelante' },
    67: { icone: '🌧️', texto: 'Chuva congelante forte' },
    71: { icone: '🌨️', texto: 'Neve leve' },
    73: { icone: '🌨️', texto: 'Neve moderada' },
    75: { icone: '❄️', texto: 'Neve forte' },
    77: { icone: '❄️', texto: 'Grãos de neve' },
    80: { icone: '🌦️', texto: 'Pancadas de chuva leves' },
    81: { icone: '🌧️', texto: 'Pancadas de chuva moderadas' },
    82: { icone: '⛈️', texto: 'Pancadas de chuva fortes' },
    85: { icone: '🌨️', texto: 'Pancadas de neve leves' },
    86: { icone: '🌨️', texto: 'Pancadas de neve fortes' },
    95: { icone: '⛈️', texto: 'Trovoada' },
    96: { icone: '⛈️', texto: 'Trovoada com granizo leve' },
    99: { icone: '⛈️', texto: 'Trovoada com granizo forte' }
};

function obterInfoClima(codigo, isDay) {
    const info = CODIGO_CLIMA[codigo] || { icone: '🌡️', texto: 'Condição desconhecida' };
    const icone = (isDay === 0 && info.iconeNoite) ? info.iconeNoite : info.icone;
    return { icone, texto: info.texto };
}
