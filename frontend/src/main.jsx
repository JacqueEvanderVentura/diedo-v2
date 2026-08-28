import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.scss'

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={routerBasename || undefined}>
    <App />
  </BrowserRouter>
)
