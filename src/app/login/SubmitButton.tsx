'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

export function SubmitButton({ label = 'Ingresar' }: { label?: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span>Ingresando...</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  )
}
