import { useCallback, useEffect, useState } from 'react';

/**
 * src/hooks/useLista.js
 * Estado comum de "buscar uma lista da API" (loading/erro/pull-to-refresh), separado da UI
 * pra poder ser usado tanto pelas telas simples de visualização quanto pelas telas com CRUD.
 */
export function useLista(buscar) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const resultado = await buscar();
      setDados(Array.isArray(resultado) ? resultado : []);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [buscar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function aoAtualizar() {
    setAtualizando(true);
    carregar();
  }

  return { dados, carregando, atualizando, erro, carregar, aoAtualizar };
}
