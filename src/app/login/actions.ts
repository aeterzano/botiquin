'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

const ALLOWED_EMAILS = ['aeterzano@gmail.com', 'villanuevamarisol27@gmail.com']

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  let { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Reintento amigable por si se ingresó con primera letra mayúscula/minúscula invertida
  if ((error || !authData?.user) && password) {
    const flippedPassword =
      password.charAt(0) === password.charAt(0).toUpperCase()
        ? password.charAt(0).toLowerCase() + password.slice(1)
        : password.charAt(0).toUpperCase() + password.slice(1)

    const retry = await supabase.auth.signInWithPassword({
      email,
      password: flippedPassword,
    })
    if (retry.data?.user) {
      authData = retry.data
      error = null
    }
  }

  if (error || !authData?.user) {
    redirect(
      `/login?message=${encodeURIComponent(
        error?.message || 'Credenciales inválidas. Verificá tu correo y contraseña.'
      )}`
    )
  }

  if (!ALLOWED_EMAILS.includes(email)) {
    await supabase.auth.signOut()
    redirect(
      `/login?message=${encodeURIComponent(
        'Tu usuario no tiene permisos para acceder al Botiquín Virtual.'
      )}`
    )
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string

  if (!ALLOWED_EMAILS.includes(email)) {
    redirect('/registro?message=Usuario no autorizado para registrarse')
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    redirect(`/registro?message=${encodeURIComponent(error.message || 'No se pudo registrar la cuenta')}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
