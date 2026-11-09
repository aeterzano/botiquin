import { login } from './actions'
import { SubmitButton } from './SubmitButton'
import { Metadata } from 'next'
import { HeartPulse } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Iniciar Sesión | Botiquín Virtual',
  description: 'Ingresá a tu Botiquín Virtual Familiar',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const resolvedParams = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 text-primary">
            <HeartPulse className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground">Botiquín Virtual</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Iniciá sesión para gestionar el stock de medicamentos y consultar a la IA
          </p>
        </div>

        {resolvedParams?.message && (
          <div className="mb-4 rounded-md bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20 text-center">
            {resolvedParams.message}
          </div>
        )}

        <form action={login} className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Correo Electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue="aeterzano@gmail.com"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder="aeterzano@gmail.com"
            />
          </div>
          <div className="flex flex-col space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div className="pt-4 flex flex-col space-y-3">
            <SubmitButton label="Ingresar al Botiquín" />
            <a
              href="/registro"
              className="w-full text-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Crear Cuenta
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
