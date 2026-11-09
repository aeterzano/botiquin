import { NextRequest, NextResponse } from 'next/server'
import { evaluateAndSendAlerts } from '@/utils/mailer'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const force = req.nextUrl.searchParams.get('force') === '1'
    const result = await evaluateAndSendAlerts({
      force,
      triggerReason: 'Ejecución de Cron de Alertas de Botiquín Virtual',
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error en cron de alertas'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
