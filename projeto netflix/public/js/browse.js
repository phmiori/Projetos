/* =============================================
   FLIXORA — browse.js (Browse Page)
   ============================================= */

// ---- Navbar scroll effect ----
const navbar = document.getElementById('browse-navbar');
let ticking = false;

window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

// ---- Carousel scroll ----
function scrollRow(trackId, direction) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const scrollAmount = track.clientWidth * 0.75;
  track.scrollBy({
    left: direction === 'right' ? scrollAmount : -scrollAmount,
    behavior: 'smooth'
  });
}

// ---- Drag to scroll ----
document.querySelectorAll('.cards-track').forEach(track => {
  let isDown = false;
  let startX;
  let scrollLeft;

  track.addEventListener('mousedown', e => {
    isDown = true;
    track.classList.add('grabbing');
    startX = e.pageX - track.offsetLeft;
    scrollLeft = track.scrollLeft;
  });

  track.addEventListener('mouseleave', () => {
    isDown = false;
    track.classList.remove('grabbing');
  });

  track.addEventListener('mouseup', () => {
    isDown = false;
    track.classList.remove('grabbing');
  });

  track.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - track.offsetLeft;
    const walk = (x - startX) * 2;
    track.scrollLeft = scrollLeft - walk;
  });
});

// ---- Modal data ----
const modalData = {
  aurora: {
    title: 'Projeto Aurora',
    bg: 'assets/browse-hero.jpg',
    desc: 'Em um futuro próximo, uma cientista descobre que o sol está se apagando. Com poucos anos até o colapso solar, uma missão internacional precisa reimaginar o futuro da humanidade — ou enfrentar o fim.',
    meta: '<span class="card-match">98% relevante</span><span>2024</span><span class="card-rated">16+</span><span>2 Temporadas</span>',
    extra: '<p><strong>Elenco:</strong> Sofia Mendes, Rodrigo Maia, Ana Luz</p><p><strong>Gêneros:</strong> Ficção Científica, Drama, Mistério</p><p><strong>Este programa é:</strong> Intenso, Emocionante, Perturbador</p>'
  },
  noir: {
    title: 'Sombra da Cidade',
    bg: 'assets/posters/poster1.jpg',
    desc: 'Um detetive particular corrupto investiga a morte misteriosa de um empresário poderoso, mas logo percebe que as pistas levam a lugares onde ele não deveria estar olhando.',
    meta: '<span class="card-match">95% relevante</span><span>2023</span><span class="card-rated">18+</span><span>3 Temporadas</span>',
    extra: '<p><strong>Elenco:</strong> Marco Andrade, Lara Costa, Felipe Torres</p><p><strong>Gêneros:</strong> Crime, Thriller, Noir</p><p><strong>Este programa é:</strong> Sombrio, Tenso, Provocativo</p>'
  },
  space: {
    title: 'Cosmos Infinito',
    bg: 'assets/posters/poster2.jpg',
    desc: 'Uma tripulação multinacional parte na missão mais ambiciosa da história humana: estabelecer o primeiro contato com uma civilização alienígena localizada a 12 anos-luz da Terra.',
    meta: '<span class="card-match">92% relevante</span><span>2024</span><span class="card-rated">12+</span><span>1 Temporada</span>',
    extra: '<p><strong>Elenco:</strong> Luna Park, Chen Wei, Amara Diallo</p><p><strong>Gêneros:</strong> Ficção Científica, Aventura</p><p><strong>Este programa é:</strong> Inspirador, Épico, Imaginativo</p>'
  },
  fantasy: {
    title: 'A Última Guardiã',
    bg: 'assets/posters/poster3.jpg',
    desc: 'Quando os reinos antigos começam a cair sob o domínio de uma força sombria, cabe a uma jovem guerreira dominar os poderes esquecidos de seus ancestrais para salvar o que resta do mundo.',
    meta: '<span class="card-match">89% relevante</span><span>2024</span><span class="card-rated">14+</span><span>2 Temporadas</span>',
    extra: '<p><strong>Elenco:</strong> Isabela Ramos, Paulo Estrela, Jade Nova</p><p><strong>Gêneros:</strong> Fantasia, Ação, Aventura</p><p><strong>Este programa é:</strong> Épico, Emotivo, Grandioso</p>'
  },
  romance: {
    title: 'Paris Sempre',
    bg: 'assets/posters/poster4.jpg',
    desc: 'Dois estranhos se encontram por acidente em Paris durante uma tempestade de neve. O que começa como uma noite inesperada se transforma em uma história de amor que atravessa décadas.',
    meta: '<span class="card-match">85% relevante</span><span>2023</span><span class="card-rated">12+</span><span>Filme</span>',
    extra: '<p><strong>Elenco:</strong> Camille Dubois, Rafael Santos</p><p><strong>Gêneros:</strong> Romance, Drama</p><p><strong>Este filme é:</strong> Tocante, Nostálgico, Belo</p>'
  },
  crime: {
    title: 'Sangue Frio',
    bg: null,
    desc: 'Uma investigadora forense com memória eidética é recrutada pela Interpol para resolver uma série de assassinatos que parecem ser obra de um único gênio do crime operando globalmente.',
    meta: '<span class="card-match">91% relevante</span><span>2024</span><span class="card-rated">18+</span><span>1 Temporada</span>',
    extra: '<p><strong>Elenco:</strong> Valentina Cruz, Marcos Leal, Sara Kim</p><p><strong>Gêneros:</strong> Crime, Thriller</p><p><strong>Este programa é:</strong> Tenso, Perturbador, Viciante</p>'
  },
  comedy: {
    title: 'Caos em Família',
    bg: null,
    desc: 'Quando uma família disfuncional é forçada a viver sob o mesmo teto por seis meses para receber a herança do avô excêntrico, o caos é inevitável — e também muito hilário.',
    meta: '<span class="card-match">88% relevante</span><span>2024</span><span class="card-rated">12+</span><span>2 Temporadas</span>',
    extra: '<p><strong>Elenco:</strong> Fernanda Luz, Carlos Brito, Beatriz Sol</p><p><strong>Gêneros:</strong> Comédia, Drama Familiar</p><p><strong>Este programa é:</strong> Divertido, Caloroso, Emotivo</p>'
  },
  doc: {
    title: 'Nosso Planeta',
    bg: null,
    desc: 'Uma jornada visual deslumbrante pelos ecossistemas mais frágeis e extraordinários da Terra, mostrando a beleza que ainda existe — e o que está em jogo se não agirmos.',
    meta: '<span class="card-match">97% relevante</span><span>2023</span><span class="card-rated">L</span><span>3 Temporadas</span>',
    extra: '<p><strong>Narrador:</strong> Carlos Silva</p><p><strong>Gêneros:</strong> Documentário, Natureza</p><p><strong>Este programa é:</strong> Inspirador, Educativo, Visualmente Deslumbrante</p>'
  }
};

// ---- Open Modal ----
function openModal(key) {
  const data = modalData[key];
  if (!data) return;

  const overlay = document.getElementById('modal-overlay');
  const heroBg = document.getElementById('modal-hero-bg');
  const title = document.getElementById('modal-title');
  const desc = document.getElementById('modal-desc');
  const meta = document.getElementById('modal-meta');
  const extra = document.getElementById('modal-extra');

  title.textContent = data.title;
  desc.textContent = data.desc;
  meta.innerHTML = data.meta;
  extra.innerHTML = data.extra;

  if (data.bg) {
    heroBg.style.backgroundImage = `url('${data.bg}')`;
    heroBg.style.backgroundColor = '';
  } else {
    heroBg.style.backgroundImage = '';
    heroBg.style.background = 'linear-gradient(135deg, #1a0a2e, #141414)';
  }

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// ---- Close Modal ----
function closeModal(e, force = false) {
  if (force || (e && e.target === document.getElementById('modal-overlay'))) {
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal(null, true);
});

// ---- Search functionality ----
const searchContainer = document.getElementById('search-container');
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');

if (searchBtn && searchContainer && searchInput) {
  searchBtn.addEventListener('click', () => {
    searchContainer.classList.toggle('active');
    if (searchContainer.classList.contains('active')) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener('blur', () => {
    if (searchInput.value.trim() === '') {
      searchContainer.classList.remove('active');
    }
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      if (q) {
        alert(`Buscando por: "${q}"\n\n(Recurso demonstrativo — portfólio)`);
      }
    }
  });
}
