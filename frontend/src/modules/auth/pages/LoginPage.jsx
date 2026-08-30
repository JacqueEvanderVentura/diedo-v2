import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { useSessionStore } from '@/stores/sessionStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useSessionStore((s) => s.login)
  const [email, setEmail] = useState('owner@erp.dev')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Ingresa email y contraseña.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      toast.success('Sesión iniciada')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md p-8" data-testid="login-page">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <LogIn className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Iniciar sesión</h1>
          <p className="mt-2 text-sm text-slate-500">
            Conecta con la API local. El modo demo solo se activa mediante configuración explícita.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@erp.dev"
              autoComplete="username"
              data-testid="login-email"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Contraseña</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              data-testid="login-password"
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-red-500" data-testid="login-error">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Los usuarios demo se generan desde el manifiesto versionado cuando el seed está habilitado.
        </p>
      </Card>
    </div>
  )
}
