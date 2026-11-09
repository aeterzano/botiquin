import { signup } from '../login/actions'
import { SubmitButton } from '../login/SubmitButton'
import { HeartPulse } from 'lucide-react'
import Link from 'next/link'

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const resolvedParams = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#3a404f] bg-[#1c1f29] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 text-primary">
            <HeartPulse className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Crear Cuenta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registrá tu acceso al Botiquín Virtual Familiar
          </p>
        </div>

        {resolvedParams?.message && (
          <div className="mb-4 rounded-md bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20 text-center">
            {resolvedParams.message}
          </div>
        )}

        <form action={signup} className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Correo Electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded-lg border border-[#323846] bg-[#101218] px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder="correo@ejemplo.com"
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
              className="rounded-lg border border-[#323846] bg-[#101218] px-4 py-2.5 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div className="pt-4 flex flex-col space-y-3">
            <SubmitButton label="Registrarme" />
            <Link
              href="/login"
              className="w-full text-center rounded-lg border border-zinc-600/80 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
            >
              Volver
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
