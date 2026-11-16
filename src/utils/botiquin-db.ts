import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createAdminClient } from './supabase/admin'
import {
  AlertaLog,
  BotiquinConfig,
  BotiquinState,
  ConsultaHistorialItem,
  Medicamento,
  MiembroFamilia,
  MovimientoStock,
  ProductoEsencial,
} from './botiquin-types'

export * from './botiquin-types'

export const TABLE_STOCK = 'botiquin-stock'
export const TABLE_FAMILIARES = 'botiquin-familiares'
export const TABLE_ESENCIALES = 'botiquin-esenciales'
export const TABLE_MOVIMIENTOS = 'botiquin-movimientos'
export const TABLE_HISTORIAL = 'botiquin-historial'
export const TABLE_ALERTAS = 'botiquin-alertas'
export const TABLE_CONFIG = 'botiquin-config'

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
    familia: [],
    consultas_historial: [],
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

async function loadStorageBackupState(): Promise<Partial<BotiquinState> | null> {
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(STORAGE_STATE_PATH)
    if (!error && data) {
      const text = await data.text()
      return JSON.parse(text) as Partial<BotiquinState>
    }
  } catch {
    // ignore
  }

  if (fs.existsSync(LOCAL_STATE_FILE)) {
    try {
      const raw = fs.readFileSync(LOCAL_STATE_FILE, 'utf8')
      return JSON.parse(raw) as Partial<BotiquinState>
    } catch {
      // ignore
    }
  }

  return null
}

export async function loadBotiquinState(): Promise<BotiquinState> {
  const supabase = createAdminClient()

  try {
    const { data: meds, error: medsError } = await supabase
      .from(TABLE_STOCK)
      .select('*')
      .order('created_at', { ascending: false })

    if (!medsError && meds !== null) {
      const [famRes, escRes, movRes, histRes, cfgRes, logRes] = await Promise.all([
        supabase.from(TABLE_FAMILIARES).select('*').order('created_at', { ascending: true }),
        supabase.from(TABLE_ESENCIALES).select('*').order('nombre', { ascending: true }),
        supabase
          .from(TABLE_MOVIMIENTOS)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from(TABLE_HISTORIAL)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from(TABLE_CONFIG).select('*').eq('id', 'default').maybeSingle(),
        supabase
          .from(TABLE_ALERTAS)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      let medicamentos = (meds as Medicamento[]).map(normalizeMedicamento)
      let familia = (famRes.data as MiembroFamilia[]) || []
      let esenciales = (escRes.data as ProductoEsencial[]) || []
      let movimientos = (movRes.data as MovimientoStock[]) || []
      let consultas_historial = (histRes.data as ConsultaHistorialItem[]) || []
      let config = (cfgRes.data as BotiquinConfig) || null
      let alertas_log = (logRes.data as AlertaLog[]) || []

      // Automatic migration from Storage backup whenever SQL stock table is empty but Storage has data
      if (medicamentos.length === 0) {
        const backup = await loadStorageBackupState()
        if (
          backup &&
          ((backup.medicamentos && backup.medicamentos.length > 0) ||
            (backup.familia && backup.familia.length > 0) ||
            (backup.movimientos && backup.movimientos.length > 0))
        ) {
          medicamentos = (backup.medicamentos || []).map(normalizeMedicamento)
          if (familia.length === 0 && backup.familia?.length) {
            familia = backup.familia
          }
          if (esenciales.length === 0 && backup.esenciales?.length) {
            esenciales = backup.esenciales
          } else if (esenciales.length === 0) {
            esenciales = DEFAULT_ESENCIALES
          }
          if (movimientos.length === 0 && backup.movimientos?.length) {
            movimientos = backup.movimientos
          }
          if (consultas_historial.length === 0 && backup.consultas_historial?.length) {
            consultas_historial = backup.consultas_historial
          }
          if (!config && backup.config) {
            config = { ...DEFAULT_CONFIG, ...backup.config }
          }
          if (alertas_log.length === 0 && backup.alertas_log?.length) {
            alertas_log = backup.alertas_log
          }

          const migratedState: BotiquinState = {
            medicamentos,
            familia,
            esenciales,
            movimientos,
            consultas_historial,
            config: config || DEFAULT_CONFIG,
            alertas_log,
          }
          await syncSqlTables(migratedState)
          saveLocalMirror(migratedState)
          return migratedState
        }
      }

      if (esenciales.length === 0) {
        esenciales = DEFAULT_ESENCIALES
        await supabase.from(TABLE_ESENCIALES).upsert(DEFAULT_ESENCIALES, { onConflict: 'id' })
      }

      if (!config) {
        config = DEFAULT_CONFIG
        await supabase.from(TABLE_CONFIG).upsert(DEFAULT_CONFIG, { onConflict: 'id' })
      }

      const state: BotiquinState = {
        medicamentos,
        esenciales,
        movimientos,
        config,
        alertas_log,
        familia,
        consultas_historial,
      }

      saveLocalMirror(state)
      return state
    }
  } catch {
    // SQL tables not created yet -> fallback to Storage JSON
  }

  try {
    await ensureBucketExists()
    const parsed = await loadStorageBackupState()
    if (parsed) {
      const state: BotiquinState = {
        medicamentos: (parsed.medicamentos || []).map(normalizeMedicamento),
        esenciales:
          parsed.esenciales && parsed.esenciales.length > 0
            ? parsed.esenciales
            : DEFAULT_ESENCIALES,
        movimientos: parsed.movimientos || [],
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        alertas_log: parsed.alertas_log || [],
        familia: parsed.familia || [],
        consultas_historial: parsed.consultas_historial || [],
      }
      saveLocalMirror(state)
      return state
    }
  } catch (e) {
    console.warn('Fallback to local mirror while loading state:', e)
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

async function syncSqlTables(state: BotiquinState): Promise<void> {
  const supabase = createAdminClient()
  try {
    const { error: checkErr } = await supabase
      .from(TABLE_CONFIG)
      .upsert(state.config, { onConflict: 'id' })

    if (!checkErr) {
      if (state.medicamentos.length > 0) {
        await supabase.from(TABLE_STOCK).upsert(state.medicamentos, { onConflict: 'id' })
      }
      if ((state.familia || []).length > 0) {
        await supabase.from(TABLE_FAMILIARES).upsert(state.familia, { onConflict: 'id' })
      }
      if (state.esenciales.length > 0) {
        await supabase.from(TABLE_ESENCIALES).upsert(state.esenciales, { onConflict: 'id' })
      }
      if (state.movimientos.length > 0) {
        await supabase
          .from(TABLE_MOVIMIENTOS)
          .upsert(state.movimientos.slice(0, 100), { onConflict: 'id' })
      }
      if ((state.consultas_historial || []).length > 0) {
        await supabase
          .from(TABLE_HISTORIAL)
          .upsert(state.consultas_historial.slice(0, 100), { onConflict: 'id' })
      }
      if (state.alertas_log.length > 0) {
        await supabase
          .from(TABLE_ALERTAS)
          .upsert(state.alertas_log.slice(0, 100), { onConflict: 'id' })
      }
    }
  } catch {
    // SQL tables not created yet
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

  await syncSqlTables(state)
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
