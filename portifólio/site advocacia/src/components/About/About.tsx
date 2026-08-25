import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import './About.css'

const values = [
  {
    icon: '⚖',
    title: 'Ética e Integridade',
    desc: 'Agimos com total transparência e honestidade em cada etapa do processo, preservando a confiança de nossos clientes.',
  },
  {
    icon: '◈',
    title: 'Excelência Técnica',
    desc: 'Nossa equipe se mantém atualizada com as mais recentes mudanças legislativas e jurisprudenciais do país.',
  },
  {
    icon: '◉',
    title: 'Comprometimento',
    desc: 'Cada caso é tratado com atenção individual e máxima dedicação, do primeiro contato à resolução final.',
  },
]

export default function About() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section id="sobre" className="section about-section">
      <div className="about-decoration" />
      <div ref={ref} className="section-inner about-inner">
        {/* Left — text */}
        <div className="about-text">
          <motion.span
            className="section-label"
            initial={{ opacity: 0, x: -20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Sobre o Escritório
          </motion.span>

          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Tradição jurídica aliada à<br />
            <em className="about-title-em">visão contemporânea</em>
          </motion.h2>

          <motion.p
            className="section-subtitle about-desc"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            Fundado em 2004, o escritório Miori & Associados construiu ao longo de duas décadas 
            uma reputação sólida baseada em resultados concretos e relações de longa duração com 
            nossos clientes. Presentes em São Paulo e com atuação nacional, somos referência em 
            advocacia empresarial, cível e trabalhista.
          </motion.p>

          <motion.p
            className="about-desc-2"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            Nossa filosofia é simples: cada cliente merece atenção personalizada, estratégias 
            sob medida e comunicação clara durante todo o processo. Não tratamos casos — 
            tratamos de pessoas.
          </motion.p>

          <motion.div
            className="about-signature"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <div className="about-sig-line" />
            <div className="about-sig-text">
              <p className="about-sig-name">Dr. Carlos Miori</p>
              <p className="about-sig-role">Sócio Fundador — OAB/SP 183.452</p>
            </div>
          </motion.div>
        </div>

        {/* Right — values */}
        <div className="about-values">
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              className="about-value-card"
              initial={{ opacity: 0, x: 40 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="about-value-icon">{v.icon}</div>
              <div>
                <h3 className="about-value-title">{v.title}</h3>
                <p className="about-value-desc">{v.desc}</p>
              </div>
            </motion.div>
          ))}

          {/* Image box */}
          <motion.div
            className="about-image-box"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <div className="about-image-content">
              <span className="about-image-quote">"</span>
              <p className="about-image-text">
                A justiça não é somente um ideal — é uma conquista diária para quem sabe como buscá-la.
              </p>
              <div className="about-image-bar" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
