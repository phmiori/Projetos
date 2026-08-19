/* =============================================
   FLIXORA — main.js (Landing Page)
   ============================================= */

// ---- FAQ Accordion ----
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
  const btn = item.querySelector('.faq-question');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');

    // Close all
    faqItems.forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });

    // Open clicked (toggle)
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// ---- Hero form ----
function handleSignup(e) {
  e.preventDefault();
  const email = e.target.querySelector('input[type="email"]').value.trim();
  if (!email) return;
  // Redirect to login with email prefilled
  sessionStorage.setItem('flixora_email', email);
  window.location.href = 'login.html';
}

// ---- Navbar scroll effect ----
const navbar = document.querySelector('.navbar');
let lastScrollY = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 60) {
    navbar.style.background = 'rgba(0,0,0,0.95)';
    navbar.style.position = 'fixed';
    navbar.style.transition = 'background 0.4s ease';
  } else {
    navbar.style.background = '';
    navbar.style.position = 'absolute';
  }
  lastScrollY = scrollY;
}, { passive: true });

// ---- Hero parallax ----
const heroBg = document.querySelector('.hero-bg');
window.addEventListener('scroll', () => {
  if (heroBg) {
    heroBg.style.transform = `scale(1.02) translateY(${window.scrollY * 0.3}px)`;
  }
}, { passive: true });

// ---- Intersection Observer for sections ----
const sections = document.querySelectorAll('.feature, .faq-section');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

sections.forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(32px)';
  section.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  sectionObserver.observe(section);
});
