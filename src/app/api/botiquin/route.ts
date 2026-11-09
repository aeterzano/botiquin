import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  calcularAlertasActivas,
  DEFAULT_ESENCIALES,
  loadBotiquinState,
  Medicamento,
  MotivoBaja,
  ProductoEsencial,
  PublicoObjetivo,
  saveBotiquinState,
  UnidadMedida,
  uploadMedicationPhoto,
} from '@/utils/botiquin-db'
import { evaluateAndSendAlerts } from '@/utils/mailer'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const state = await loadBotiquinState()
    const alertasActivas = calcularAlertasActivas(state)
    return NextResponse.json({
      ok: true,
      state,
      alertasActivas,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error cargando botiquín'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userEmail = user?.email || 'aeterzano@gmail.com'

    const body = await req.json()
    const { action } = body

    const state = await loadBotiquinState()
    const nowIso = new Date().toISOString()

    if (action === 'add_medicamento') {
      const payload = body.medicamento
      const rawFotos: string[] = Array.isArray(payload.fotos_input)
        ? payload.fotos_input.filter(Boolean)
        : [payload.foto_base64 || payload.foto_url].filter(Boolean)

      const uploadedUrls: string[] = []
      for (let i = 0; i < rawFotos.length; i++) {
        const uploaded = await uploadMedicationPhoto(
          rawFotos[i],
          `${payload.nombre || 'med'}_${i + 1}`
        )
        if (uploaded) uploadedUrls.push(uploaded)
      }

      const fotoUrl: string | null = uploadedUrls[0] || null

      const cantInicial = Math.max(0, Number(payload.cantidad_inicial ?? payload.cantidad_actual ?? 1))
      const cantActual = Math.max(0, Number(payload.cantidad_actual ?? cantInicial))

      const nuevo: Medicamento = {
        id: crypto.randomUUID(),
        nombre: (payload.nombre || 'Medicamento').trim(),
        droga: (payload.droga || '').trim(),
        concentracion: (payload.concentracion || '').trim(),
        publico: (['adulto', 'pediatrico', 'ambos'].includes(payload.publico)
          ? payload.publico
          : 'adulto') as PublicoObjetivo,
        categoria: payload.categoria || 'Otro',
        unidad: (payload.unidad || 'comprimidos') as UnidadMedida,
        cantidad_actual: cantActual,
        cantidad_inicial: Math.max(cantInicial, cantActual),
        stock_minimo: Math.max(0, Number(payload.stock_minimo ?? 1)),
        fecha_vencimiento: payload.fecha_vencimiento || null,
        para_que_sirve: (payload.para_que_sirve || '').trim(),
        posologia_referencia: (payload.posologia_referencia || '').trim(),
        notas: (payload.notas || '').trim(),
        foto_url: fotoUrl,
        fotos_urls: uploadedUrls,
        es_esencial: Boolean(payload.es_esencial),
        esencial_id: payload.esencial_id || null,
        estado: 'activo',
        motivo_baja: null,
        fecha_baja: null,
        created_at: nowIso,
        updated_at: nowIso,
      }

      state.medicamentos = [nuevo, ...state.medicamentos]
      state.movimientos = [
        {
          id: crypto.randomUUID(),
          medicamento_id: nuevo.id,
          medicamento_nombre: nuevo.nombre,
          tipo: 'alta',
          cantidad: nuevo.cantidad_actual,
          unidad: nuevo.unidad,
          motivo: 'Alta de nuevo producto en el botiquín',
          usuario_email: userEmail,
          created_at: nowIso,
        },
        ...state.movimientos,
      ].slice(0, 300)

      await saveBotiquinState(state)

      // Check if newly added product triggers an expiration or zero-stock alert
      const alertResult = await evaluateAndSendAlerts({
        force: false,
        triggerReason: `Carga de producto: ${nuevo.nombre}`,
        onlyKeysPrefixes: [
          `vencido:${nuevo.id}`,
          `proximo_vencer:${nuevo.id}`,
          `sin_stock:${nuevo.id}`,
        ],
      })

      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        medicamento: nuevo,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
        emailSent: alertResult.sent,
      })
    }

    if (action === 'update_medicamento') {
      const payload = body.medicamento
      const idx = state.medicamentos.findIndex((m) => m.id === payload.id)
      if (idx === -1) {
        return NextResponse.json({ ok: false, error: 'Medicamento no encontrado' }, { status: 404 })
      }

      const prev = state.medicamentos[idx]
      let uploadedUrls: string[] =
        prev.fotos_urls && prev.fotos_urls.length > 0
          ? [...prev.fotos_urls]
          : prev.foto_url
          ? [prev.foto_url]
          : []

      if (Array.isArray(payload.fotos_input)) {
        uploadedUrls = []
        for (let i = 0; i < payload.fotos_input.length; i++) {
          const item = payload.fotos_input[i]
          if (!item) continue
          const uploaded = await uploadMedicationPhoto(
            item,
            `${payload.nombre || prev.nombre}_${i + 1}`
          )
          if (uploaded) uploadedUrls.push(uploaded)
        }
      } else if (payload.foto_base64) {
        const single = await uploadMedicationPhoto(
          payload.foto_base64,
          payload.nombre || prev.nombre
        )
        if (single) uploadedUrls = [single, ...uploadedUrls]
      }

      const fotoUrl = uploadedUrls[0] || null

      const cantActual = Math.max(0, Number(payload.cantidad_actual ?? prev.cantidad_actual))
      const cantInicial = Math.max(
        cantActual,
        Number(payload.cantidad_inicial ?? prev.cantidad_inicial)
      )

      const actualizado: Medicamento = {
        ...prev,
        nombre: (payload.nombre ?? prev.nombre).trim(),
        droga: (payload.droga ?? prev.droga).trim(),
        concentracion: (payload.concentracion ?? prev.concentracion).trim(),
        publico: (payload.publico ?? prev.publico) as PublicoObjetivo,
        categoria: payload.categoria ?? prev.categoria,
        unidad: (payload.unidad ?? prev.unidad) as UnidadMedida,
        cantidad_actual: cantActual,
        cantidad_inicial: cantInicial,
        stock_minimo: Math.max(0, Number(payload.stock_minimo ?? prev.stock_minimo)),
        fecha_vencimiento:
          payload.fecha_vencimiento !== undefined
            ? payload.fecha_vencimiento || null
            : prev.fecha_vencimiento,
        para_que_sirve: (payload.para_que_sirve ?? prev.para_que_sirve).trim(),
        posologia_referencia: (payload.posologia_referencia ?? prev.posologia_referencia).trim(),
        notas: (payload.notas ?? prev.notas).trim(),
        foto_url: fotoUrl,
        fotos_urls: uploadedUrls,
        es_esencial:
          payload.es_esencial !== undefined ? Boolean(payload.es_esencial) : prev.es_esencial,
        esencial_id:
          payload.esencial_id !== undefined ? payload.esencial_id : prev.esencial_id,
        estado: payload.estado ?? prev.estado,
        updated_at: nowIso,
      }

      state.medicamentos[idx] = actualizado
      state.movimientos = [
        {
          id: crypto.randomUUID(),
          medicamento_id: actualizado.id,
          medicamento_nombre: actualizado.nombre,
          tipo: 'edicion',
          cantidad: actualizado.cantidad_actual,
          unidad: actualizado.unidad,
          motivo: 'Actualización de datos del producto',
          usuario_email: userEmail,
          created_at: nowIso,
        },
        ...state.movimientos,
      ].slice(0, 300)

      await saveBotiquinState(state)

      const alertResult = await evaluateAndSendAlerts({
        force: false,
        triggerReason: `Actualización de ${actualizado.nombre}`,
      })

      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        medicamento: actualizado,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
        emailSent: alertResult.sent,
      })
    }

    if (action === 'consume_dosis') {
      const { id, cantidad, motivo } = body
      const idx = state.medicamentos.findIndex((m) => m.id === id)
      if (idx === -1) {
        return NextResponse.json({ ok: false, error: 'Medicamento no encontrado' }, { status: 404 })
      }

      const med = state.medicamentos[idx]
      const cantRestar = Math.max(0.1, Number(cantidad || 1))
      const nuevaCantidad = Math.max(0, Number((med.cantidad_actual - cantRestar).toFixed(2)))

      state.medicamentos[idx] = {
        ...med,
        cantidad_actual: nuevaCantidad,
        updated_at: nowIso,
      }

      state.movimientos = [
        {
          id: crypto.randomUUID(),
          medicamento_id: med.id,
          medicamento_nombre: med.nombre,
          tipo: 'consumo',
          cantidad: cantRestar,
          unidad: med.unidad,
          motivo: motivo || `Uso de dosis (-${cantRestar} ${med.unidad})`,
          usuario_email: userEmail,
          created_at: nowIso,
        },
        ...state.movimientos,
      ].slice(0, 300)

      await saveBotiquinState(state)

      // Evaluate alerts immediately (e.g. if product reached 0 stock or essential became missing)
      const alertResult = await evaluateAndSendAlerts({
        force: false,
        triggerReason: `Consumo de dosis de ${med.nombre} (quedan ${nuevaCantidad} ${med.unidad})`,
      })

      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        medicamento: updatedState.medicamentos[idx],
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
        emailSent: alertResult.sent,
      })
    }

    if (action === 'reponer_stock') {
      const { id, cantidad_sumar, nueva_fecha_vencimiento, motivo } = body
      const idx = state.medicamentos.findIndex((m) => m.id === id)
      if (idx === -1) {
        return NextResponse.json({ ok: false, error: 'Medicamento no encontrado' }, { status: 404 })
      }

      const med = state.medicamentos[idx]
      const cantSumar = Math.max(0.1, Number(cantidad_sumar || 1))
      const nuevaCantidad = Number((med.cantidad_actual + cantSumar).toFixed(2))

      state.medicamentos[idx] = {
        ...med,
        cantidad_actual: nuevaCantidad,
        cantidad_inicial: Math.max(med.cantidad_inicial, nuevaCantidad),
        fecha_vencimiento: nueva_fecha_vencimiento || med.fecha_vencimiento,
        estado: 'activo',
        motivo_baja: null,
        fecha_baja: null,
        updated_at: nowIso,
      }

      state.movimientos = [
        {
          id: crypto.randomUUID(),
          medicamento_id: med.id,
          medicamento_nombre: med.nombre,
          tipo: 'reposicion',
          cantidad: cantSumar,
          unidad: med.unidad,
          motivo: motivo || `Reposición de stock (+${cantSumar} ${med.unidad})`,
          usuario_email: userEmail,
          created_at: nowIso,
        },
        ...state.movimientos,
      ].slice(0, 300)

      await saveBotiquinState(state)
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    if (action === 'baja_medicamento') {
      const { id, motivo_baja, detalle } = body
      const idx = state.medicamentos.findIndex((m) => m.id === id)
      if (idx === -1) {
        return NextResponse.json({ ok: false, error: 'Medicamento no encontrado' }, { status: 404 })
      }

      const med = state.medicamentos[idx]
      const motivoValido = (['vencido', 'tirado', 'perdido', 'agotado'].includes(motivo_baja)
        ? motivo_baja
        : 'tirado') as MotivoBaja

      const etiquetasMotivo: Record<string, string> = {
        vencido: 'Baja por vencimiento',
        tirado: 'Descartado / Tirado',
        perdido: 'Perdido / Extraviado',
        agotado: 'Terminado por completo',
      }

      state.medicamentos[idx] = {
        ...med,
        cantidad_actual: 0,
        estado: 'baja',
        motivo_baja: motivoValido,
        fecha_baja: nowIso,
        updated_at: nowIso,
      }

      state.movimientos = [
        {
          id: crypto.randomUUID(),
          medicamento_id: med.id,
          medicamento_nombre: med.nombre,
          tipo: 'baja',
          cantidad: med.cantidad_actual,
          unidad: med.unidad,
          motivo: `${etiquetasMotivo[motivoValido || 'tirado']}${detalle ? `: ${detalle}` : ''}`,
          usuario_email: userEmail,
          created_at: nowIso,
        },
        ...state.movimientos,
      ].slice(0, 300)

      await saveBotiquinState(state)

      // Giving low to a product might leave an essential uncovered -> evaluate and send alerts
      const alertResult = await evaluateAndSendAlerts({
        force: false,
        triggerReason: `Baja de producto: ${med.nombre} (${etiquetasMotivo[motivoValido || 'tirado']})`,
      })

      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
        emailSent: alertResult.sent,
      })
    }

    if (action === 'delete_medicamento') {
      const { id } = body
      state.medicamentos = state.medicamentos.filter((m) => m.id !== id)
      try {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const admin = createAdminClient()
        await admin.from('botiquin_medicamentos').delete().eq('id', id)
      } catch {
        // ignore if SQL table does not exist
      }
      await saveBotiquinState(state)
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    if (action === 'save_esencial') {
      const payload = body.esencial
      const id = payload.id || `esc-${Date.now()}`
      const keywordsRaw: string[] = Array.isArray(payload.keywords)
        ? payload.keywords
        : String(payload.keywords || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)

      if (keywordsRaw.length === 0 && payload.nombre) {
        keywordsRaw.push(payload.nombre.toLowerCase())
      }

      const item: ProductoEsencial = {
        id,
        nombre: (payload.nombre || 'Producto Esencial').trim(),
        droga_sugerida: (payload.droga_sugerida || '').trim(),
        publico: (['adulto', 'pediatrico', 'ambos'].includes(payload.publico)
          ? payload.publico
          : 'ambos') as PublicoObjetivo,
        categoria: payload.categoria || 'Otro',
        stock_minimo_sugerido: Math.max(1, Number(payload.stock_minimo_sugerido || 1)),
        unidad_sugerida: (payload.unidad_sugerida || 'unidades') as UnidadMedida,
        keywords: keywordsRaw,
        descripcion: (payload.descripcion || '').trim(),
        activo: payload.activo !== undefined ? Boolean(payload.activo) : true,
        created_at: payload.created_at || nowIso,
      }

      const idx = state.esenciales.findIndex((e) => e.id === id)
      if (idx >= 0) {
        state.esenciales[idx] = item
      } else {
        state.esenciales.push(item)
      }

      await saveBotiquinState(state)

      const alertResult = await evaluateAndSendAlerts({
        force: false,
        triggerReason: `Actualización de lista de primera necesidad (${item.nombre})`,
      })

      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
        emailSent: alertResult.sent,
      })
    }

    if (action === 'delete_esencial') {
      const { id } = body
      state.esenciales = state.esenciales.filter((e) => e.id !== id)
      try {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const admin = createAdminClient()
        await admin.from('botiquin_esenciales').delete().eq('id', id)
      } catch {
        // ignore
      }
      await saveBotiquinState(state)
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    if (action === 'reset_esenciales') {
      state.esenciales = DEFAULT_ESENCIALES
      await saveBotiquinState(state)
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    if (action === 'update_config') {
      const cfg = body.config || {}
      state.config = {
        ...state.config,
        email_alertas: (cfg.email_alertas || 'aeterzano@gmail.com').trim(),
        dias_proximo_vencer: Math.max(1, Number(cfg.dias_proximo_vencer ?? 30)),
        alertar_proximo_vencer: Boolean(cfg.alertar_proximo_vencer),
        alertar_vencido: Boolean(cfg.alertar_vencido),
        alertar_esencial_faltante: Boolean(cfg.alertar_esencial_faltante),
        alertar_sin_stock: Boolean(cfg.alertar_sin_stock),
        updated_at: nowIso,
      }
      await saveBotiquinState(state)
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    if (action === 'send_alerts_now') {
      const result = await evaluateAndSendAlerts({
        force: true,
        triggerReason: 'Envío manual solicitado desde el panel del Botiquín Virtual',
      })
      const updatedState = await loadBotiquinState()
      return NextResponse.json({
        ok: true,
        result,
        state: updatedState,
        alertasActivas: calcularAlertasActivas(updatedState),
      })
    }

    return NextResponse.json({ ok: false, error: 'Acción no reconocida' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error procesando solicitud'
    console.error('Error in POST /api/botiquin:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
