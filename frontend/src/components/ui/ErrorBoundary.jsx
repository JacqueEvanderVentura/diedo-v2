import { Component } from 'react'
import { Button } from '@/components/ui/Button'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div
        role="alert"
        className="m-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
        data-testid="error-boundary"
      >
        <p className="font-heading text-base font-semibold text-slate-800">
          No se pudo mostrar esta pantalla.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          El resto de la app sigue disponible. Reintenta o cambia de módulo.
        </p>
        <Button className="mt-4" variant="secondary" onClick={this.handleRetry} data-testid="error-boundary-retry">
          Reintentar
        </Button>
      </div>
    )
  }
}
