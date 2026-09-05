const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * Identifica o nome de um local a partir de coordenadas (geolocalização do navegador)
 * usando a API pública e gratuita BigDataCloud (sem necessidade de chave de API)
 */
async function buscarNomeLocalPorCoordenadas(lat, lon) {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=pt`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Não foi possível identificar o local');
    }

    const data = await response.json();

    return {
        nome: data.locality || data.city || data.principalSubdivision || 'Local Atual',
        cidade: data.city || data.locality || null,
        estado: data.principalSubdivision || null,
        pais: data.countryName || null
    };
}

/**
 * ROTA: Identificar Local a partir de Coordenadas (Geolocalização do Navegador)
 * GET /api/clima/local-atual?lat=&lon=
 */
router.get('/local-atual', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude e longitude são obrigatórias.' });
        }

        const local = await buscarNomeLocalPorCoordenadas(lat, lon);
        res.json(local);
    } catch (err) {
        console.error('Erro ao identificar local atual:', err);
        res.status(500).json({ error: 'Erro ao identificar o local atual' });
    }
});

/**
 * ROTA: Buscar Localidades (Cidade ou Bairro) por Nome via Open-Meteo Geocoding
 * GET /api/clima/buscar-local?query=
 */
router.get('/buscar-local', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || String(query).trim().length < 2) {
            return res.status(400).json({ error: 'Digite ao menos 2 caracteres para buscar.' });
        }

        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(query).trim())}&count=8&language=pt&format=json`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Serviço de busca indisponível');
        }

        const data = await response.json();
        const resultados = (data.results || []).map(r => ({
            nome: r.name,
            estado: r.admin1 || null,
            pais: r.country || null,
            lat: r.latitude,
            lon: r.longitude
        }));

        res.json(resultados);
    } catch (err) {
        console.error('Erro ao buscar local:', err);
        res.status(500).json({ error: 'Erro ao buscar localidades' });
    }
});

/**
 * ROTA: Previsão do Tempo Atual, Horária e Diária via Open-Meteo (sem necessidade de chave de API)
 * GET /api/clima/previsao?lat=&lon=
 */
router.get('/previsao', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude e longitude são obrigatórias.' });
        }

        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
            hourly: 'temperature_2m,weather_code,precipitation_probability',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
            timezone: 'auto',
            forecast_days: '7'
        });

        const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Serviço de previsão indisponível');
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Erro ao buscar previsão do tempo:', err);
        res.status(500).json({ error: 'Erro ao buscar a previsão do tempo' });
    }
});

/**
 * ROTA: Listar Locais de Clima Salvos do Usuário Logado
 * GET /api/clima/salvos
 */
router.get('/salvos', async (req, res) => {
    try {
        const locais = await prisma.localClimaSalvo.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'asc' }
        });
        res.json(locais);
    } catch (err) {
        console.error('Erro ao listar locais salvos:', err);
        res.status(500).json({ error: 'Erro ao buscar locais salvos' });
    }
});

/**
 * ROTA: Salvar Novo Local de Clima
 * POST /api/clima/salvos
 */
router.post('/salvos', async (req, res) => {
    try {
        const { nome, estado, pais, lat, lon } = req.body;
        if (!nome || lat === undefined || lon === undefined) {
            return res.status(400).json({ error: 'Nome, latitude e longitude são obrigatórios.' });
        }

        const novoLocal = await prisma.localClimaSalvo.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                estado: estado ? String(estado).trim() : null,
                pais: pais ? String(pais).trim() : null,
                lat: Number(lat),
                lon: Number(lon)
            }
        });

        res.status(201).json(novoLocal);
    } catch (err) {
        console.error('Erro ao salvar local:', err);
        res.status(500).json({ error: 'Erro ao salvar local' });
    }
});

/**
 * ROTA: Remover Local de Clima Salvo
 * DELETE /api/clima/salvos/:id
 */
router.delete('/salvos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.localClimaSalvo.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }

        res.json({ success: true, message: 'Local removido com sucesso' });
    } catch (err) {
        console.error('Erro ao remover local salvo:', err);
        res.status(500).json({ error: 'Erro ao remover local salvo' });
    }
});

/**
 * ROTA: Definir/Remover o Local Favorito exibido no widget do cabeçalho
 * PUT /api/clima/salvos/:id/favorito
 */
router.put('/salvos/:id/favorito', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const favorito = !!req.body.favorito;
        const usuarioId = req.session.userId;

        const local = await prisma.localClimaSalvo.findFirst({ where: { id, usuarioId } });
        if (!local) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }

        if (favorito) {
            await prisma.localClimaSalvo.updateMany({
                where: { usuarioId, favoritoHeader: true },
                data: { favoritoHeader: false }
            });
        }

        const atualizado = await prisma.localClimaSalvo.update({
            where: { id },
            data: { favoritoHeader: favorito }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao definir local favorito:', err);
        res.status(500).json({ error: 'Erro ao definir local favorito' });
    }
});

/**
 * ROTA: Clima Atual do Local Favorito (widget compartilhado no cabeçalho de todos os módulos)
 * GET /api/clima/favorito
 */
router.get('/favorito', async (req, res) => {
    try {
        const local = await prisma.localClimaSalvo.findFirst({
            where: { usuarioId: req.session.userId, favoritoHeader: true }
        });

        if (!local) {
            return res.json(null);
        }

        const params = new URLSearchParams({
            latitude: local.lat,
            longitude: local.lon,
            current: 'temperature_2m,weather_code,is_day',
            timezone: 'auto'
        });

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Serviço de previsão indisponível');
        }

        const dados = await response.json();
        res.json({
            nome: local.nome,
            estado: local.estado,
            pais: local.pais,
            current: dados.current
        });
    } catch (err) {
        console.error('Erro ao buscar clima do local favorito:', err);
        res.status(500).json({ error: 'Erro ao buscar clima do local favorito' });
    }
});

module.exports = router;
