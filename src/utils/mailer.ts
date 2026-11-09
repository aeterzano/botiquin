import nodemailer from 'nodemailer'
import crypto from 'crypto'
import {
  AlertaActiva,
  AlertaLog,
  calcularAlertasActivas,
  loadBotiquinState,
  saveBotiquinState,
} from './botiquin-db'

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'aeterzano@gmail.com',
      pass: process.env.EMAIL_PASS,
    },
  })
}

const TIPO_LABELS: Record<
  AlertaActiva['tipo'],
  { label: string; badgeBg: string; badgeColor: string; icon: string }
> = {
  vencido: {
    label: 'Producto Vencido',
    badgeBg: '#fef2f2',
    badgeColor: '#dc2626',
    icon: '🚨',
  },
  proximo_vencer: {
    label: 'Próximo a Vencer',
    badgeBg: '#fffbeb',
    badgeColor: '#d97706',
    icon: '⏳',
  },
  sin_stock: {
    label: 'Producto Sin Stock',
    badgeBg: '#fef2f2',
    badgeColor: '#e11d48',
    icon: '📦',
  },
  esencial_faltante: {
    label: 'Primera Necesidad Faltante',
    badgeBg: '#f5f3ff',
    badgeColor: '#7c3aed',
    icon: '⭐',
  },
}

export async function sendBotiquinAlertEmail(
  alertas: AlertaActiva[],
  destinatario = 'aeterzano@gmail.com',
  motivoDisparo = ' Monitoreo Automático del Botiquín'
): Promise<boolean> {
  if (!alertas.length) return false

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER o EMAIL_PASS no configurados para enviar correo.')
    return false
  }

  const transporter = createTransporter()

  const vencidos = alertas.filter((a) => a.tipo === 'vencido')
  const proximos = alertas.filter((a) => a.tipo === 'proximo_vencer')
  const sinStock = alertas.filter((a) => a.tipo === 'sin_stock')
  const esenciales = alertas.filter((a) => a.tipo === 'esencial_faltante')

  const renderSection = (titulo: string, items: AlertaActiva[]) => {
    if (items.length === 0) return ''
    const meta = TIPO_LABELS[items[0].tipo]
    return `
      <div style="margin-bottom: 22px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #18181b; display: flex; align-items: center;">
          <span>${meta.icon} ${titulo} (${items.length})</span>
        </h3>
        ${items
          .map(
            (item) => `
          <div style="background: ${meta.badgeBg}; border-left: 4px solid ${meta.badgeColor}; padding: 12px 14px; border-radius: 6px; margin-bottom: 8px;">
            <div style="font-weight: 700; color: #111827; font-size: 14px; margin-bottom: 4px;">
              ${item.titulo}
            </div>
            <div style="color: #374151; font-size: 13px; line-height: 1.45;">
              ${item.detalle}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `
  }

  const subjectPrefix =
    alertas.length === 1
      ? `${TIPO_LABELS[alertas[0].tipo].icon} Alerta Botiquín: ${alertas[0].titulo}`
      : `🏥 Botiquín Virtual: ${alertas.length} alertas activas (${ [
          vencidos.length ? `${vencidos.length} vencidos` : '',
          proximos.length ? `${proximos.length} próx. a vencer` : '',
          sinStock.length ? `${sinStock.length} sin stock` : '',
          esenciales.length ? `${esenciales.length} esenciales faltantes` : '',
        ]
          .filter(Boolean)
          .join(', ')})`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #09090b 0%, #18181b 100%); padding: 22px 24px; color: #fafafa;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #10b981; font-weight: 700; margin-bottom: 4px;">
          Botiquín Virtual Familiar
        </div>
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">
          Reporte de Alertas de Stock y Vencimientos
        </h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #a1a1aa;">
          Motivo: ${motivoDisparo} • ${new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}
        </p>
      </div>

      <div style="padding: 24px;">
        ${renderSection('Productos Vencidos', vencidos)}
        ${renderSection('Productos Próximos a Vencer', proximos)}
        ${renderSection('Productos Sin Stock', sinStock)}
        ${renderSection('Productos de Primera Necesidad Faltantes', esenciales)}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #71717a; text-align: center;">
          Este correo fue enviado automáticamente a <strong>${destinatario}</strong> desde tu Botiquín Virtual.
        </div>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: `"Botiquín Virtual" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: subjectPrefix,
    html,
  })

  return true
}

export async function evaluateAndSendAlerts(options?: {
  force?: boolean
  triggerReason?: string
  onlyKeysPrefixes?: string[]
}): Promise<{
  sent: boolean
  alertsSentCount: number
  activeAlerts: AlertaActiva[]
  recipient: string
  error?: string
}> {
  const state = await loadBotiquinState()
  const { config } = state
  const recipient = config.email_alertas || 'aeterzano@gmail.com'
  const allActive = calcularAlertasActivas(state)

  // Filter by enabled config toggles
  const enabledAlerts = allActive.filter((a) => {
    if (a.tipo === 'vencido' && !config.alertar_vencido) return false
    if (a.tipo === 'proximo_vencer' && !config.alertar_proximo_vencer) return false
    if (a.tipo === 'esencial_faltante' && !config.alertar_esencial_faltante) return false
    if (a.tipo === 'sin_stock' && !config.alertar_sin_stock) return false
    return true
  })

  const candidateAlerts = options?.onlyKeysPrefixes?.length
    ? enabledAlerts.filter((a) =>
        options.onlyKeysPrefixes!.some((prefix) => a.clave_dedup.startsWith(prefix))
      )
    : enabledAlerts

  const todayKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const alertsToSend = options?.force
    ? candidateAlerts
    : candidateAlerts.filter((a) => {
        const alreadySentToday = state.alertas_log.some(
          (log) =>
            log.enviado_ok &&
            log.clave_dedup === a.clave_dedup &&
            log.created_at.slice(0, 10) === todayKey
        )
        return !alreadySentToday
      })

  if (alertsToSend.length === 0) {
    return {
      sent: false,
      alertsSentCount: 0,
      activeAlerts: allActive,
      recipient,
    }
  }

  try {
    const ok = await sendBotiquinAlertEmail(
      alertsToSend,
      recipient,
      options?.triggerReason || 'Verificación automática de stock y vencimientos'
    )

    const nowIso = new Date().toISOString()
    const newLogs: AlertaLog[] = alertsToSend.map((a) => ({
      id: crypto.randomUUID(),
      tipo: a.tipo,
      titulo: a.titulo,
      detalle: a.detalle,
      destinatario: recipient,
      clave_dedup: a.clave_dedup,
      enviado_ok: ok,
      created_at: nowIso,
    }))

    state.alertas_log = [...newLogs, ...state.alertas_log].slice(0, 150)
    await saveBotiquinState(state)

    return {
      sent: ok,
      alertsSentCount: ok ? alertsToSend.length : 0,
      activeAlerts: allActive,
      recipient,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error enviando email'
    console.error('Error sending botiquin alert email:', err)
    return {
      sent: false,
      alertsSentCount: 0,
      activeAlerts: allActive,
      recipient,
      error: message,
    }
  }
}
