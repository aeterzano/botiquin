import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { calcularAlertasActivas, loadBotiquinState } from '@/utils/botiquin-db'
import BotiquinAppClient from '@/components/BotiquinAppClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const initialState = await loadBotiquinState()
  const initialAlertas = calcularAlertasActivas(initialState)

  return (
    <BotiquinAppClient
      userEmail={user.email || 'aeterzano@gmail.com'}
      initialState={initialState}
      initialAlertas={initialAlertas}
    />
  )
}
