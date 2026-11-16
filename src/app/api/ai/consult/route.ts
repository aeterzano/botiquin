import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { consultBotiquinAI } from '@/utils/ai-botiquin'
import {
  calcularEdadDesdeFecha,
  ConsultaHistorialItem,
  loadBotiquinState,
  PublicoObjetivo,
  saveBotiquinState,
} from '@/utils/botiquin-db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      consulta,
      familiarId = null,
      pacienteNombre = '',
      pacienteTipo = 'auto',
      edadPesoDetalle = '',
      pesoOverride = null,
      historial = [],
    } = body

    if (!consulta || !String(consulta).trim()) {
      return NextResponse.json(
        { ok: false, error: 'Por favor escribí tu consulta o síntoma.' },
        { status: 400 }
      )
    }

    const state = await loadBotiquinState()
    const familia = state.familia || []
    const familiarSeleccionado =
      familiarId && familiarId !== 'otro'
        ? familia.find((f) => f.id === familiarId) || null
        : null

    let effectivePacienteTipo: 'auto' | 'adulto' | 'pediatrico' = pacienteTipo
    let nombreParaRegistro = pacienteNombre || 'Otro (Visitante)'
    let edadTextoRegistro = edadPesoDetalle || ''
    let pesoRegistro: number | null = pesoOverride ? Number(pesoOverride) : null
    let publicoRegistro: PublicoObjetivo =
      pacienteTipo === 'pediatrico' ? 'pediatrico' : 'adulto'

    if (familiarSeleccionado) {
      const edadInfo = calcularEdadDesdeFecha(familiarSeleccionado.fecha_nacimiento)
      effectivePacienteTipo = edadInfo.esPediatrico ? 'pediatrico' : 'adulto'
      publicoRegistro = edadInfo.esPediatrico ? 'pediatrico' : 'adulto'
      nombreParaRegistro = familiarSeleccionado.nombre
      edadTextoRegistro = edadInfo.texto
      pesoRegistro = familiarSeleccionado.peso_kg
    }

    const consultasPreviasPaciente = (state.consultas_historial || []).filter((c) => {
      if (familiarSeleccionado) {
        return (
          c.familiar_id === familiarSeleccionado.id ||
          c.paciente_nombre.toLowerCase() === familiarSeleccionado.nombre.toLowerCase()
        )
      }
      return c.familiar_id === 'otro' || !c.familiar_id
    })

    const consumosPreviosPaciente = (state.movimientos || []).filter((m) => {
      if (m.tipo !== 'consumo') return false
      if (familiarSeleccionado) {
        return (
          m.familiar_id === familiarSeleccionado.id ||
          (m.familiar_nombre &&
            m.familiar_nombre.toLowerCase() === familiarSeleccionado.nombre.toLowerCase()) ||
          m.motivo.toLowerCase().includes(familiarSeleccionado.nombre.toLowerCase())
        )
      }
      return false
    })

    const respuesta = await consultBotiquinAI({
      consulta: String(consulta).trim(),
      pacienteTipo: effectivePacienteTipo,
      edadPesoDetalle,
      medicamentos: state.medicamentos,
      historial,
      familiarSeleccionado,
      familiaCompleta: familia,
      consultasPreviasPaciente,
      consumosPreviosPaciente,
    })

    const nuevoRegistro: ConsultaHistorialItem = {
      id: crypto.randomUUID(),
      familiar_id: familiarSeleccionado ? familiarSeleccionado.id : 'otro',
      paciente_nombre: nombreParaRegistro,
      paciente_publico: publicoRegistro,
      edad_texto: edadTextoRegistro,
      peso_kg: pesoRegistro,
      consulta: String(consulta).trim(),
      respuesta_markdown: respuesta.respuesta_markdown,
      aiData: {
        en_stock_utilizable: respuesta.en_stock_utilizable,
        recomendados_del_stock: respuesta.recomendados_del_stock,
        advertencias_stock: respuesta.advertencias_stock,
        sugerencias_compra: respuesta.sugerencias_compra,
        pautas_alarma: respuesta.pautas_alarma,
        nivel_urgencia: respuesta.nivel_urgencia,
      },
      created_at: new Date().toISOString(),
    }

    state.consultas_historial = [nuevoRegistro, ...(state.consultas_historial || [])].slice(0, 300)
    await saveBotiquinState(state)

    return NextResponse.json({
      ok: true,
      respuesta,
      consultaItem: nuevoRegistro,
      state,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error consultando al asistente IA'
    console.error('Error in /api/ai/consult:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
