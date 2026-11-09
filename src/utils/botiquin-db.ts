import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createAdminClient } from './supabase/admin'
import {
  AlertaLog,
  BotiquinConfig,
  BotiquinState,
  Medicamento,
  MovimientoStock,
  ProductoEsencial,
} from './botiquin-types'

export * from './botiquin-types'

export const DEFAULT_ESENCIALES: ProductoEsencial[] = [
  {
    id: 'esc-paracetamol-adulto',
    nombre: 'Paracetamol Adultos (500mg / 1g)',
    droga_sugerida: 'Paracetamol',
    publico: 'adulto',
    categoria: 'Analgésico / Antifebril',
    stock_minimo_sugerido: 4,
    unidad_sugerida: 'comprimidos',
    keywords: ['paracetamol', 'tafirol', 'mejoral', 'geniol'],
    descripcion: 'Fiebre, dolor de cabeza y malestar general en adultos.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-ibuprofeno-adulto',
    nombre: 'Ibuprofeno / Antiinflamatorio Adultos (400mg / 600mg)',
    droga_sugerida: 'Ibuprofeno / Diclofenac',
    publico: 'adulto',
    categoria: 'Antiinflamatorio / Muscular',
    stock_minimo_sugerido: 4,
    unidad_sugerida: 'comprimidos',
    keywords: ['ibuprofeno', 'actron', 'ibupirac', 'diclofenac', 'ketorolac', 'naproxeno'],
    descripcion: 'Dolor muscular, dolor de espalda, inflamación y dolores articulares en adultos.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-paracetamol-pediatrico',
    nombre: 'Paracetamol Pediátrico (Gotas / Jarabe)',
    droga_sugerida: 'Paracetamol Pediátrico',
    publico: 'pediatrico',
    categoria: 'Analgésico / Antifebril',
    stock_minimo_sugerido: 10,
    unidad_sugerida: 'ml',
    keywords: ['paracetamol', 'tafirolito', 'termofren', 'febratic'],
    descripcion: 'Antifebril y analgésico de primera línea para bebés y niños.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-ibuprofeno-pediatrico',
    nombre: 'Ibuprofeno Pediátrico Suspensión (2% o 4%)',
    droga_sugerida: 'Ibuprofeno Pediátrico',
    publico: 'pediatrico',
    categoria: 'Analgésico / Antifebril',
    stock_minimo_sugerido: 15,
    unidad_sugerida: 'ml',
    keywords: ['ibuprofeno', 'ibupirac', 'actron pediatrico', 'febratic'],
    descripcion: 'Fiebre alta, dolor de oído/garganta e inflamación en bebés (>6 meses) y niños.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-sales-rehidratacion',
    nombre: 'Sales de Rehidratación Oral',
    droga_sugerida: 'Sales de Rehidratación OMS',
    publico: 'ambos',
    categoria: 'Rehidratación / Diarrea',
    stock_minimo_sugerido: 2,
    unidad_sugerida: 'sobres',
    keywords: ['sales de rehidratacion', 'rehidratacion', 'pedialyte', 'suero oral'],
    descripcion: 'Fundamental ante vómitos repetidos o diarrea en bebés y adultos para evitar deshidratación.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-antiemetico',
    nombre: 'Antiemético (Vómitos y Náuseas)',
    droga_sugerida: 'Metoclopramida / Ondansetrón / Domperidona',
    publico: 'ambos',
    categoria: 'Antiemético / Vómitos y Náuseas',
    stock_minimo_sugerido: 1,
    unidad_sugerida: 'unidades',
    keywords: ['reliveran', 'metoclopramida', 'ondansetron', 'dramamine', 'domperidona', 'vomito'],
    descripcion: 'Control de náuseas y vómitos (en bebés usar siempre bajo indicación pediátrica).',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-antialergico',
    nombre: 'Antialérgico / Antihistamínico',
    droga_sugerida: 'Desloratadina / Loratadina / Cetirizina / Difenhidramina',
    publico: 'ambos',
    categoria: 'Antialérgico / Antihistamínico',
    stock_minimo_sugerido: 1,
    unidad_sugerida: 'unidades',
    keywords: ['desloratadina', 'loratadina', 'cetirizina', 'benadryl', 'alergia', 'aerius', 'alerpriv'],
    descripcion: 'Reacciones alérgicas, brotes en piel, picaduras o rinitis.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-digestivo-antiespasmodico',
    nombre: 'Antiespasmódico / Protector Gástrico',
    droga_sugerida: 'Hioscina (Buscapina) / Propinox (Sertal) / Omeprazol',
    publico: 'adulto',
    categoria: 'Digestivo / Antiácido / Antiespasmódico',
    stock_minimo_sugerido: 2,
    unidad_sugerida: 'comprimidos',
    keywords: ['buscapina', 'sertal', 'omeprazol', 'mylanta', 'rennie', 'alikal', 'hioscina'],
    descripcion: 'Cólicos, dolor abdominal, espasmos digestivos o acidez.',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'esc-antiseptico',
    nombre: 'Antiséptico / Desinfectante de Heridas',
    droga_sugerida: 'Iodopovidona (Pervinox) / Clorhexidina / Agua Oxigenada',
    publico: 'ambos',
    categoria: 'Primeros Auxilios / Antiséptico',
    stock_minimo_sugerido: 1,
    unidad_sugerida: 'unidades',
    keywords: ['pervinox', 'iodopovidona', 'clorhexidina', 'merthiolate', 'antiseptico', 'alcohol'],
    descripcion: 'Limpieza y desinfección de heridas, cortes y raspaduras.',
    activo: true,
    created_at: new Date().toISOString(),
  },
]

export const DEFAULT_CONFIG: BotiquinConfig = {
  id: 'default',
  email_alertas: process.env.ALERT_RECIPIENT_EMAIL || 'aeterzano@gmail.com',
  dias_proximo_vencer: 30,
  alertar_proximo_vencer: true,
  alertar_vencido: true,
  alertar_esencial_faltante: true,
  alertar_sin_stock: true,
  updated_at: new Date().toISOString(),
}

const LOCAL_DATA_DIR = path.join(process.cwd(), 'data')
const LOCAL_STATE_FILE = path.join(LOCAL_DATA_DIR, 'botiquin_state.json')
const BUCKET_NAME = 'botiquin'
const STORAGE_STATE_PATH = 'db/botiquin_state.json'

function getInitialState(): BotiquinState {
  return {
    medicamentos: [],
    esenciales: DEFAULT_ESENCIALES,
    movimientos: [],
    config: DEFAULT_CONFIG,
    alertas_log: [],
  }
}

async function ensureBucketExists() {
  try {
    const supabase = createAdminClient()
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.some((b) => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true })
    }
  } catch (e) {
    console.warn('Could not verify/create Supabase bucket:', e)
  }
}

export async function loadBotiquinState(): Promise<BotiquinState> {
  const supabase = createAdminClient()

  try {
    const { data: meds, error: medsError } = await supabase
      .from('botiquin_medicamentos')
      .select('*')
      .order('created_at', { ascending: false })

    if (!medsError && meds !== null) {
      const [escRes, movRes, cfgRes, logRes] = await Promise.all([
        supabase.from('botiquin_esenciales').select('*').order('nombre', { ascending: true }),
        supabase
          .from('botiquin_movimientos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('botiquin_config').select('*').eq('id', 'default').maybeSingle(),
        supabase
          .from('botiquin_alertas_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      let esenciales = (escRes.data as ProductoEsencial[]) || []
      if (esenciales.length === 0) {
        esenciales = DEFAULT_ESENCIALES
        await supabase.from('botiquin_esenciales').upsert(DEFAULT_ESENCIALES)
      }

      let config = (cfgRes.data as BotiquinConfig) || null
      if (!config) {
        config = DEFAULT_CONFIG
        await supabase.from('botiquin_config').upsert(DEFAULT_CONFIG)
      }

      const state: BotiquinState = {
        medicamentos: (meds as Medicamento[]).map(normalizeMedicamento),
        esenciales,
        movimientos: (movRes.data as MovimientoStock[]) || [],
        config,
        alertas_log: (logRes.data as AlertaLog[]) || [],
      }

      saveLocalMirror(state)
      return state
    }
  } catch {
    // SQL tables not created yet
  }

  try {
    await ensureBucketExists()
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(STORAGE_STATE_PATH)
    if (!error && data) {
      const text = await data.text()
      const parsed = JSON.parse(text) as Partial<BotiquinState>
      const state: BotiquinState = {
        medicamentos: (parsed.medicamentos || []).map(normalizeMedicamento),
        esenciales:
          parsed.esenciales && parsed.esenciales.length > 0
            ? parsed.esenciales
            : DEFAULT_ESENCIALES,
        movimientos: parsed.movimientos || [],
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        alertas_log: parsed.alertas_log || [],
      }
      saveLocalMirror(state)
      return state
    }
  } catch (e) {
    console.warn('Fallback to local mirror while loading state:', e)
  }

  if (fs.existsSync(LOCAL_STATE_FILE)) {
    try {
      const raw = fs.readFileSync(LOCAL_STATE_FILE, 'utf8')
      const parsed = JSON.parse(raw) as Partial<BotiquinState>
      return {
        medicamentos: (parsed.medicamentos || []).map(normalizeMedicamento),
        esenciales:
          parsed.esenciales && parsed.esenciales.length > 0
            ? parsed.esenciales
            : DEFAULT_ESENCIALES,
        movimientos: parsed.movimientos || [],
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        alertas_log: parsed.alertas_log || [],
      }
    } catch {
      // ignore
    }
  }

  const initial = getInitialState()
  await saveBotiquinState(initial)
  return initial
}

function normalizeMedicamento(m: Medicamento): Medicamento {
  const fotosArray = Array.isArray(m.fotos_urls)
    ? m.fotos_urls.filter(Boolean)
    : m.foto_url
    ? [m.foto_url]
    : []
  return {
    ...m,
    cantidad_actual: Number(m.cantidad_actual ?? 0),
    cantidad_inicial: Number(m.cantidad_inicial ?? 0),
    stock_minimo: Number(m.stock_minimo ?? 0),
    foto_url: m.foto_url || fotosArray[0] || null,
    fotos_urls: fotosArray,
    es_esencial: Boolean(m.es_esencial),
    estado: m.estado || 'activo',
  }
}

function saveLocalMirror(state: BotiquinState) {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch (e) {
    console.warn('Could not write local state mirror:', e)
  }
}

export async function saveBotiquinState(state: BotiquinState): Promise<void> {
  saveLocalMirror(state)

  const supabase = createAdminClient()

  try {
    await ensureBucketExists()
    const payload = Buffer.from(JSON.stringify(state, null, 2), 'utf8')
    await supabase.storage.from(BUCKET_NAME).upload(STORAGE_STATE_PATH, payload, {
      contentType: 'application/json',
      upsert: true,
    })
  } catch (e) {
    console.error('Error saving state to Supabase Storage:', e)
  }

  try {
    const { error: checkErr } = await supabase
      .from('botiquin_config')
      .upsert(state.config, { onConflict: 'id' })
    if (!checkErr) {
      if (state.medicamentos.length > 0) {
        await supabase.from('botiquin_medicamentos').upsert(state.medicamentos, { onConflict: 'id' })
      }
      if (state.esenciales.length > 0) {
        await supabase.from('botiquin_esenciales').upsert(state.esenciales, { onConflict: 'id' })
      }
      if (state.movimientos.length > 0) {
        await supabase
          .from('botiquin_movimientos')
          .upsert(state.movimientos.slice(0, 50), { onConflict: 'id' })
      }
      if (state.alertas_log.length > 0) {
        await supabase
          .from('botiquin_alertas_log')
          .upsert(state.alertas_log.slice(0, 50), { onConflict: 'id' })
      }
    }
  } catch {
    // SQL tables not created yet
  }
}

export async function uploadMedicationPhoto(
  base64DataUrl: string,
  fileNameHint = 'medicamento.jpg'
): Promise<string | null> {
  if (!base64DataUrl) return null
  if (base64DataUrl.startsWith('http://') || base64DataUrl.startsWith('https://')) {
    return base64DataUrl
  }

  try {
    const supabase = createAdminClient()
    await ensureBucketExists()

    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/)
    const mimeType = match ? match[1] : 'image/jpeg'
    const base64Clean = match ? match[2] : base64DataUrl
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const safeName = fileNameHint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    const objectPath = `fotos/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}.${ext}`

    const buffer = Buffer.from(base64Clean, 'base64')
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: true,
    })

    if (error) {
      console.error('Error uploading photo to Supabase Storage:', error)
      return base64DataUrl
    }

    const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath)
    return pubData.publicUrl
  } catch (e) {
    console.error('Exception uploading photo:', e)
    return base64DataUrl
  }
}
