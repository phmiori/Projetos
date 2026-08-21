const CATEGORIAS = [
  { id: 'festas', nome: 'Festas & Eventos', emoji: '🎉' },
  { id: 'roupas', nome: 'Roupas & Acessórios', emoji: '👗' },
  { id: 'eletronicos', nome: 'Eletrônicos', emoji: '💻' },
  { id: 'casa', nome: 'Casa & Jardim', emoji: '🏠' },
  { id: 'viagem', nome: 'Viagem', emoji: '🧳' },
  { id: 'esportes', nome: 'Esportes & Lazer', emoji: '⚽' },
  { id: 'bebes', nome: 'Bebês & Crianças', emoji: '🍼' },
  { id: 'ferramentas', nome: 'Ferramentas', emoji: '🔧' }
];

async function getItens(busca = '', categoria = '') {
  let url = '/api/itens?';
  if (busca) url += `q=${encodeURIComponent(busca)}&`;
  if (categoria) url += `categoria=${encodeURIComponent(categoria)}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao buscar itens');
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function navbarHTML() {
  const userStr = localStorage.getItem('bauso_user');
  let authLinks = '';
  
  if (userStr) {
    const user = JSON.parse(userStr);
    authLinks = `
      <a href="/minha-conta.html" class="text-sm font-semibold text-gray-700 hover:text-yellow-600 transition-colors">Olá, ${user.nome.split(' ')[0]}!</a>
      <div class="h-6 w-px bg-gray-200"></div>
      <a href="#" onclick="logout(); return false;" class="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors">Sair</a>
    `;
  } else {
    authLinks = `
      <a href="/login.html" class="text-sm font-semibold text-gray-700 hover:text-yellow-600 transition-colors">Entrar</a>
    `;
  }

  return `
  <nav class="border-b bg-white sticky top-0 z-50 shadow-sm" style="border-color:#EBD182">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-20 items-center">
        <!-- Logo -->
        <a href="/" class="flex-shrink-0 flex items-center gap-2 group">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform" style="background:#FDF5E6;border:1px solid #EBD182">
            ✨
          </div>
          <span class="font-cinzel font-bold text-2xl tracking-wide" style="color:#2C1A08">BAÚSO</span>
        </a>

        <!-- Desktop Menu -->
        <div class="hidden sm:flex items-center space-x-6">
          <a href="/explorar.html" class="text-sm font-semibold text-gray-700 hover:text-yellow-600 transition-colors">Explorar</a>
          <a href="#" class="text-sm font-semibold text-gray-700 hover:text-yellow-600 transition-colors">Como funciona</a>
          <div class="h-6 w-px bg-gray-200"></div>
          ${authLinks}
          <a href="/anunciar.html" class="gold-btn font-bold px-6 py-2.5 rounded-xl text-sm shadow-sm hover:shadow-md ml-2">
            + Anunciar item
          </a>
        </div>
      </div>
    </div>
  </nav>
  `;
}

function logout() {
  localStorage.removeItem('bauso_token');
  localStorage.removeItem('bauso_user');
  window.location.reload();
}

function footerHTML() {
  return `
  <footer class="border-t py-12" style="background:#0D0800;color:rgba(253,245,230,0.7)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
        <div>
          <h4 class="font-cinzel text-lg font-bold mb-4" style="color:#D4AA47">Baúso</h4>
          <p class="text-sm leading-relaxed">Sua plataforma para descobrir e alugar tesouros de quem está perto de você.</p>
        </div>
        <div>
          <h4 class="font-bold mb-4 text-white">Descobrir</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="#" class="hover:text-white transition-colors">Categorias</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Itens Populares</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Cidades</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-bold mb-4 text-white">Ganhar</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="/anunciar.html" class="hover:text-white transition-colors">Anunciar um item</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Como funciona para locadores</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Seguro Proteção</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-bold mb-4 text-white">Suporte</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="#" class="hover:text-white transition-colors">Central de Ajuda</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Termos de Uso</a></li>
            <li><a href="#" class="hover:text-white transition-colors">Privacidade</a></li>
          </ul>
        </div>
      </div>
      <div class="border-t pt-8 flex flex-col md:flex-row justify-between items-center text-xs" style="border-color:rgba(212,170,71,0.2)">
        <p>© 2024 Baúso. Todos os direitos reservados.</p>
        <div class="flex gap-4 mt-4 md:mt-0">
          <span>Feito com 💛 no Brasil</span>
        </div>
      </div>
    </div>
  </footer>
  `;
}

function renderizarCard(item) {
  const cat = CATEGORIAS.find(c => c.id === item.categoria) || CATEGORIAS[0];
  const imageUrl = item.imagemUrl ? (item.imagemUrl.startsWith('http') ? item.imagemUrl : `/${item.imagemUrl}`) : 'https://via.placeholder.com/400x300?text=Sem+Imagem';
  
  return `
    <a href="/item.html?id=${item.id}" class="bg-white rounded-2xl overflow-hidden border hover:shadow-xl transition-all duration-300 group flex flex-col h-full block" style="border-color:#EBD182;text-decoration:none;">
      <div class="aspect-[4/3] w-full bg-gray-100 relative overflow-hidden">
        <img src="${imageUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="${item.titulo}">
        <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm text-gray-400 hover:text-red-500 transition-colors">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm" style="color:#5C3A1E">
          ${cat.emoji} ${cat.nome}
        </div>
      </div>
      <div class="p-4 flex flex-col flex-grow">
        <div class="flex items-center gap-1 mb-2 text-xs font-semibold" style="color:#B8860B">
          <span>★ 5.0</span>
          <span class="text-gray-400 font-normal">(12)</span>
          <span class="text-gray-300 mx-1">•</span>
          <span class="text-gray-500 font-normal truncate">${item.anunciante?.nome || 'Anunciante'}</span>
        </div>
        <h3 class="font-bold text-gray-900 line-clamp-2 mb-1 flex-grow">${item.titulo}</h3>
        <p class="text-xs text-gray-500 line-clamp-2 mb-3">${item.descricao}</p>
        <div class="flex items-end gap-1 mt-auto">
          <span class="text-lg font-black" style="color:#2C1A08">R$ ${item.precoDiario.toFixed(2).replace('.', ',')}</span>
          <span class="text-xs text-gray-500 font-medium mb-1">/dia</span>
        </div>
      </div>
    </a>
  `;
}
