import './Footer.css'

const footerLinks = {
  'Serviços': ['Direito Civil', 'Direito Empresarial', 'Direito Trabalhista', 'Direito Tributário', 'Direito de Família', 'Direito Imobiliário'],
  'Escritório': ['Sobre Nós', 'Nossa Equipe', 'Casos de Sucesso', 'Blog Jurídico', 'Contato'],
  'Legal': ['Política de Privacidade', 'Termos de Uso', 'Código de Ética OAB'],
}

export default function Footer() {
  const scrollTo = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-inner">
          {/* Brand */}
          <div className="footer-brand">
            <button className="footer-logo" onClick={() => scrollTo('#hero')}>
              <span className="footer-logo-icon">⚖</span>
              <span className="footer-logo-text">
                <span className="footer-logo-name">Miori & Associados</span>
                <span className="footer-logo-tagline">Advocacia de Excelência</span>
              </span>
            </button>
            <p className="footer-brand-desc">
              Há mais de duas décadas oferecemos soluções jurídicas inovadoras e eficazes, 
              com ética, dedicação e excelência técnica que nossos clientes merecem.
            </p>
            <div className="footer-oab">
              <span className="footer-oab-badge">OAB/SP 183.452 · 215.870 · 312.095</span>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category} className="footer-col">
              <h4 className="footer-col-title">{category}</h4>
              <ul className="footer-col-links">
                {links.map(link => (
                  <li key={link}>
                    <a href="#" className="footer-link">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <p className="footer-copy">
            © 2026 Miori & Associados. Todos os direitos reservados.
          </p>
          <p className="footer-disclaimer">
            Este site tem caráter meramente informativo e não constitui consulta jurídica.
          </p>
        </div>
      </div>
    </footer>
  )
}
