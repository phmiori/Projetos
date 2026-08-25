import { HashRouter } from 'react-router-dom'
import Navbar from './components/Navbar/Navbar'
import Hero from './components/Hero/Hero'
import About from './components/About/About'
import PracticeAreas from './components/PracticeAreas/PracticeAreas'
import Team from './components/Team/Team'
import Stats from './components/Stats/Stats'
import Testimonials from './components/Testimonials/Testimonials'
import Blog from './components/Blog/Blog'
import Contact from './components/Contact/Contact'
import Footer from './components/Footer/Footer'

function App() {
  return (
    <HashRouter>
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <About />
        <PracticeAreas />
        <Team />
        <Testimonials />
        <Blog />
        <Contact />
      </main>
      <Footer />
    </HashRouter>
  )
}

export default App
