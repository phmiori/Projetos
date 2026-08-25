import { useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import './Contact.css'

const contactInfo = [
  { icon: '📍', label: 'Endereço', value: 'Av. Paulista, 1765 — 10º andar\nSão Paulo, SP — 01310-917' },
  { icon: '📞', label: 'Telefone', value: '(11) 3456-7890\n(11) 99876-5432' },
  { icon: '✉', label: 'E-mail', value: 'contato@mioriassociados.com.br\natendimento@mioriassociados.com.br' },
  { icon: '⏰', label: 'Horário', value: 'Segunda a Sexta: 8h às 19h\nSábados: 9h às 13h' },
]

type FormState = { name: string; email: string; phone: string; subject: string; message: string }
type Status = 'idle' | 'sending' | 'sent'

export default function Contact() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [form, setForm] = useState<FormState>({ name: '', email: '', phone: '', subject: '', message: '' })
  const [status, setStatus] = useState<Status>('idle')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setTimeout(() => { setStatus('sent') }, 1800)
  }

  return (
    <section id="contato" className="section contact-section">
      <div className="contact-bg" />
      <div ref={ref} className="section-inner contact-inner">
        {/* Left */}
        <motion.div
          className="contact-left"
          initial={{ opacity: 0, x: -40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <span className="section-label">Entre em Contato</span>
          <h2 className="section-title">
            Agende sua<br />
            <span className="contact-title-gold">consulta gratuita</span>
          </h2>
          <p className="section-subtitle contact-subtitle">
            Tire suas dúvidas sem compromisso. Nossa equipe está pronta para 
            analisar seu caso e apresentar as melhores alternativas jurídicas.
          </p>

          <div className="contact-info-list">
            {contactInfo.map(info => (
              <div key={info.label} className="contact-info-item">
                <div className="contact-info-icon">{info.icon}</div>
                <div>
                  <p className="contact-info-label">{info.label}</p>
                  <p className="contact-info-value">{info.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Social */}
          <div className="contact-socials">
            <a href="#" className="contact-social" aria-label="LinkedIn">in</a>
            <a href="#" className="contact-social" aria-label="Instagram">ig</a>
            <a href="#" className="contact-social" aria-label="WhatsApp">wa</a>
          </div>
        </motion.div>

        {/* Right — form */}
        <motion.div
          className="contact-right"
          initial={{ opacity: 0, x: 40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          <div className="contact-form-card">
            {status === 'sent' ? (
              <motion.div
                className="contact-success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="contact-success-icon">✓</div>
                <h3 className="contact-success-title">Mensagem enviada!</h3>
                <p className="contact-success-text">
                  Recebemos seu contato e retornaremos em até 24 horas úteis. 
                  Obrigado pela confiança.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form">
                <h3 className="contact-form-title">Fale com nossa equipe</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="contact-name" className="form-label">Nome completo *</label>
                    <input id="contact-name" name="name" type="text" required className="form-input" placeholder="Seu nome" value={form.name} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contact-email" className="form-label">E-mail *</label>
                    <input id="contact-email" name="email" type="email" required className="form-input" placeholder="seu@email.com" value={form.email} onChange={handleChange} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="contact-phone" className="form-label">Telefone</label>
                    <input id="contact-phone" name="phone" type="tel" className="form-input" placeholder="(11) 9xxxx-xxxx" value={form.phone} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contact-subject" className="form-label">Área jurídica *</label>
                    <select id="contact-subject" name="subject" required className="form-input form-select" value={form.subject} onChange={handleChange}>
                      <option value="">Selecione...</option>
                      <option>Direito Civil</option>
                      <option>Direito Empresarial</option>
                      <option>Direito Trabalhista</option>
                      <option>Direito Tributário</option>
                      <option>Direito de Família</option>
                      <option>Direito Imobiliário</option>
                      <option>Outro</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="contact-message" className="form-label">Descreva seu caso *</label>
                  <textarea id="contact-message" name="message" required className="form-input form-textarea" placeholder="Conte brevemente sua situação. Todas as informações são tratadas com sigilo absoluto." value={form.message} onChange={handleChange} rows={5} />
                </div>

                <button
                  id="contact-submit"
                  type="submit"
                  className={`btn btn-primary contact-submit ${status === 'sending' ? 'contact-submit--loading' : ''}`}
                  disabled={status === 'sending'}
                >
                  {status === 'sending' ? 'Enviando...' : 'Enviar Mensagem →'}
                </button>

                <p className="contact-privacy">
                  🔒 Suas informações são confidenciais e protegidas pelo sigilo profissional.
                </p>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
