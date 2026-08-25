import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import './Testimonials.css'

const testimonials = [
  {
    name: 'Roberto Carvalho',
    role: 'CEO, Carvalho Construtora',
    text: 'O escritório Miori & Associados foi fundamental na reestruturação jurídica da nossa empresa. A equipe demonstrou um conhecimento técnico impressionante e nos guiou com segurança durante todo o processo de recuperação judicial. Resultado além do esperado.',
    rating: 5,
    initial: 'R',
  },
  {
    name: 'Fernanda Torres',
    role: 'Empresária',
    text: 'A Dra. Ana Beatriz conduziu meu processo de divórcio com uma sensibilidade e profissionalismo raros. Em um momento tão difícil, ter uma advogada tão competente ao meu lado fez toda a diferença. Recomendo sem hesitar.',
    rating: 5,
    initial: 'F',
  },
  {
    name: 'Marcelo Andrade',
    role: 'Diretor de RH, TechBrasil',
    text: 'Trabalhamos com o Dr. Rafael em toda a área trabalhista da empresa. A assessoria preventiva que ele nos ofereceu reduziu drasticamente nossos litígios. Uma visão estratégica que vai muito além do simples cumprimento da lei.',
    rating: 5,
    initial: 'M',
  },
  {
    name: 'Juliana Meireles',
    role: 'Médica',
    text: 'Após uma disputa judicial longa, o escritório conseguiu reverter uma situação que parecia perdida. A dedicação e o rigor técnico da equipe foram determinantes. São advogados que realmente lutam pelos seus clientes.',
    rating: 5,
    initial: 'J',
  },
]

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [current, setCurrent] = useState(0)

  const prev = () => setCurrent(c => (c - 1 + testimonials.length) % testimonials.length)
  const next = () => setCurrent(c => (c + 1) % testimonials.length)

  return (
    <section className="section testimonials-section">
      <div className="testimonials-bg" />
      <div ref={ref} className="section-inner">
        <motion.div
          className="testimonials-header"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">Depoimentos</span>
          <h2 className="section-title">
            O que dizem nossos clientes
          </h2>
        </motion.div>

        <motion.div
          className="testimonials-wrapper"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          {/* Main card */}
          <div className="testimonials-carousel">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                className="testimonial-card"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              >
                <div className="testimonial-stars">
                  {'★'.repeat(testimonials[current].rating)}
                </div>
                <blockquote className="testimonial-text">
                  "{testimonials[current].text}"
                </blockquote>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">
                    {testimonials[current].initial}
                  </div>
                  <div>
                    <p className="testimonial-name">{testimonials[current].name}</p>
                    <p className="testimonial-role">{testimonials[current].role}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Controls */}
            <div className="testimonials-controls">
              <button id="testimonial-prev" className="testimonial-btn" onClick={prev} aria-label="Anterior">‹</button>
              <div className="testimonials-dots">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    className={`testimonial-dot ${i === current ? 'testimonial-dot--active' : ''}`}
                    onClick={() => setCurrent(i)}
                    aria-label={`Depoimento ${i + 1}`}
                  />
                ))}
              </div>
              <button id="testimonial-next" className="testimonial-btn" onClick={next} aria-label="Próximo">›</button>
            </div>
          </div>

          {/* Side cards (desktop) */}
          <div className="testimonials-side">
            {testimonials.filter((_, i) => i !== current).slice(0, 2).map(t => (
              <div key={t.name} className="testimonial-side-card">
                <div className="testimonial-side-stars">{'★'.repeat(t.rating)}</div>
                <p className="testimonial-side-text">"{t.text.slice(0, 100)}..."</p>
                <p className="testimonial-side-name">{t.name}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
