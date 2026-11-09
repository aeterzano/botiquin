export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')

    console.log('🏥 Inicializando Cron de Alertas de Botiquín Virtual...')

    // Revisa todos los días a las 08:30 y 19:00 hs (Hora Argentina) vencimientos, próximos a vencer, sin stock y esenciales faltantes
    cron.schedule(
      '30 8,19 * * *',
      async () => {
        console.log('🔔 Ejecutando verificación programada de alertas del Botiquín...')
        try {
          const { evaluateAndSendAlerts } = await import('./utils/mailer')
          const result = await evaluateAndSendAlerts({
            force: false,
            triggerReason: 'Chequeo diario automático de Botiquín Virtual',
          })
          console.log('✅ Resultado Cron Botiquín:', {
            sent: result.sent,
            alertsSentCount: result.alertsSentCount,
            activeAlertsTotal: result.activeAlerts.length,
          })
        } catch (err) {
          console.error('❌ Error en Cron Job de Botiquín:', err)
        }
      },
      {
        scheduled: true,
        timezone: 'America/Argentina/Buenos_Aires',
      }
    )
  }
}
