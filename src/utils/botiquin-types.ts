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
  familiar_id?: string | null
  familiar_nombre?: string | null
  created_at: string
}

export interface MiembroFamilia {
  id: string
  nombre: string
  fecha_nacimiento: string // YYYY-MM-DD
  peso_kg: number | null
  antecedentes_medicos: string
  dolores_recurrentes: string
  alergias?: string
  medicacion_habitual?: string
  created_at: string
  updated_at: string
}

export interface ConsultaHistorialItem {
  id: string
  familiar_id: string | null // ID de MiembroFamilia o 'otro'
  paciente_nombre: string
  paciente_publico: PublicoObjetivo
  edad_texto: string
  peso_kg: number | null
  consulta: string
  respuesta_markdown: string
  aiData?: {
    en_stock_utilizable: boolean
    recomendados_del_stock: {
      id: string
      nombre: string
      droga: string
      cantidad_actual: number
      unidad: string
      dosis_sugerida: string
      cantidad_descontar_sugerida: number
      motivo: string
    }[]
    advertencias_stock: string[]
    sugerencias_compra: {
      nombre_sugerido: string
      droga: string
      publico: string
      motivo: string
      presentacion_sugerida: string
    }[]
    pautas_alarma: string[]
    nivel_urgencia: 'baja' | 'media' | 'alta'
  }
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
  familia: MiembroFamilia[]
  consultas_historial: ConsultaHistorialItem[]
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

export function calcularEdadDesdeFecha(fechaNacimiento: string | null | undefined): {
  anios: number
  meses: number
  totalMeses: number
  texto: string
  esPediatrico: boolean
} {
  if (!fechaNacimiento) {
    return { anios: 30, meses: 0, totalMeses: 360, texto: 'Sin fecha', esPediatrico: false }
  }
  const parts = fechaNacimiento.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    return { anios: 30, meses: 0, totalMeses: 360, texto: 'Sin fecha', esPediatrico: false }
  }

  const now = new Date()
  let years = now.getFullYear() - parts[0]
  let months = now.getMonth() + 1 - parts[1]
  const days = now.getDate() - parts[2]

  if (days < 0) {
    months -= 1
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years < 0) {
    return { anios: 0, meses: 0, totalMeses: 0, texto: 'Recién nacido', esPediatrico: true }
  }

  const totalMeses = years * 12 + months
  const esPediatrico = years < 15

  let texto = ''
  if (years === 0) {
    texto = `${months} ${months === 1 ? 'mes' : 'meses'}`
  } else if (years < 2 && months > 0) {
    texto = `${years} año y ${months} ${months === 1 ? 'mes' : 'meses'}`
  } else {
    texto = `${years} ${years === 1 ? 'año' : 'años'}`
  }

  return { anios: years, meses: months, totalMeses, texto, esPediatrico }
}

export function generarEsencialesSegunFamilia(
  familia: MiembroFamilia[],
  esencialesActuales: ProductoEsencial[]
): { nuevos: ProductoEsencial[]; listaActualizada: ProductoEsencial[] } {
  const lista = [...esencialesActuales]
  const nuevos: ProductoEsencial[] = []
  const nowIso = new Date().toISOString()

  const addIfNotExists = (candidato: Omit<ProductoEsencial, 'created_at' | 'activo'>) => {
    const yaExiste = lista.some(
      (e) =>
        e.id === candidato.id ||
        e.nombre.toLowerCase() === candidato.nombre.toLowerCase() ||
        (e.publico === candidato.publico &&
          candidato.keywords.some((kw) =>
            e.keywords.map((k) => k.toLowerCase()).includes(kw.toLowerCase())
          ) &&
          e.categoria === candidato.categoria)
    )
    if (!yaExiste) {
      const nuevoItem: ProductoEsencial = {
        ...candidato,
        activo: true,
        created_at: nowIso,
      }
      lista.push(nuevoItem)
      nuevos.push(nuevoItem)
    }
  }

  for (const miembro of familia) {
    const edad = calcularEdadDesdeFecha(miembro.fecha_nacimiento)
    const publicoMiembro: PublicoObjetivo = edad.esPediatrico ? 'pediatrico' : 'adulto'
    const textoClinico = `${miembro.antecedentes_medicos || ''} ${miembro.dolores_recurrentes || ''} ${
      miembro.alergias || ''
    }`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    // Reglas por edad pediátrica / lactante
    if (edad.totalMeses <= 36) {
      addIfNotExists({
        id: 'esc-fam-solucion-fisiologica',
        nombre: 'Solución Fisiológica (Lavajes nasales / Nebulizar)',
        droga_sugerida: 'Cloruro de Sodio 0.9%',
        publico: 'pediatrico',
        categoria: 'Resfrío / Tos / Vías Respiratorias',
        stock_minimo_sugerido: 1,
        unidad_sugerida: 'ml',
        keywords: ['solucion fisiologica', 'cloruro de sodio', 'fisiologica', 'hypersol'],
        descripcion: `Congestión nasal, mocos y nebulizaciones (${miembro.nombre}).`,
      })
    }

    // Dolores recurrentes / antecedentes específicos
    if (/(migrana|jaqueca|cefalea|dolor de cabeza)/.test(textoClinico)) {
      addIfNotExists({
        id: `esc-fam-migrana-${publicoMiembro}`,
        nombre:
          publicoMiembro === 'adulto'
            ? 'Analgésico / Antimigrañoso Fuerte'
            : 'Analgésico Cefalea Pediátrico',
        droga_sugerida:
          publicoMiembro === 'adulto'
            ? 'Ibuprofeno 600mg / Naproxeno / Paracetamol 1g'
            : 'Ibuprofeno 4% / Paracetamol',
        publico: publicoMiembro,
        categoria: 'Analgésico / Antifebril',
        stock_minimo_sugerido: 4,
        unidad_sugerida: publicoMiembro === 'adulto' ? 'comprimidos' : 'ml',
        keywords: ['migral', 'tetralgin', 'naproxeno', 'ibuprofeno 600', 'actron 600', 'tafirol 1g'],
        descripcion: `Dolor de cabeza intenso o migrañas recurrentes (${miembro.nombre}).`,
      })
    }

    if (/(espalda|lumbar|cervical|contractura|ciatico|muscular|cuello)/.test(textoClinico)) {
      addIfNotExists({
        id: 'esc-fam-contractura-muscular',
        nombre: 'Descontracturante / Miorelajante',
        droga_sugerida: 'Diclofenac + Pridinol / Ibuprofeno + Clorzoxazona',
        publico: 'adulto',
        categoria: 'Antiinflamatorio / Muscular',
        stock_minimo_sugerido: 4,
        unidad_sugerida: 'comprimidos',
        keywords: ['oxagesic', 'blokium flex', 'pridinol', 'clorzoxazona', 'ibupirac flex', 'atomo'],
        descripcion: `Contracturas, dolor lumbar, cervical o muscular recurrente (${miembro.nombre}).`,
      })
    }

    if (/(acidez|gastritis|reflujo|estomago|ardor|ulcera|indigestion)/.test(textoClinico)) {
      addIfNotExists({
        id: `esc-fam-protector-gastrico-${publicoMiembro}`,
        nombre: 'Antiácido / Protector Gástrico',
        droga_sugerida: 'Omeprazol / Esomeprazol / Hidróxido de Aluminio y Magnesio',
        publico: publicoMiembro,
        categoria: 'Digestivo / Antiácido / Antiespasmódico',
        stock_minimo_sugerido: 4,
        unidad_sugerida: 'comprimidos',
        keywords: ['omeprazol', 'esomeprazol', 'mylanta', 'rennie', 'alikal', 'uvasal', 'pantoprazol'],
        descripcion: `Acidez, gastritis o malestar estomacal recurrente (${miembro.nombre}).`,
      })
    }

    if (/(colico|panza|abdominal|menstrual|gases|meteorismo)/.test(textoClinico)) {
      if (edad.esPediatrico) {
        addIfNotExists({
          id: 'esc-fam-simeticona-pediatrico',
          nombre: 'Antiflatulento / Cólicos (Gotas)',
          droga_sugerida: 'Simeticona',
          publico: 'pediatrico',
          categoria: 'Digestivo / Antiácido / Antiespasmódico',
          stock_minimo_sugerido: 1,
          unidad_sugerida: 'gotas',
          keywords: ['factor ag', 'simeticona', 'mylicon', 'colicos'],
          descripcion: `Gases y cólicos abdominales (${miembro.nombre}).`,
        })
      } else {
        addIfNotExists({
          id: 'esc-fam-antiespasmodico-adulto',
          nombre: 'Antiespasmódico Abdominal',
          droga_sugerida: 'Hioscina (Buscapina) / Propinox (Sertal)',
          publico: 'adulto',
          categoria: 'Digestivo / Antiácido / Antiespasmódico',
          stock_minimo_sugerido: 4,
          unidad_sugerida: 'comprimidos',
          keywords: ['buscapina', 'sertal', 'hioscina', 'propinox'],
          descripcion: `Dolor de panza, cólicos o espasmos (${miembro.nombre}).`,
        })
      }
    }

    if (/(asma|broncoespasmo|bronquiolitis|sibilancia|ahogo|tos)/.test(textoClinico)) {
      addIfNotExists({
        id: `esc-fam-broncodilatador-${publicoMiembro}`,
        nombre: 'Broncodilatador / Rescate Respiratorio',
        droga_sugerida: 'Salbutamol / Budesonide',
        publico: publicoMiembro,
        categoria: 'Resfrío / Tos / Vías Respiratorias',
        stock_minimo_sugerido: 1,
        unidad_sugerida: 'disparos',
        keywords: ['salbutamol', 'ventolin', 'budesonide', 'neumotex', 'paf'],
        descripcion: `Antecedentes de broncoespasmo, asma o tos obstructiva (${miembro.nombre}).`,
      })
    }

    if (/(otitis|oido)/.test(textoClinico)) {
      addIfNotExists({
        id: `esc-fam-otico-${publicoMiembro}`,
        nombre: 'Gotas Óticas (Dolor / Inflamación de Oído)',
        droga_sugerida: 'Ciprofloxacina + Hidrocortisona / Antipirina + Benzocaína',
        publico: publicoMiembro,
        categoria: 'Otro',
        stock_minimo_sugerido: 1,
        unidad_sugerida: 'gotas',
        keywords: ['otic', 'otex', 'valmax', 'ciriax otic', 'sincerum', 'oido'],
        descripcion: `Dolor de oído u otitis recurrente (${miembro.nombre}).`,
      })
    }

    if (/(rinitis|alergia|urticaria|dermatitis|picazon|atopia)/.test(textoClinico)) {
      addIfNotExists({
        id: `esc-fam-alergia-especifica-${publicoMiembro}`,
        nombre:
          publicoMiembro === 'pediatrico'
            ? 'Antialérgico Jarabe / Gotas Pediátrico'
            : 'Antihistamínico de 2da Generación (Sin sueño)',
        droga_sugerida: 'Desloratadina / Cetirizina / Loratadina',
        publico: publicoMiembro,
        categoria: 'Antialérgico / Antihistamínico',
        stock_minimo_sugerido: 1,
        unidad_sugerida: publicoMiembro === 'pediatrico' ? 'ml' : 'comprimidos',
        keywords: ['aerius', 'alerpriv', 'cetirizina', 'desloratadina', 'loratadina', 'hexaler'],
        descripcion: `Alergias, rinitis o brotes cutáneos (${miembro.nombre}).`,
      })
    }

    if (/(garganta|faringitis|angina|disfonia)/.test(textoClinico) && !edad.esPediatrico) {
      addIfNotExists({
        id: 'esc-fam-antiseptico-faringeo',
        nombre: 'Caramelos / Spray Antiséptico y Analgésico de Garganta',
        droga_sugerida: 'Bencidamina / Benzocaína / Gramicidina',
        publico: 'adulto',
        categoria: 'Resfrío / Tos / Vías Respiratorias',
        stock_minimo_sugerido: 4,
        unidad_sugerida: 'comprimidos',
        keywords: ['strepsils', 'atenol', 'anginovag', 'biocord', 'refrianex', 'garganta'],
        descripcion: `Dolor de garganta o faringitis recurrente (${miembro.nombre}).`,
      })
    }
  }

  return { nuevos, listaActualizada: lista }
}

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
