import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import './Stats.css'

const stats = [
  { value: '20+',  label: 'Anos de Experiência',  desc: 'Décadas defendendo clientes' },
  { value: '98%',  label: 'Taxa de Êxito',         desc: 'Casos encerrados com sucesso' },
  { value: '1.2k', label: 'Clientes Atendidos',    desc: 'Confiança construída caso a caso' },
  { value: '15',   label: 'Advogados Especializados', desc: 'Equipe multidisciplinar' },
]

function StatCard({ value, label, desc, index }: typeof stats[0] & { index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      className="stat-card"
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-desc">{desc}</div>
    </motion.div>
  )
}

export default function Stats() {
  return (
    <section className="stats-section">
      <div className="stats-inner">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} index={i} />
        ))}
      </div>
    </section>
  )
}
