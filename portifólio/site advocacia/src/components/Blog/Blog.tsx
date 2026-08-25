import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import './Blog.css'

const posts = [
  {
    tag: 'Direito Empresarial',
    date: 'Jun 2026',
    title: 'Reforma Tributária 2024: O que muda para as empresas brasileiras',
    excerpt: 'Entenda as principais mudanças trazidas pela reforma tributária e como preparar sua empresa para o novo cenário fiscal com segurança jurídica.',
    readTime: '8 min',
    tagColor: 'gold',
  },
  {
    tag: 'Direito Trabalhista',
    date: 'Mai 2026',
    title: 'Trabalho remoto e os direitos do trabalhador: o que a lei diz',
    excerpt: 'Com a consolidação do home office no Brasil, é fundamental conhecer os direitos e deveres das partes em contratos de trabalho remoto.',
    readTime: '6 min',
    tagColor: 'blue',
  },
  {
    tag: 'Direito de Família',
    date: 'Abr 2026',
    title: 'Inventário extrajudicial: como agilizar a partilha de bens',
    excerpt: 'O inventário em cartório pode ser a solução mais rápida e econômica para família que precisam regularizar a herança sem disputas judiciais.',
    readTime: '5 min',
    tagColor: 'green',
  },
]

export default function Blog() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="blog" className="section blog-section">
      <div ref={ref} className="section-inner">
        <motion.div
          className="blog-header"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <div className="blog-header-text">
            <span className="section-label">Artigos Jurídicos</span>
            <h2 className="section-title">
              Conhecimento a serviço<br />dos seus direitos
            </h2>
          </div>
          <a href="#" className="btn btn-outline blog-all-btn">Ver todos os artigos →</a>
        </motion.div>

        <div className="blog-grid">
          {posts.map((post, i) => (
            <motion.article
              key={post.title}
              className="blog-card"
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.12 }}
            >
              {/* Card top accent */}
              <div className={`blog-card-accent blog-card-accent--${post.tagColor}`} />

              <div className="blog-card-body">
                <div className="blog-card-meta">
                  <span className={`blog-tag blog-tag--${post.tagColor}`}>{post.tag}</span>
                  <span className="blog-date">{post.date}</span>
                </div>

                <h3 className="blog-title">{post.title}</h3>
                <p className="blog-excerpt">{post.excerpt}</p>

                <div className="blog-footer">
                  <span className="blog-read-time">⏱ {post.readTime} de leitura</span>
                  <a href="#" className="blog-read-more">
                    Ler artigo
                    <span className="blog-read-arrow">→</span>
                  </a>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
