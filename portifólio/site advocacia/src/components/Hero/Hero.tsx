import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import './Hero.css'

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 4,
  duration: Math.random() * 6 + 6,
}))

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y     = useTransform(scrollYProgress, [0, 1], ['0%', '35%'])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  const scrollTo = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="hero" ref={ref} className="hero">
      {/* Background */}
      <div className="hero-bg" />
      <div className="hero-noise" />

      {/* Gradient orbs */}
      <div className="hero-orb hero-orb--1" />
      <div className="hero-orb hero-orb--2" />
      <div className="hero-orb hero-orb--3" />

      {/* Grid lines */}
      <div className="hero-grid" />

      {/* Particles */}
      <div className="hero-particles">
        {PARTICLES.map(p => (
          <motion.div
            key={p.id}
            className="particle"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
            animate={{ y: [0, -30, 0], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Parallax content */}
      <motion.div className="hero-content" style={{ y, opacity }}>
        <div className="hero-inner">
          {/* Badge */}
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="hero-badge-dot" />
            Há mais de 20 anos defendendo seus direitos
          </motion.div>

          {/* Heading */}
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            Excelência Jurídica<br />
            <span className="hero-title-gold">a Seu Serviço</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
            Nosso escritório une décadas de experiência ao comprometimento
            absoluto com cada cliente. Defendemos seus interesses com rigor,
            ética e resultados que falam por si.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="hero-ctas"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <button
              id="hero-cta-primary"
              className="btn btn-primary hero-btn-primary"
              onClick={() => scrollTo('#contato')}
            >
              Agendar Consulta Gratuita
              <span className="hero-btn-arrow">→</span>
            </button>
            <button
              id="hero-cta-secondary"
              className="btn btn-outline"
              onClick={() => scrollTo('#areas')}
            >
              Nossas Especialidades
            </button>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            className="hero-trust"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.1 }}
          >
            <div className="hero-trust-item">
              <span className="hero-trust-icon">✦</span>
              <span>Membro da OAB</span>
            </div>
            <div className="hero-trust-divider" />
            <div className="hero-trust-item">
              <span className="hero-trust-icon">✦</span>
              <span>Sigilo garantido</span>
            </div>
            <div className="hero-trust-divider" />
            <div className="hero-trust-item">
              <span className="hero-trust-icon">✦</span>
              <span>Atendimento 24h</span>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="hero-scroll"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
        >
          <motion.div
            className="hero-scroll-line"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="hero-scroll-text">Rolar</span>
        </motion.div>
      </motion.div>

      {/* Bottom gradient fade */}
      <div className="hero-fade" />
    </section>
  )
}
