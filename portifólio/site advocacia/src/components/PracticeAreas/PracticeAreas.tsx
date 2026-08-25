import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import './PracticeAreas.css'

const areas = [
  {
    icon: '⚖',
    title: 'Direito Civil',
    summary: 'Contratos, responsabilidade civil, disputas patrimoniais e defesa de direitos individuais.',
    items: ['Contratos e Obrigações', 'Responsabilidade Civil', 'Direito do Consumidor', 'Ações Indenizatórias'],
  },
  {
    icon: '🏛',
    title: 'Direito Empresarial',
    summary: 'Assessoria jurídica completa para empresas de todos os portes, da constituição à dissolução.',
    items: ['Constituição de Empresas', 'Contratos Empresariais', 'Fusões e Aquisições', 'Recuperação Judicial'],
  },
  {
    icon: '◈',
    title: 'Direito Trabalhista',
    summary: 'Defesa de empregados e empregadores em todas as fases das relações de trabalho.',
    items: ['Reclamações Trabalhistas', 'Acordos Coletivos', 'Assédio Moral e Sexual', 'Demissões e Indenizações'],
  },
  {
    icon: '◉',
    title: 'Direito Tributário',
    summary: 'Planejamento fiscal e defesa em processos administrativos e judiciais tributários.',
    items: ['Planejamento Tributário', 'Defesa em Autuações', 'Recuperação de Tributos', 'Consultoria Fiscal'],
  },
  {
    icon: '⬡',
    title: 'Direito de Família',
    summary: 'Suporte jurídico em divórcios, guarda, pensão alimentícia e inventários.',
    items: ['Divórcio e Separação', 'Guarda de Filhos', 'Pensão Alimentícia', 'Inventários e Partilhas'],
  },
  {
    icon: '◆',
    title: 'Direito Imobiliário',
    summary: 'Assessoria em transações imobiliárias, locações, incorporações e litígios de propriedade.',
    items: ['Compra e Venda', 'Contratos de Locação', 'Regularização de Imóveis', 'Incorporação Imobiliária'],
  },
]

export default function PracticeAreas() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [active, setActive] = useState<number | null>(null)

  return (
    <section id="areas" className="section areas-section">
      <div className="areas-bg-pattern" />
      <div ref={ref} className="section-inner">
        <motion.div
          className="areas-header"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">Áreas de Atuação</span>
          <h2 className="section-title">
            Soluções jurídicas para<br />cada desafio da sua vida
          </h2>
          <p className="section-subtitle">
            Nossa equipe multidisciplinar está preparada para atender demandas 
            nas principais áreas do Direito, sempre com foco em resultados.
          </p>
        </motion.div>

        <div className="areas-grid">
          {areas.map((area, i) => (
            <motion.div
              key={area.title}
              className={`area-card ${active === i ? 'area-card--active' : ''}`}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
              onClick={() => setActive(active === i ? null : i)}
            >
              <div className="area-card-top">
                <div className="area-icon">{area.icon}</div>
                <div className="area-arrow">›</div>
              </div>
              <h3 className="area-title">{area.title}</h3>
              <p className="area-summary">{area.summary}</p>

              <AnimatePresence>
                {active === i && (
                  <motion.ul
                    className="area-items"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {area.items.map(item => (
                      <li key={item} className="area-item">
                        <span className="area-item-dot">✦</span>
                        {item}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>

              <div className="area-card-glow" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
