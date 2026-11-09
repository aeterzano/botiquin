import { NextRequest, NextResponse } from 'next/server'
import { consultBotiquinAI } from '@/utils/ai-botiquin'
import { loadBotiquinState } from '@/utils/botiquin-db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { consulta, pacienteTipo = 'auto', edadPesoDetalle = '', historial = [] } = body

    if (!consulta || !String(consulta).trim()) {
      return NextResponse.json(
        { ok: false, error: 'Por favor escribí tu consulta o síntoma.' },
        { status: 400 }
      )
    }

    const state = await loadBotiquinState()
    const respuesta = await consultBotiquinAI({
      consulta: String(consulta).trim(),
      pacienteTipo,
      edadPesoDetalle,
      medicamentos: state.medicamentos,
      historial,
    })

    return NextResponse.json({
      ok: true,
      respuesta,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error consultando al asistente IA'
    console.error('Error in /api/ai/consult:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
