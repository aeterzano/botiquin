export type PublicoObjetivo = 'adulto' | 'pediatrico' | 'ambos'
export type UnidadMedida =
  | 'comprimidos'
  | 'ml'
  | 'gotas'
  | 'sobres'
  | 'ampollas'
  | 'g'
  | 'disparos'
  | 'unidades'

export type EstadoMedicamento = 'activo' | 'baja'
export type MotivoBaja = 'vencido' | 'tirado' | 'perdido' | 'agotado' | null

export interface Medicamento {
  id: string
  nombre: string
  droga: string
  concentracion: string
  publico: PublicoObjetivo
  categoria: string
  unidad: UnidadMedida
  cantidad_actual: number
  cantidad_inicial: number
  stock_minimo: number
  fecha_vencimiento: string | null // YYYY-MM-DD
  para_que_sirve: string
  posologia_referencia: string
  notas: string
  foto_url: string | null
  fotos_urls?: string[]
  es_esencial: boolean
  esencial_id: string | null
  estado: EstadoMedicamento
  motivo_baja: MotivoBaja
  fecha_baja: string | null
  created_at: string
  updated_at: string
}

export interface ProductoEsencial {
  id: string
  nombre: string
  droga_sugerida: string
  publico: PublicoObjetivo
  categoria: string
  stock_minimo_sugerido: number
  unidad_sugerida: UnidadMedida
  keywords: string[]
  descripcion: string
  activo: boolean
  created_at: string
}

export interface MovimientoStock {
  id: string
  medicamento_id: string
  medicamento_nombre: string
  tipo: 'alta' | 'consumo' | 'reposicion' | 'baja' | 'edicion'
  cantidad: number
  unidad: string
  motivo: string
  usuario_email: string
  created_at: string
}

export interface BotiquinConfig {
  id: string
  email_alertas: string
  dias_proximo_vencer: number
  alertar_proximo_vencer: boolean
  alertar_vencido: boolean
  alertar_esencial_faltante: boolean
  alertar_sin_stock: boolean
  updated_at: string
}

export interface AlertaLog {
  id: string
  tipo: 'proximo_vencer' | 'vencido' | 'esencial_faltante' | 'sin_stock' | 'resumen'
  titulo: string
  detalle: string
  destinatario: string
  clave_dedup: string
  enviado_ok: boolean
  created_at: string
}

export interface AlertaActiva {
  tipo: 'vencido' | 'proximo_vencer' | 'esencial_faltante' | 'sin_stock'
  severidad: 'alta' | 'media'
  titulo: string
  detalle: string
  clave_dedup: string
  medicamento_id?: string
  esencial_id?: string
  dias_para_vencer?: number
}

export interface BotiquinState {
  medicamentos: Medicamento[]
  esenciales: ProductoEsencial[]
  movimientos: MovimientoStock[]
  config: BotiquinConfig
  alertas_log: AlertaLog[]
}

export const CATEGORIAS_MEDICAMENTOS = [
  'Analgésico / Antifebril',
  'Antiinflamatorio / Muscular',
  'Antiemético / Vómitos y Náuseas',
  'Digestivo / Antiácido / Antiespasmódico',
  'Rehidratación / Diarrea',
  'Antialérgico / Antihistamínico',
  'Resfrío / Tos / Vías Respiratorias',
  'Antibiótico',
  'Tópico / Piel / Quemaduras',
  'Primeros Auxilios / Antiséptico',
  'Vitaminas / Suplementos',
  'Otro',
]

export function calcularDiasVencimiento(fechaVencimiento: string | null): number | null {
  if (!fechaVencimiento) return null
  const parts = fechaVencimiento.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null

  const now = new Date()
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const expUtc = Date.UTC(parts[0], parts[1] - 1, parts[2])
  const diffDays = Math.round((expUtc - todayUtc) / (1000 * 60 * 60 * 24))
  return diffDays
}

export function esMedicamentoVencido(med: Medicamento): boolean {
  const dias = calcularDiasVencimiento(med.fecha_vencimiento)
  return dias !== null && dias < 0
}

export function esMedicamentoProximoAVencer(med: Medicamento, umbralDias: number): boolean {
  const dias = calcularDiasVencimiento(med.fecha_vencimiento)
  return dias !== null && dias >= 0 && dias <= umbralDias
}

export function esProductoConsideradoEsencial(
  med: {
    nombre?: string
    droga?: string
    para_que_sirve?: string
    publico?: PublicoObjetivo
    es_esencial?: boolean
    esencial_id?: string | null
  },
  esenciales: ProductoEsencial[]
): boolean {
  if (med.es_esencial || med.esencial_id) return true

  const textoMed = `${med.nombre || ''} ${med.droga || ''} ${med.para_que_sirve || ''}`
    .toLowerCase()
    .trim()
  if (!textoMed) return false

  const esencialesActivos = esenciales.filter((e) => e.activo)
  return esencialesActivos.some((esencial) => {
    const publicoCompatible =
      !med.publico ||
      esencial.publico === 'ambos' ||
      med.publico === 'ambos' ||
      med.publico === esencial.publico

    if (!publicoCompatible) return false

    return esencial.keywords.some(
      (kw) => kw.trim() && textoMed.includes(kw.toLowerCase().trim())
    )
  })
}

export function calcularStockMinimoPorDefecto(
  cantidadInicial: number,
  esEsencial: boolean
): number {
  if (!esEsencial) return 0
  const base = Math.max(0, Number(cantidadInicial) || 0)
  return Number((base * 0.2).toFixed(2))
}

export function verificarCoberturaEsencial(
  esencial: ProductoEsencial,
  medicamentos: Medicamento[]
): { cubierto: boolean; medicamentosQueCubren: Medicamento[] } {
  const activosVigentes = medicamentos.filter(
    (m) => m.estado === 'activo' && m.cantidad_actual > 0 && !esMedicamentoVencido(m)
  )

  const coincidencias = activosVigentes.filter((m) => {
    if (m.esencial_id && m.esencial_id === esencial.id) return true

    const publicoCompatible =
      esencial.publico === 'ambos' ||
      m.publico === 'ambos' ||
      m.publico === esencial.publico

    if (!publicoCompatible) return false

    const textoMed = `${m.nombre} ${m.droga} ${m.para_que_sirve}`.toLowerCase()
    return esencial.keywords.some((kw) => kw.trim() && textoMed.includes(kw.toLowerCase().trim()))
  })

  return {
    cubierto: coincidencias.length > 0,
    medicamentosQueCubren: coincidencias,
  }
}

export function calcularAlertasActivas(state: BotiquinState): AlertaActiva[] {
  const alertas: AlertaActiva[] = []
  const { medicamentos, esenciales, config } = state
  const umbral = config.dias_proximo_vencer || 30

  const activos = medicamentos.filter((m) => m.estado === 'activo')

  for (const med of activos) {
    const dias = calcularDiasVencimiento(med.fecha_vencimiento)

    if (dias !== null && dias < 0) {
      alertas.push({
        tipo: 'vencido',
        severidad: 'alta',
        titulo: `Producto vencido: ${med.nombre}`,
        detalle: `${med.nombre} (${med.droga || 'Sin droga especificada'}) venció el ${med.fecha_vencimiento} (hace ${Math.abs(dias)} días). Stock actual: ${med.cantidad_actual} ${med.unidad}. Se recomienda descartarlo y darlo de baja.`,
        clave_dedup: `vencido:${med.id}:${med.fecha_vencimiento}`,
        medicamento_id: med.id,
        dias_para_vencer: dias,
      })
    } else if (dias !== null && dias >= 0 && dias <= umbral) {
      alertas.push({
        tipo: 'proximo_vencer',
        severidad: dias <= 7 ? 'alta' : 'media',
        titulo: `Próximo a vencer (${dias === 0 ? 'vence hoy' : `en ${dias} días`}): ${med.nombre}`,
        detalle: `${med.nombre} (${med.droga || med.categoria}) vence el ${med.fecha_vencimiento}. Quedan ${med.cantidad_actual} ${med.unidad}.`,
        clave_dedup: `proximo_vencer:${med.id}:${med.fecha_vencimiento}`,
        medicamento_id: med.id,
        dias_para_vencer: dias,
      })
    }

    if (med.cantidad_actual <= 0) {
      alertas.push({
        tipo: 'sin_stock',
        severidad: 'alta',
        titulo: `Producto sin stock: ${med.nombre}`,
        detalle: `${med.nombre} (${med.publico === 'pediatrico' ? 'Pediátrico' : med.publico === 'adulto' ? 'Adultos' : 'Uso general'}) se quedó sin unidades disponibles (0 ${med.unidad}).`,
        clave_dedup: `sin_stock:${med.id}`,
        medicamento_id: med.id,
      })
    }
  }

  for (const esc of esenciales.filter((e) => e.activo)) {
    const { cubierto } = verificarCoberturaEsencial(esc, medicamentos)
    if (!cubierto) {
      alertas.push({
        tipo: 'esencial_faltante',
        severidad: 'alta',
        titulo: `Faltante de 1ra necesidad: ${esc.nombre}`,
        detalle: `No tenés stock vigente (no vencido y con cantidad > 0) para cubrir "${esc.nombre}" (${esc.droga_sugerida} - ${esc.publico === 'pediatrico' ? 'Pediátrico' : esc.publico === 'adulto' ? 'Adultos' : 'Ambos'}).`,
        clave_dedup: `esencial_faltante:${esc.id}`,
        esencial_id: esc.id,
      })
    }
  }

  return alertas
}
