import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './Navbar.css'

const links = [
  { label: 'Início',          href: '#hero' },
  { label: 'Sobre',           href: '#sobre' },
  { label: 'Áreas de Atuação', href: '#areas' },
  { label: 'Equipe',          href: '#equipe' },
  { label: 'Blog',            href: '#blog' },
  { label: 'Contato',         href: '#contato' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen]         = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setOpen(false)
  }

  return (
    <>
      <motion.nav
        className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="navbar-inner">
          {/* Logo */}
          <button className="navbar-logo" onClick={() => scrollTo('#hero')}>
            <span className="navbar-logo-icon">⚖</span>
            <span className="navbar-logo-text">
              <span className="navbar-logo-name">Miori</span>
              <span className="navbar-logo-sub">& Associados</span>
            </span>
          </button>

          {/* Desktop Links */}
          <ul className="navbar-links">
            {links.map(link => (
              <li key={link.href}>
                <button onClick={() => scrollTo(link.href)} className="navbar-link">
                  {link.label}
                </button>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            className="btn btn-primary navbar-cta"
            onClick={() => scrollTo('#contato')}
          >
            Consulta Gratuita
          </button>

          {/* Hamburger */}
          <button
            id="navbar-hamburger"
            className={`hamburger ${open ? 'hamburger--open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="mobile-menu"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            <ul>
              {links.map(link => (
                <li key={link.href}>
                  <button onClick={() => scrollTo(link.href)} className="mobile-link">
                    {link.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  className="btn btn-primary mobile-cta"
                  onClick={() => scrollTo('#contato')}
                >
                  Consulta Gratuita
                </button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
