import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import './Team.css'

const team = [
  {
    name: 'Dr. Carlos Miori',
    role: 'Sócio Fundador',
    oab: 'OAB/SP 183.452',
    specialties: ['Direito Empresarial', 'Recuperação Judicial'],
    bio: 'Mestre em Direito Empresarial pela USP. Mais de 20 anos de experiência em reestruturação corporativa e M&A.',
    photo: '/lawyer-1.png',
    linkedin: '#',
  },
  {
    name: 'Dra. Ana Beatriz Miori',
    role: 'Sócia e Diretora Jurídica',
    oab: 'OAB/SP 215.870',
    specialties: ['Direito Civil', 'Direito de Família'],
    bio: 'Especialista em direito de família e sucessões. Referência nacional em mediação e resolução de conflitos.',
    photo: '/lawyer-2.png',
    linkedin: '#',
  },
  {
    name: 'Dr. Rafael Santana',
    role: 'Advogado Sênior',
    oab: 'OAB/SP 312.095',
    specialties: ['Direito Trabalhista', 'Direito Tributário'],
    bio: 'Especialista em compliance trabalhista e tributário. Atuou em grandes corporações antes de integrar a equipe.',
    photo: '/lawyer-3.png',
    linkedin: '#',
  },
]

export default function Team() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="equipe" className="section team-section">
      <div ref={ref} className="section-inner">
        <motion.div
          className="team-header"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">Nossa Equipe</span>
          <h2 className="section-title">
            Advogados que fazem<br />a diferença
          </h2>
          <p className="section-subtitle">
            Profissionais altamente qualificados, com formação nas melhores instituições 
            do Brasil e experiência prática comprovada.
          </p>
        </motion.div>

        <div className="team-grid">
          {team.map((member, i) => (
            <motion.div
              key={member.name}
              className="team-card"
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Photo */}
              <div className="team-photo-wrapper">
                <img src={member.photo} alt={member.name} className="team-photo" />
                <div className="team-photo-overlay" />
                <div className="team-oab">{member.oab}</div>
              </div>

              {/* Info */}
              <div className="team-info">
                <div className="team-role">{member.role}</div>
                <h3 className="team-name">{member.name}</h3>
                <p className="team-bio">{member.bio}</p>

                <div className="team-specialties">
                  {member.specialties.map(s => (
                    <span key={s} className="team-tag">{s}</span>
                  ))}
                </div>

                <a href={member.linkedin} className="team-linkedin" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
