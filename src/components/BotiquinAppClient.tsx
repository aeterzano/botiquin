'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  HeartPulse,
  Package,
  Bot,
  Star,
  Bell,
  Plus,
  Search,
  Camera,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  Trash2,
  Edit3,
  Send,
  Baby,
  User,
  Users,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Loader2,
  ShoppingBag,
  ShieldAlert,
  Pill,
  Droplets,
  Info,
  Images,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  AlertaActiva,
  BotiquinConfig,
  BotiquinState,
  calcularDiasVencimiento,
  calcularStockMinimoPorDefecto,
  esProductoConsideradoEsencial,
  CATEGORIAS_MEDICAMENTOS,
  esMedicamentoProximoAVencer,
  esMedicamentoVencido,
  Medicamento,
  MotivoBaja,
  ProductoEsencial,
  PublicoObjetivo,
  UnidadMedida,
  verificarCoberturaEsencial,
} from '@/utils/botiquin-types'
import { CampoFaltanteIA, ConsultaAIResponse } from '@/utils/ai-botiquin'

type TabType = 'stock' | 'consulta' | 'esenciales' | 'alertas'
type ModoCargaMed = 'hibrido_ia' | 'manual'
type MedModalTab = 'general' | 'stock' | 'uso'

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  pacienteTipo?: string
  edadPeso?: string
  aiData?: ConsultaAIResponse
  timestamp: string
}

const UNIDADES_OPTIONS: { value: UnidadMedida; label: string }[] = [
  { value: 'comprimidos', label: 'Comprimidos / Pastillas' },
  { value: 'ml', label: 'Mililitros (ml - Jarabe/Suspensión)' },
  { value: 'gotas', label: 'Gotas (ml)' },
  { value: 'sobres', label: 'Sobres' },
  { value: 'ampollas', label: 'Ampollas' },
  { value: 'g', label: 'Gramos (g - Crema/Pomada)' },
  { value: 'disparos', label: 'Disparos / Spray' },
  { value: 'unidades', label: 'Unidades' },
]

function formatMesAnio(fecha: string | null | undefined): string {
  if (!fecha) return '-'
  const parts = fecha.split('-')
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`
  }
  return fecha
}

function formatEspacioMedida(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto.replace(/(\d+(?:[.,]\d+)?)\s*(mg|ml|g|mcg|ug|ui|l|kg|cm3|cc)\b/gi, '$1 $2')
}

function resumirSintomas(texto: string | null | undefined): string {
  if (!texto) return ''
  let t = texto.trim()
  const prefixes = [
    /^se\s+utiliza\s+para\s+(el\s+)?(alivio\s+(sintom[aá]tico\s+)?(de|del|de\s+la|de\s+los|de\s+las)\s+)?/i,
    /^indicado\s+para\s+(el\s+)?(tratamiento\s+(y\s+alivio\s+)?(de|del|de\s+la|de\s+los|de\s+las)\s+)?/i,
    /^alivio\s+(sintom[aá]tico\s+)?(temporal\s+)?(de|del|de\s+la|de\s+los|de\s+las)\s+/i,
    /^tratamiento\s+(sintom[aá]tico\s+)?(de|del|de\s+la|de\s+los|de\s+las)\s+/i,
    /^sirve\s+para\s+(tratar\s+|aliviar\s+)?(el\s+|la\s+|los\s+|las\s+)?/i,
    /^para\s+(el\s+)?(alivio\s+de\s+|tratar\s+)?/i,
  ]
  for (const rx of prefixes) {
    t = t.replace(rx, '')
  }
  t = t.replace(/\.$/, '').trim()
  if (!t) return texto
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function formatCategoriaEsencial(esc: ProductoEsencial): string {
  return esc.nombre.replace(/\s*\([^)]*\)/g, '').trim() || esc.categoria
}

function formatPrincipalActivoEsencial(esc: ProductoEsencial): string {
  return (esc.droga_sugerida || '-')
    .replace(/\s+Pedi[aá]trico/gi, '')
    .replace(/\s+Adultos?/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
}

function formatSintomasEsencial(esc: ProductoEsencial): string {
  if (!esc.descripcion) return '-'
  return esc.descripcion
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+en\s+(beb[eé]s|ni[ñn]os|adultos).*$/i, '')
    .replace(/\.$/, '')
    .trim()
}

function formatMarcasSugeridas(esc: ProductoEsencial): string {
  const genericWords = new Set(
    `${esc.droga_sugerida} ${esc.nombre} ${esc.categoria} pediatrico adulto adultos sales de rehidratacion oral suero vomito alergia antiseptico alcohol`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  )

  const marcas = esc.keywords
    .map((kw) => kw.trim())
    .filter((kw) => {
      const norm = kw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      return norm && !genericWords.has(norm)
    })
    .map((kw) => kw.charAt(0).toUpperCase() + kw.slice(1))

  const list =
    marcas.length > 0
      ? marcas
      : esc.keywords.map((kw) => kw.trim().charAt(0).toUpperCase() + kw.trim().slice(1))

  return list.join(', ') || '-'
}

function renderInlineBold(text: string): React.ReactNode {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <React.Fragment key={idx}>{part.replace(/\*\*/g, '')}</React.Fragment>
  })
}

function renderFormattedChatText(text: string): React.ReactNode {
  if (!text) return null
  const lines = text.split('\n')
  return lines.map((rawLine, lineIdx) => {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      return <div key={lineIdx} className="h-2" />
    }
    const isBullet = /^([*-])\s+/.test(trimmed)
    const cleanLine = isBullet ? trimmed.replace(/^([*-])\s+/, '') : rawLine
    return (
      <div key={lineIdx} className={isBullet ? 'flex items-start gap-2 pl-1 my-0.5' : ''}>
        {isBullet && <span className="text-primary font-bold select-none">•</span>}
        <span className="flex-1">{renderInlineBold(cleanLine)}</span>
      </div>
    )
  })
}

async function compressImageFile(file: File, maxWidth = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(ev.target?.result as string)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = ev.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function BotiquinAppClient({
  userEmail,
  initialState,
  initialAlertas,
}: {
  userEmail: string
  initialState: BotiquinState
  initialAlertas: AlertaActiva[]
}) {
  const [state, setState] = useState<BotiquinState>(initialState)
  const [, setAlertas] = useState<AlertaActiva[]>(initialAlertas)
  const [activeTab, setActiveTab] = useState<TabType>('stock')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null
  )

  // Stock filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPublico, setFilterPublico] = useState<'todos' | PublicoObjetivo>('todos')
  const [filterEstado, setFilterEstado] = useState<
    'activos' | 'proximo_vencer' | 'vencidos_sin_stock' | 'bajas'
  >('activos')

  // Add / Edit Medication Modal (Compact with 3 Tabs)
  const [medModalOpen, setMedModalOpen] = useState(false)
  const [medModalTab, setMedModalTab] = useState<MedModalTab>('general')
  const [editingMed, setEditingMed] = useState<Medicamento | null>(null)
  const [modoCarga, setModoCarga] = useState<ModoCargaMed>('hibrido_ia')
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false)
  const [savingMed, setSavingMed] = useState(false)

  // Hybrid AI state tracking which fields came from AI and which ones were missing in the photo(s)
  const [, setAiDetectedFields] = useState<string[]>([])
  const [aiMissingFields, setAiMissingFields] = useState<CampoFaltanteIA[]>([])
  const [aiHybridMessage, setAiHybridMessage] = useState<string>('')
  const [stockMinimoTouched, setStockMinimoTouched] = useState<boolean>(false)

  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)

  const [medForm, setMedForm] = useState({
    nombre: '',
    droga: '',
    concentracion: '',
    publico: 'adulto' as PublicoObjetivo,
    categoria: CATEGORIAS_MEDICAMENTOS[0],
    unidad: 'comprimidos' as UnidadMedida,
    cantidad_actual: 10,
    cantidad_inicial: 10,
    stock_minimo: 0,
    fecha_vencimiento: '',
    para_que_sirve: '',
    posologia_referencia: '',
    notas: '',
    fotos_input: [] as string[],
    es_esencial: false,
    esencial_id: '',
  })

  // Consume Dose Modal
  const [dosisModalMed, setDosisModalMed] = useState<Medicamento | null>(null)
  const [dosisCantidad, setDosisCantidad] = useState<number>(1)
  const [dosisMotivo, setDosisMotivo] = useState<string>('')
  const [submittingDosis, setSubmittingDosis] = useState(false)

  // Reponer Stock Modal
  const [reponerModalMed, setReponerModalMed] = useState<Medicamento | null>(null)
  const [reponerCantidad, setReponerCantidad] = useState<number>(10)
  const [reponerVencimiento, setReponerVencimiento] = useState<string>('')
  const [submittingReponer, setSubmittingReponer] = useState(false)

  // Dar de Baja Modal
  const [bajaModalMed, setBajaModalMed] = useState<Medicamento | null>(null)
  const [bajaMotivo, setBajaMotivo] = useState<MotivoBaja>('vencido')
  const [bajaDetalle, setBajaDetalle] = useState<string>('')
  const [submittingBaja, setSubmittingBaja] = useState(false)

  // Multi-Photo Lightbox
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number>(0)

  // Consultorio IA state (Edad & Peso separated and numeric)
  const [chatInput, setChatInput] = useState('')
  const [pacienteTipo, setPacienteTipo] = useState<'auto' | 'adulto' | 'pediatrico'>('auto')
  const [pacienteEdad, setPacienteEdad] = useState('')
  const [pacientePeso, setPacientePeso] = useState('')
  const [consultingAI, setConsultingAI] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([])

  // Esenciales Modal state
  const [esencialModalOpen, setEsencialModalOpen] = useState(false)
  const [editingEsencial, setEditingEsencial] = useState<ProductoEsencial | null>(null)
  const [esencialForm, setEsencialForm] = useState({
    id: '',
    nombre: '',
    droga_sugerida: '',
    publico: 'ambos' as PublicoObjetivo,
    categoria: CATEGORIAS_MEDICAMENTOS[0],
    stock_minimo_sugerido: 1,
    unidad_sugerida: 'unidades' as UnidadMedida,
    keywords: '',
    descripcion: '',
    activo: true,
  })

  // Alertas & Config state
  const [configForm, setConfigForm] = useState<BotiquinConfig>(initialState.config)
  const [savingConfig, setSavingConfig] = useState(false)

  // Sorted Esenciales: 1st pediatrico (bebé), 2nd ambos (familia), 3rd adulto (adultos)
  const sortedEsenciales = useMemo(() => {
    const orderMap: Record<PublicoObjetivo, number> = {
      pediatrico: 0,
      ambos: 1,
      adulto: 2,
    }
    return [...state.esenciales].sort((a, b) => {
      const diff = (orderMap[a.publico] ?? 9) - (orderMap[b.publico] ?? 9)
      if (diff !== 0) return diff
      return a.nombre.localeCompare(b.nombre, 'es')
    })
  }, [state.esenciales])

  // Sync activeTab with URL query param (?tab=stock|consulta|esenciales|alertas)
  useEffect(() => {
    function syncTabFromUrl() {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (
        tabParam === 'stock' ||
        tabParam === 'consulta' ||
        tabParam === 'esenciales' ||
        tabParam === 'alertas'
      ) {
        setActiveTab(tabParam)
      }
    }
    syncTabFromUrl()
    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
  }, [])

  function handleTabNavClick(e: React.MouseEvent<HTMLAnchorElement>, tab: TabType) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
      return
    }
    e.preventDefault()
    setActiveTab(tab)
    const url = tab === 'stock' ? '/' : `/?tab=${tab}`
    window.history.pushState(null, '', url)
  }

  // Close any open pop-up when pressing ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (lightboxPhotos.length > 0) {
          setLightboxPhotos([])
          return
        }
        if (dosisModalMed) {
          setDosisModalMed(null)
          return
        }
        if (reponerModalMed) {
          setReponerModalMed(null)
          return
        }
        if (bajaModalMed) {
          setBajaModalMed(null)
          return
        }
        if (esencialModalOpen) {
          setEsencialModalOpen(false)
          return
        }
        if (medModalOpen) {
          setMedModalOpen(false)
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    lightboxPhotos.length,
    dosisModalMed,
    reponerModalMed,
    bajaModalMed,
    esencialModalOpen,
    medModalOpen,
  ])

  function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ text, type })
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev))
    }, 4500)
  }

  function isFieldMissingFromAI(fieldName: string): boolean {
    if (!aiMissingFields.some((f) => f.campo === fieldName)) return false
    if (fieldName === 'nombre' && medForm.nombre.trim()) return false
    if (fieldName === 'droga' && medForm.droga.trim()) return false
    if (fieldName === 'concentracion' && medForm.concentracion.trim()) return false
    if (fieldName === 'fecha_vencimiento' && medForm.fecha_vencimiento.trim()) return false
    return true
  }

  function clearFieldMissingFlag(fieldName: string) {
    setAiMissingFields((prev) => prev.filter((f) => f.campo !== fieldName))
  }

  // KPI calculations
  const kpis = useMemo(() => {
    const activos = state.medicamentos.filter((m) => m.estado === 'activo')
    const umbral = state.config.dias_proximo_vencer || 30

    const conStockVigentes = activos.filter(
      (m) => m.cantidad_actual > 0 && !esMedicamentoVencido(m)
    )
    const pediatricosCount = conStockVigentes.filter(
      (m) => m.publico === 'pediatrico' || m.publico === 'ambos'
    ).length
    const adultosCount = conStockVigentes.filter(
      (m) => m.publico === 'adulto' || m.publico === 'ambos'
    ).length

    const proximosCount = activos.filter((m) => esMedicamentoProximoAVencer(m, umbral)).length
    const vencidosCount = activos.filter((m) => esMedicamentoVencido(m)).length
    const sinStockCount = activos.filter((m) => m.cantidad_actual <= 0).length

    const esencialesActivos = state.esenciales.filter((e) => e.activo)
    const esencialesCubiertos = esencialesActivos.filter(
      (e) => verificarCoberturaEsencial(e, state.medicamentos).cubierto
    ).length

    return {
      totalVigentes: conStockVigentes.length,
      pediatricosCount,
      adultosCount,
      proximosCount,
      vencidosCount,
      sinStockCount,
      esencialesCubiertos,
      esencialesTotal: esencialesActivos.length,
    }
  }, [state])

  // Filtered medications list
  const filteredMeds = useMemo(() => {
    const umbral = state.config.dias_proximo_vencer || 30
    return state.medicamentos.filter((med) => {
      if (filterEstado === 'bajas') {
        if (med.estado !== 'baja') return false
      } else {
        if (med.estado !== 'activo') return false
        if (filterEstado === 'proximo_vencer' && !esMedicamentoProximoAVencer(med, umbral))
          return false
        if (
          filterEstado === 'vencidos_sin_stock' &&
          !esMedicamentoVencido(med) &&
          med.cantidad_actual > 0
        )
          return false
      }

      if (filterPublico !== 'todos') {
        if (med.publico !== filterPublico && med.publico !== 'ambos') return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const haystack =
          `${med.nombre} ${med.droga} ${med.concentracion} ${med.categoria} ${med.para_que_sirve} ${med.notas}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }, [state.medicamentos, state.config.dias_proximo_vencer, filterEstado, filterPublico, searchQuery])

  function updateMedFormAutoStock(
    patch: Partial<typeof medForm>,
    forceRecalc = false
  ) {
    setMedForm((prev) => {
      const next = { ...prev, ...patch }
      if ((!editingMed && !stockMinimoTouched) || forceRecalc) {
        const esEsencial = esProductoConsideradoEsencial(next, state.esenciales)
        next.stock_minimo = calcularStockMinimoPorDefecto(next.cantidad_inicial, esEsencial)
      }
      return next
    })
  }

  // Open Modal to Add New Medication
  function openNewMedModal(
    prefill?: Partial<typeof medForm>,
    initialMode: ModoCargaMed = 'hibrido_ia'
  ) {
    setEditingMed(null)
    setMedModalTab('general')
    setStockMinimoTouched(prefill?.stock_minimo !== undefined)
    setModoCarga(initialMode)
    setAiDetectedFields([])
    setAiMissingFields([])
    setAiHybridMessage('')
    setMedForm({
      nombre: prefill?.nombre || '',
      droga: prefill?.droga || '',
      concentracion: prefill?.concentracion || '',
      publico: prefill?.publico || 'adulto',
      categoria: prefill?.categoria || CATEGORIAS_MEDICAMENTOS[0],
      unidad: prefill?.unidad || 'comprimidos',
      cantidad_actual: prefill?.cantidad_actual ?? 10,
      cantidad_inicial: prefill?.cantidad_inicial ?? 10,
      stock_minimo:
        prefill?.stock_minimo ??
        calcularStockMinimoPorDefecto(
          prefill?.cantidad_inicial ?? 10,
          esProductoConsideradoEsencial(
            {
              nombre: prefill?.nombre || '',
              droga: prefill?.droga || '',
              para_que_sirve: prefill?.para_que_sirve || '',
              publico: prefill?.publico || 'adulto',
              es_esencial: prefill?.es_esencial ?? false,
              esencial_id: prefill?.esencial_id || '',
            },
            state.esenciales
          )
        ),
      fecha_vencimiento: prefill?.fecha_vencimiento || '',
      para_que_sirve: prefill?.para_que_sirve || '',
      posologia_referencia: prefill?.posologia_referencia || '',
      notas: prefill?.notas || '',
      fotos_input: prefill?.fotos_input || [],
      es_esencial: prefill?.es_esencial ?? false,
      esencial_id: prefill?.esencial_id || '',
    })
    setMedModalOpen(true)
  }

  // Open Modal to Edit Medication
  function openEditMedModal(med: Medicamento) {
    setEditingMed(med)
    setMedModalTab('general')
    setStockMinimoTouched(true)
    setModoCarga('hibrido_ia')
    setAiDetectedFields([])
    setAiMissingFields([])
    setAiHybridMessage('')
    const existingPhotos =
      med.fotos_urls && med.fotos_urls.length > 0
        ? med.fotos_urls
        : med.foto_url
        ? [med.foto_url]
        : []

    setMedForm({
      nombre: med.nombre,
      droga: med.droga,
      concentracion: med.concentracion,
      publico: med.publico,
      categoria: med.categoria,
      unidad: med.unidad,
      cantidad_actual: med.cantidad_actual,
      cantidad_inicial: med.cantidad_inicial,
      stock_minimo: med.stock_minimo,
      fecha_vencimiento: med.fecha_vencimiento || '',
      para_que_sirve: med.para_que_sirve,
      posologia_referencia: med.posologia_referencia,
      notas: med.notas,
      fotos_input: existingPhotos,
      es_esencial: med.es_esencial,
      esencial_id: med.esencial_id || '',
    })
    setMedModalOpen(true)
  }

  async function handleMultiplePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    try {
      const compressedList: string[] = []
      for (let i = 0; i < files.length; i++) {
        const b64 = await compressImageFile(files[i])
        compressedList.push(b64)
      }

      const updatedPhotos = [...medForm.fotos_input, ...compressedList]
      setMedForm((prev) => ({ ...prev, fotos_input: updatedPhotos }))
      e.target.value = ''

      if (modoCarga === 'hibrido_ia') {
        await analyzePhotosWithAI(updatedPhotos)
      } else {
        showToast(`${compressedList.length} foto(s) agregada(s).`, 'info')
      }
    } catch (err) {
      console.error('Error procesando imágenes:', err)
      showToast('No se pudieron procesar las imágenes seleccionadas', 'error')
    }
  }

  function handleRemovePhotoAtIndex(idx: number) {
    setMedForm((prev) => ({
      ...prev,
      fotos_input: prev.fotos_input.filter((_, i) => i !== idx),
    }))
  }

  async function analyzePhotosWithAI(photosOverride?: string[]) {
    const photos = photosOverride || medForm.fotos_input
    if (!photos || photos.length === 0) {
      showToast('Subí o sacá al menos 1 foto para analizar con IA', 'info')
      return
    }

    setAnalyzingPhoto(true)
    try {
      const res = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagesBase64: photos }),
      })
      const json = await res.json()
      if (!json.ok) {
        throw new Error(json.error || 'Error analizando las fotos')
      }

      const d = json.data
      setMedForm((prev) => {
        const nextCantInicial =
          d.cantidad_inicial !== null && d.cantidad_inicial !== undefined
            ? Number(d.cantidad_inicial)
            : prev.cantidad_inicial

        return {
          ...prev,
          nombre: formatEspacioMedida(d.nombre || prev.nombre),
          droga: formatEspacioMedida(d.droga || prev.droga),
          concentracion: formatEspacioMedida(d.concentracion || prev.concentracion),
          publico: d.publico || prev.publico,
          categoria: d.categoria || prev.categoria,
          unidad: d.unidad || prev.unidad,
          cantidad_inicial: nextCantInicial,
          cantidad_actual: editingMed
            ? prev.cantidad_actual
            : d.cantidad_inicial !== null && d.cantidad_inicial !== undefined
            ? Number(d.cantidad_inicial)
            : prev.cantidad_actual,
          fecha_vencimiento: d.fecha_vencimiento || prev.fecha_vencimiento,
          para_que_sirve: d.para_que_sirve || prev.para_que_sirve,
          posologia_referencia: d.posologia_referencia || prev.posologia_referencia,
          notas: d.notas || prev.notas,
          stock_minimo:
            !editingMed && !stockMinimoTouched
              ? calcularStockMinimoPorDefecto(
                  nextCantInicial,
                  esProductoConsideradoEsencial(
                    {
                      nombre: d.nombre || prev.nombre,
                      droga: d.droga || prev.droga,
                      para_que_sirve: d.para_que_sirve || prev.para_que_sirve,
                      publico: d.publico || prev.publico,
                      es_esencial: prev.es_esencial,
                      esencial_id: prev.esencial_id,
                    },
                    state.esenciales
                  )
                )
              : prev.stock_minimo,
        }
      })

      setAiDetectedFields(Array.isArray(d.campos_detectados) ? d.campos_detectados : [])
      setAiMissingFields(Array.isArray(d.campos_faltantes) ? d.campos_faltantes : [])
      setAiHybridMessage(
        d.mensaje_hibrido ||
          'Se completaron los datos detectados en las fotos. Revisá las solapas para verificar los campos.'
      )

      showToast(
        photos.length > 1
          ? `¡${photos.length} fotos analizadas con IA!`
          : '¡Foto analizada con IA!',
        'success'
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudieron analizar las fotos'
      showToast(msg, 'error')
    } finally {
      setAnalyzingPhoto(false)
    }
  }

  async function handleSaveMedicamento(e: React.FormEvent) {
    e.preventDefault()
    if (!medForm.nombre.trim()) {
      setMedModalTab('general')
      showToast('Ingresá el nombre del medicamento', 'error')
      return
    }

    setSavingMed(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingMed ? 'update_medicamento' : 'add_medicamento',
          medicamento: {
            ...(editingMed ? { id: editingMed.id } : {}),
            ...medForm,
            nombre: formatEspacioMedida(medForm.nombre.trim()),
            droga: formatEspacioMedida(medForm.droga.trim()),
            concentracion: formatEspacioMedida(medForm.concentracion.trim()),
          },
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      setMedModalOpen(false)
      showToast(
        editingMed
          ? `Medicamento "${medForm.nombre}" actualizado`
          : `Medicamento "${medForm.nombre}" agregado al stock${
              json.emailSent ? ' (Alerta enviada por email)' : ''
            }`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error guardando medicamento'
      showToast(msg, 'error')
    } finally {
      setSavingMed(false)
    }
  }

  async function handleConsumeDosis(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!dosisModalMed) return

    setSubmittingDosis(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'consume_dosis',
          id: dosisModalMed.id,
          cantidad: dosisCantidad,
          motivo: dosisMotivo,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      setDosisModalMed(null)
      setDosisMotivo('')
      showToast(
        `Se descontaron ${dosisCantidad} ${dosisModalMed.unidad} de ${dosisModalMed.nombre}${
          json.emailSent ? ' • Se envió alerta por email' : ''
        }`,
        'success'
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error descontando dosis', 'error')
    } finally {
      setSubmittingDosis(false)
    }
  }

  async function handleQuickConsumeFromAI(medId: string, cantidad: number, nombre: string) {
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'consume_dosis',
          id: medId,
          cantidad,
          motivo: 'Dosis registrada desde el Consultorio IA',
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      showToast(
        `Dosis descontada de ${nombre} (-${cantidad})${
          json.emailSent ? ' • Alerta enviada por email' : ''
        }`,
        'success'
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error descontando dosis', 'error')
    }
  }

  async function handleReponerStock(e: React.FormEvent) {
    e.preventDefault()
    if (!reponerModalMed) return

    setSubmittingReponer(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reponer_stock',
          id: reponerModalMed.id,
          cantidad_sumar: reponerCantidad,
          nueva_fecha_vencimiento: reponerVencimiento || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      setReponerModalMed(null)
      showToast(`Stock de ${reponerModalMed.nombre} repuesto (+${reponerCantidad})`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error reponiendo stock', 'error')
    } finally {
      setSubmittingReponer(false)
    }
  }

  async function handleBajaMedicamento(e: React.FormEvent) {
    e.preventDefault()
    if (!bajaModalMed) return

    setSubmittingBaja(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'baja_medicamento',
          id: bajaModalMed.id,
          motivo_baja: bajaMotivo,
          detalle: bajaDetalle,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      setBajaModalMed(null)
      setBajaDetalle('')
      showToast(
        `"${bajaModalMed.nombre}" fue dado de baja del stock${
          json.emailSent ? ' • Se envió alerta por email' : ''
        }`,
        'info'
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al dar de baja', 'error')
    } finally {
      setSubmittingBaja(false)
    }
  }

  async function handleDeletePermanent(id: string, nombre: string) {
    if (!confirm(`¿Eliminar definitivamente "${nombre}" del registro?`)) return
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_medicamento', id }),
      })
      const json = await res.json()
      if (json.ok) {
        setState(json.state)
        setAlertas(json.alertasActivas)
        showToast(`"${nombre}" eliminado`, 'info')
      }
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  // Consultorio IA Submit
  async function handleSendConsulta(prefilledQuery?: string) {
    const queryText = (prefilledQuery ?? chatInput).trim()
    if (!queryText || consultingAI) return

    const edadPesoParts: string[] = []
    if (pacienteEdad.trim()) edadPesoParts.push(`Edad: ${pacienteEdad.trim()} años`)
    if (pacientePeso.trim()) edadPesoParts.push(`Peso: ${pacientePeso.trim()} kg`)
    const combinedEdadPeso = edadPesoParts.join(', ')

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: queryText,
      pacienteTipo:
        pacienteTipo === 'pediatrico'
          ? '👶 Bebé'
          : pacienteTipo === 'adulto'
          ? '🧑 Adulto'
          : 'Auto',
      edadPeso: combinedEdadPeso,
      timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    }

    setChatMessages((prev) => [...prev, userMsg])
    if (!prefilledQuery) setChatInput('')
    setConsultingAI(true)

    try {
      const historialPayload = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.text,
      }))

      const res = await fetch('/api/ai/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consulta: queryText,
          pacienteTipo,
          edadPesoDetalle: combinedEdadPeso,
          historial: historialPayload,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      const aiMsg: ChatItem = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: json.respuesta.respuesta_markdown,
        aiData: json.respuesta,
        timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      }
      setChatMessages((prev) => [...prev, aiMsg])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error consultando a la IA'
      showToast(msg, 'error')
    } finally {
      setConsultingAI(false)
    }
  }

  // Esenciales handlers
  function openNewEsencialModal() {
    setEditingEsencial(null)
    setEsencialForm({
      id: '',
      nombre: '',
      droga_sugerida: '',
      publico: 'ambos',
      categoria: CATEGORIAS_MEDICAMENTOS[0],
      stock_minimo_sugerido: 1,
      unidad_sugerida: 'unidades',
      keywords: '',
      descripcion: '',
      activo: true,
    })
    setEsencialModalOpen(true)
  }

  function openEditEsencialModal(esc: ProductoEsencial) {
    setEditingEsencial(esc)
    setEsencialForm({
      id: esc.id,
      nombre: esc.nombre,
      droga_sugerida: esc.droga_sugerida,
      publico: esc.publico,
      categoria: esc.categoria,
      stock_minimo_sugerido: esc.stock_minimo_sugerido,
      unidad_sugerida: esc.unidad_sugerida,
      keywords: esc.keywords.join(', '),
      descripcion: esc.descripcion,
      activo: esc.activo,
    })
    setEsencialModalOpen(true)
  }

  async function handleSaveEsencial(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_esencial',
          esencial: {
            ...esencialForm,
            keywords: esencialForm.keywords
              .split(',')
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean),
          },
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      setEsencialModalOpen(false)
      showToast('Producto esencial guardado', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error guardando esencial', 'error')
    }
  }

  async function handleDeleteEsencial(id: string, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" de la lista de esenciales?`)) return
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_esencial', id }),
      })
      const json = await res.json()
      if (json.ok) {
        setState(json.state)
        setAlertas(json.alertasActivas)
        showToast('Esencial eliminado de la lista', 'info')
      }
    } catch {
      showToast('Error eliminando esencial', 'error')
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          config: configForm,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      showToast('Configuración actualizada', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error guardando configuración', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const greyBtn =
    'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-600/80 transition-colors'
  const greyBtnActive =
    'bg-zinc-700 text-white border border-zinc-400 shadow-sm transition-colors'

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0c10] text-foreground pb-24 md:pb-8">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 max-w-md animate-in fade-in slide-in-from-bottom-3">
          <div
            className={`flex items-center space-x-3 rounded-xl border px-4 py-3 shadow-2xl ${
              toast.type === 'error'
                ? 'bg-red-950/95 border-red-400/50 text-red-100'
                : toast.type === 'info'
                ? 'bg-zinc-900/95 border-zinc-600 text-zinc-100'
                : 'bg-zinc-900/95 border-red-400/50 text-red-100'
            }`}
          >
            {toast.type === 'error' ? (
              <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="h-5 w-5 text-zinc-300 shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-red-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.text}</span>
          </div>
        </div>
      )}

      {/* Navbar with high contrast against the dark background */}
      <nav className="border-b border-[#383e4e] bg-[#1e222d] px-4 md:px-8 py-3.5 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center space-x-8">
            <a
              href="/"
              onClick={(e) => handleTabNavClick(e, 'stock')}
              className="flex items-center space-x-3 text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/40 text-primary">
                <HeartPulse className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-foreground tracking-tight block leading-none">
                Botiquín Virtual
              </span>
            </a>

            {/* Desktop Nav Links (Anchor elements so right-click "Open in new tab/window" works) */}
            <div className="hidden md:flex items-center space-x-2">
              <a
                href="/?tab=stock"
                onClick={(e) => handleTabNavClick(e, 'stock')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'stock' ? greyBtnActive : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Stock</span>
              </a>

              <a
                href="/?tab=consulta"
                onClick={(e) => handleTabNavClick(e, 'consulta')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'consulta' ? greyBtnActive : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Bot className="h-4 w-4" />
                <span>Consultorio IA</span>
              </a>

              <a
                href="/?tab=esenciales"
                onClick={(e) => handleTabNavClick(e, 'esenciales')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'esenciales' ? greyBtnActive : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Star className="h-4 w-4" />
                <span>Esenciales</span>
              </a>

              <a
                href="/?tab=alertas"
                onClick={(e) => handleTabNavClick(e, 'alertas')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'alertas' ? greyBtnActive : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Bell className="h-4 w-4" />
                <span>Alertas</span>
              </a>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            {/* + Medicamento styled with the same colors, background and border lines as the Heart icon */}
            <button
              onClick={() => openNewMedModal()}
              className="flex items-center space-x-1.5 rounded-xl bg-primary/15 border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/25 shadow-sm transition-colors"
            >
              <span>+ Medicamento</span>
            </button>

            <form action="/auth/signout" method="post">
              <button
                title={`Cerrar sesión (${userEmail})`}
                className={`flex items-center space-x-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${greyBtn}`}
              >
                <LogOut className="h-4 w-4" />
                <span>Salir</span>
              </button>
            </form>
          </div>

          {/* Mobile Header Right */}
          <div className="flex md:hidden items-center space-x-2">
            <button
              onClick={() => openNewMedModal()}
              className="flex items-center space-x-1 rounded-xl bg-primary/15 border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
            >
              <span>+ Medicamento</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-lg ${greyBtn}`}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#383e4e] mt-3 pt-4 pb-2 flex flex-col space-y-2">
            <div className="text-xs text-muted-foreground px-2 pb-1 truncate">
              Sesión: {userEmail}
            </div>
            <form action="/auth/signout" method="post">
              <button className={`w-full flex items-center justify-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium ${greyBtn}`}>
                <LogOut className="h-4 w-4" />
                <span>Salir</span>
              </button>
            </form>
          </div>
        )}
      </nav>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8 py-6">
        {/* ================================================================= */}
        {/* TAB 1: STOCK                                                      */}
        {/* ================================================================= */}
        {activeTab === 'stock' && (
          <div className="space-y-6">
            {/* 3 Compact Top Summary Cards (Stock Actual removed) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                onClick={() => setFilterEstado('proximo_vencer')}
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3.5 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Próximos a Vencer
                  </span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span
                    className={`text-2xl font-bold ${
                      kpis.proximosCount > 0 ? 'text-amber-400' : 'text-foreground'
                    }`}
                  >
                    {kpis.proximosCount}
                  </span>
                </div>
              </div>

              <div
                onClick={() => setFilterEstado('vencidos_sin_stock')}
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3.5 hover:border-red-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vencidos / Sin Stock
                  </span>
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div className="mt-1.5 flex items-baseline space-x-2">
                  <span
                    className={`text-2xl font-bold ${
                      kpis.vencidosCount > 0 ? 'text-red-400' : 'text-foreground'
                    }`}
                  >
                    {kpis.vencidosCount}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span
                    className={`text-2xl font-bold ${
                      kpis.sinStockCount > 0 ? 'text-rose-400' : 'text-foreground'
                    }`}
                  >
                    {kpis.sinStockCount}
                  </span>
                </div>
              </div>

              <div
                onClick={() => {
                  setActiveTab('esenciales')
                  window.history.pushState(null, '', '/?tab=esenciales')
                }}
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3.5 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Primera Necesidad
                  </span>
                  <Star className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-1.5 flex items-baseline">
                  <span className="text-2xl font-bold text-foreground">
                    {kpis.esencialesCubiertos} de {kpis.esencialesTotal}
                  </span>
                </div>
              </div>
            </div>

            {/* Filters & Search Bar */}
            <div className="flex flex-col space-y-3.5 rounded-xl border border-[#323846] bg-[#171a22] p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, droga o síntoma..."
                    className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] pl-10 pr-4 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Público Filter Pills (1-word grey buttons) */}
                <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
                  <button
                    onClick={() => setFilterPublico('todos')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                      filterPublico === 'todos' ? greyBtnActive : greyBtn
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterPublico('pediatrico')}
                    className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                      filterPublico === 'pediatrico' ? greyBtnActive : greyBtn
                    }`}
                  >
                    <Baby className="h-3.5 w-3.5" />
                    <span>Pediátrico</span>
                  </button>
                  <button
                    onClick={() => setFilterPublico('adulto')}
                    className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                      filterPublico === 'adulto' ? greyBtnActive : greyBtn
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>Adultos</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto pt-2.5 border-t border-[#2c313f]">
                {[
                  { id: 'activos', label: 'Stock actual' },
                  { id: 'proximo_vencer', label: 'Próximos a vencer' },
                  { id: 'vencidos_sin_stock', label: 'Vencidos / Sin stock' },
                  { id: 'bajas', label: 'Bajas' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setFilterEstado(
                        tab.id as
                          | 'activos'
                          | 'proximo_vencer'
                          | 'vencidos_sin_stock'
                          | 'bajas'
                      )
                    }
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filterEstado === tab.id
                        ? 'bg-zinc-700 text-white font-semibold border border-zinc-500/80'
                        : 'text-muted-foreground hover:text-foreground hover:bg-zinc-800/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Medications Grid */}
            {filteredMeds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#343a48] bg-[#171a22]/70 p-10 text-center">
                <Pill className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <h3 className="text-base font-semibold text-foreground">
                  No hay medicamentos en esta vista
                </h3>
                <div className="mt-4 flex items-center justify-center">
                  <button
                    onClick={() => openNewMedModal(undefined, 'hibrido_ia')}
                    className={`inline-flex items-center space-x-2 rounded-xl px-5 py-2.5 text-sm font-medium ${greyBtn}`}
                  >
                    <span>+ Medicamento</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredMeds.map((med) => {
                  const diasVenc = calcularDiasVencimiento(med.fecha_vencimiento)
                  const vencido = diasVenc !== null && diasVenc < 0
                  const proximo =
                    diasVenc !== null &&
                    diasVenc >= 0 &&
                    diasVenc <= (state.config.dias_proximo_vencer || 30)
                  const sinStock = med.cantidad_actual <= 0
                  const pct =
                    med.cantidad_inicial > 0
                      ? Math.min(100, Math.round((med.cantidad_actual / med.cantidad_inicial) * 100))
                      : med.cantidad_actual > 0
                      ? 100
                      : 0

                  const allPhotos =
                    med.fotos_urls && med.fotos_urls.length > 0
                      ? med.fotos_urls
                      : med.foto_url
                      ? [med.foto_url]
                      : []

                  const sintomasResumidos = resumirSintomas(med.para_que_sirve)

                  return (
                    <div
                      key={med.id}
                      className={`flex flex-col justify-between rounded-2xl border bg-[#171a22] p-5 shadow-md transition-all ${
                        vencido
                          ? 'border-red-400/50'
                          : proximo
                          ? 'border-amber-400/45'
                          : sinStock
                          ? 'border-rose-400/40 opacity-90'
                          : 'border-[#323846] hover:border-zinc-500'
                      }`}
                    >
                      <div className="space-y-3.5">
                        {/* Header row: Photo + Badges */}
                        <div className="flex items-start gap-3.5">
                          {allPhotos.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLightboxPhotos(allPhotos)
                                setLightboxIndex(0)
                              }}
                              className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#323846] bg-[#0e1016] relative group"
                            >
                              <img
                                src={allPhotos[0]}
                                alt={med.nombre}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                              {allPhotos.length > 1 && (
                                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white flex items-center">
                                  <Images className="h-2.5 w-2.5 mr-0.5" />
                                  <span>{allPhotos.length}</span>
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#323846] bg-[#0e1016] text-muted-foreground">
                              {med.unidad === 'ml' || med.unidad === 'gotas' ? (
                                <Droplets className="h-6 w-6 text-sky-400" />
                              ) : (
                                <Pill className="h-6 w-6 text-primary" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {med.publico === 'pediatrico' ? (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300 border border-sky-500/30">
                                  <Baby className="h-3 w-3" />
                                  <span>Pediátrico</span>
                                </span>
                              ) : med.publico === 'adulto' ? (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-300 border border-violet-500/30">
                                  <User className="h-3 w-3" />
                                  <span>Adultos</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-red-400/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 border border-red-400/30">
                                  <Users className="h-3 w-3" />
                                  <span>Ambos</span>
                                </span>
                              )}

                              <span className="rounded-md bg-[#232733] px-2 py-0.5 text-[11px] text-zinc-300 truncate max-w-[130px]">
                                {med.categoria}
                              </span>
                            </div>

                            {/* Styled custom tooltip for Nombre */}
                            <h3 className="group/nombre relative text-base font-bold text-foreground leading-snug cursor-default">
                              <span className="block truncate">{formatEspacioMedida(med.nombre)}</span>
                              <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/nombre:block z-50 w-max max-w-[260px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-2xl whitespace-normal break-words">
                                {formatEspacioMedida(med.nombre)}
                              </span>
                            </h3>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {formatEspacioMedida(med.droga) || 'Sin especificar'}{' '}
                              {med.concentracion ? `• ${formatEspacioMedida(med.concentracion)}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Single compact line: Disponibilidad: 75% | Vencimiento: 12/2027 ('|' exactly centered) */}
                        <div className="rounded-xl bg-[#0e1016] border border-[#2b303d] px-3 py-2 text-xs grid grid-cols-[1fr_auto_1fr] items-center">
                          <span className="text-center truncate">
                            <span className="text-muted-foreground">Disponibilidad:</span>{' '}
                            <strong
                              className={
                                sinStock
                                  ? 'text-red-400'
                                  : med.cantidad_actual <= med.stock_minimo
                                  ? 'text-amber-400'
                                  : 'text-foreground'
                              }
                            >
                              {pct}%
                            </strong>
                          </span>
                          <span className="text-zinc-500 px-2 select-none text-center">|</span>
                          <span className="text-center truncate">
                            <span className="text-muted-foreground">Vencimiento:</span>{' '}
                            <strong
                              className={
                                vencido
                                  ? 'text-red-400'
                                  : proximo
                                  ? 'text-amber-400'
                                  : 'text-foreground'
                              }
                            >
                              {formatMesAnio(med.fecha_vencimiento)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions: Función | Dosis | - | + | Editar | Eliminar */}
                      {med.estado === 'activo' ? (
                        <div className="mt-4 pt-3 border-t border-[#282d3a] flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            className={`group/sirve relative flex-1 flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium ${greyBtn}`}
                          >
                            <span>Función</span>
                            <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/sirve:block z-50 w-max max-w-[260px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-3 py-2 text-xs font-normal text-left text-zinc-100 shadow-2xl whitespace-normal break-words leading-relaxed">
                              <strong className="text-red-300 block mb-0.5">Función:</strong>
                              {med.para_que_sirve || sintomasResumidos || 'Sin especificar'}
                            </span>
                          </button>

                          <button
                            type="button"
                            className={`group/dosis relative flex-1 flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium ${greyBtn}`}
                          >
                            <span>Dosis</span>
                            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/dosis:block z-50 w-max max-w-[260px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-3 py-2 text-xs font-normal text-left text-zinc-100 shadow-2xl whitespace-normal break-words leading-relaxed">
                              <strong className="text-sky-300 block mb-0.5">Dosis:</strong>
                              {med.posologia_referencia || 'Sin especificar'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={med.cantidad_actual <= 0}
                            onClick={() => {
                              setDosisModalMed(med)
                              setDosisCantidad(med.unidad === 'ml' ? 5 : 1)
                              setDosisMotivo('')
                            }}
                            title="Usar / Descontar dosis"
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 ${greyBtn}`}
                          >
                            -
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReponerModalMed(med)
                              setReponerCantidad(med.cantidad_inicial || 10)
                              setReponerVencimiento(med.fecha_vencimiento || '')
                            }}
                            title="Reponer Stock"
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${greyBtn}`}
                          >
                            +
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditMedModal(med)}
                            title="Editar"
                            className={`p-1.5 rounded-lg ${greyBtn}`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setBajaModalMed(med)
                              setBajaMotivo(vencido ? 'vencido' : 'tirado')
                              setBajaDetalle('')
                            }}
                            title="Eliminar / Dar de baja"
                            className={`p-1.5 rounded-lg ${greyBtn}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 pt-3 border-t border-[#282d3a] flex items-center justify-between text-xs">
                          <span className="text-red-300 font-medium">
                            Baja ({med.motivo_baja || 'descartado'})
                          </span>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setReponerModalMed(med)
                                setReponerCantidad(med.cantidad_inicial || 10)
                                setReponerVencimiento('')
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${greyBtn}`}
                            >
                              Reactivar
                            </button>
                            <button
                              onClick={() => handleDeletePermanent(med.id, med.nombre)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${greyBtn}`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: CONSULTORIO IA (EQUAL HEIGHT BLOCKS + MEDICAL ROBOT)       */}
        {/* ================================================================= */}
        {activeTab === 'consulta' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {/* Left Column: Patient Selector + Numeric Edad/Peso + Virtual Medical Robot */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#323846] bg-[#171a22] p-4 lg:h-[calc(100vh-175px)] lg:min-h-[380px] lg:max-h-[480px] overflow-hidden">
              <div className="space-y-3 shrink-0">
                <div className="flex items-center space-x-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
                    <Bot className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-foreground">
                    Consultorio IA
                  </h2>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    ¿Para quién es la consulta?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('auto')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium ${
                        pacienteTipo === 'auto' ? greyBtnActive : greyBtn
                      }`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('pediatrico')}
                      className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg text-xs font-medium ${
                        pacienteTipo === 'pediatrico' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <Baby className="h-3.5 w-3.5" />
                      <span>Bebé</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('adulto')}
                      className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg text-xs font-medium ${
                        pacienteTipo === 'adulto' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Adulto</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground block">
                      Edad (opcional):
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      step="1"
                      inputMode="numeric"
                      value={pacienteEdad}
                      onChange={(e) => setPacienteEdad(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Años"
                      className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground block">
                      Peso kg (opcional):
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      step="0.1"
                      inputMode="decimal"
                      value={pacientePeso}
                      onChange={(e) => setPacientePeso(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="Kg"
                      className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Virtual Medical Robot Character compactly fitting inside the card margins */}
              <div className="mt-3 flex-1 min-h-0 flex flex-col items-center justify-center rounded-xl border border-[#282d3b] bg-[#10131b] p-2 text-center overflow-hidden">
                <svg
                  viewBox="0 0 180 145"
                  className="h-16 w-20 md:h-20 md:w-24 shrink-0 drop-shadow-md"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Antenna */}
                  <line x1="90" y1="8" x2="90" y2="22" stroke="#525b70" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="90" cy="7" r="5" fill="#f87171" />

                  {/* Head */}
                  <rect x="48" y="22" width="84" height="54" rx="18" fill="#232836" stroke="#4a5264" strokeWidth="2.5" />

                  {/* Ears / Audio Sensors */}
                  <rect x="40" y="38" width="8" height="20" rx="4" fill="#363d4f" />
                  <rect x="132" y="38" width="8" height="20" rx="4" fill="#363d4f" />

                  {/* Doctor Head Mirror / Badge on Forehead */}
                  <rect x="78" y="16" width="24" height="14" rx="5" fill="#171a22" stroke="#4a5264" strokeWidth="2" />
                  <path d="M90 19V27M86 23H94" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Face Visor Screen */}
                  <rect x="58" y="34" width="64" height="32" rx="10" fill="#0e1016" stroke="#323846" strokeWidth="1.5" />

                  {/* Glowing Friendly Eyes */}
                  <circle cx="75" cy="48" r="5" fill="#f87171" />
                  <circle cx="77" cy="46" r="1.5" fill="#ffffff" />
                  <circle cx="105" cy="48" r="5" fill="#f87171" />
                  <circle cx="107" cy="46" r="1.5" fill="#ffffff" />

                  {/* Friendly Smile */}
                  <path d="M82 57C85 60 95 60 98 57" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />

                  {/* Neck */}
                  <rect x="80" y="76" width="20" height="8" rx="2" fill="#363d4f" />

                  {/* Doctor Torso / Coat */}
                  <path
                    d="M44 100C44 90.0589 52.0589 82 62 82H118C127.941 82 136 90.0589 136 100V136C136 138.209 134.209 140 132 140H48C45.7909 140 44 138.209 44 136V100Z"
                    fill="#232836"
                    stroke="#4a5264"
                    strokeWidth="2.5"
                  />

                  {/* Medical Coat Lapels */}
                  <path d="M74 82L90 106L106 82" stroke="#383f4e" strokeWidth="2" strokeLinejoin="round" />

                  {/* Stethoscope around neck */}
                  <path
                    d="M68 83C68 102 74 114 90 114C106 114 112 102 112 83"
                    stroke="#9ca3af"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <line x1="90" y1="114" x2="90" y2="125" stroke="#9ca3af" strokeWidth="3" />
                  <circle cx="90" cy="128" r="6" fill="#171a22" stroke="#f87171" strokeWidth="2.5" />
                  <circle cx="90" cy="128" r="2" fill="#f87171" />

                  {/* Pocket Heart Pulse Badge */}
                  <rect x="108" y="106" width="18" height="14" rx="3" fill="#14171f" stroke="#383f4e" strokeWidth="1.5" />
                  <path d="M111 113H114L116 109L118 117L120 113H123" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-semibold text-zinc-200 mt-1">
                  Dr. Botiquín IA
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Asistente médico virtual
                </span>
              </div>
            </div>

            {/* Right 2 Columns: Equal-Height Chat Box */}
            <div className="lg:col-span-2 flex flex-col rounded-2xl border border-[#323846] bg-[#171a22] overflow-hidden h-[calc(100vh-175px)] min-h-[380px] max-h-[480px]">
              {/* Chat Messages Area */}
              <div className="flex-1 p-4 md:p-5 space-y-4 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-3">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      Hacé una consulta médica sobre tu Botiquín
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground max-w-md">
                      Escribí qué síntoma tenés vos o el bebé para revisar qué medicamentos vigentes tenés en stock.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-2xl rounded-2xl p-3.5 ${
                          msg.role === 'user'
                            ? 'bg-zinc-800 border border-zinc-600 text-zinc-100'
                            : 'bg-[#0e1016] border border-[#2d3342] text-foreground w-full'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1 text-[11px] opacity-75">
                          <span className="font-semibold">
                            {msg.role === 'user'
                              ? `Tu consulta (${msg.pacienteTipo}${
                                  msg.edadPeso ? ` • ${msg.edadPeso}` : ''
                                })`
                              : '🤖 Dr. Botiquín IA'}
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>

                        <div className="text-sm leading-relaxed space-y-0.5">
                          {renderFormattedChatText(msg.text)}
                        </div>

                        {/* Structured AI Sections */}
                        {msg.aiData && (
                          <div className="mt-3.5 space-y-3.5 pt-3.5 border-t border-[#2d3342]">
                            {/* 1. Recomendados de tu stock */}
                            {msg.aiData.recomendados_del_stock.length > 0 ? (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center space-x-1.5">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Disponible en tu Stock:</span>
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                  {msg.aiData.recomendados_del_stock.map((rec) => (
                                    <div
                                      key={rec.id}
                                      className="rounded-xl border border-[#363d4f] bg-[#171a22] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                                    >
                                      <div>
                                        <div className="font-bold text-sm text-foreground">
                                          {rec.nombre}{' '}
                                          <span className="text-xs font-normal text-muted-foreground">
                                            ({rec.droga})
                                          </span>
                                        </div>
                                        <div className="text-xs text-zinc-300 mt-0.5">
                                          <strong>Dosis recomendada:</strong>{' '}
                                          {renderInlineBold(rec.dosis_sugerida)}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {renderInlineBold(rec.motivo)} • Stock:{' '}
                                          <strong>
                                            {rec.cantidad_actual} {rec.unidad}
                                          </strong>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleQuickConsumeFromAI(
                                            rec.id,
                                            rec.cantidad_descontar_sugerida || 1,
                                            rec.nombre
                                          )
                                        }
                                        className={`shrink-0 flex items-center justify-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${greyBtn}`}
                                      >
                                        <MinusCircle className="h-3.5 w-3.5" />
                                        <span>Descontar</span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 flex items-start space-x-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-200">
                                  <strong>No tenés medicamentos vigentes en tu stock</strong> para
                                  tratar específicamente este malestar.
                                </div>
                              </div>
                            )}

                            {/* 2. Advertencias de medicamentos vencidos o sin stock */}
                            {msg.aiData.advertencias_stock.length > 0 && (
                              <div className="rounded-xl border border-red-400/40 bg-red-950/25 p-3 space-y-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center space-x-1.5">
                                  <ShieldAlert className="h-4 w-4" />
                                  <span>Atención en tu Botiquín (Vencidos / Sin Stock):</span>
                                </h4>
                                <ul className="list-disc list-inside text-xs text-red-200 space-y-0.5">
                                  {msg.aiData.advertencias_stock.map((adv, i) => (
                                    <li key={i}>{renderInlineBold(adv)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* 3. Sugerencias para comprar */}
                            {msg.aiData.sugerencias_compra.length > 0 && (
                              <div className="space-y-1.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center space-x-1.5">
                                  <ShoppingBag className="h-4 w-4" />
                                  <span>Sugerencias para comprar en Farmacia:</span>
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                  {msg.aiData.sugerencias_compra.map((sug, i) => (
                                    <div
                                      key={i}
                                      className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-2.5 text-xs"
                                    >
                                      <div className="font-bold text-sky-200">
                                        {sug.nombre_sugerido}{' '}
                                        <span className="font-normal text-sky-300/80">
                                          ({sug.droga} • {sug.publico})
                                        </span>
                                      </div>
                                      <p className="text-zinc-300 mt-0.5">
                                        {renderInlineBold(sug.motivo)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 4. Pautas de alarma */}
                            {msg.aiData.pautas_alarma.length > 0 && (
                              <div className="rounded-xl border border-[#323846] bg-[#171a22] p-2.5 text-xs text-muted-foreground">
                                <strong className="text-foreground block mb-1">
                                  🩺 Cuándo consultar al médico / guardia:
                                </strong>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {msg.aiData.pautas_alarma.map((p, i) => (
                                    <li key={i}>{renderInlineBold(p)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {consultingAI && (
                  <div className="flex items-center space-x-3 rounded-2xl border border-[#323846] bg-[#0e1016] p-3.5 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Analizando tu stock disponible...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendConsulta()
                }}
                className="border-t border-[#323846] bg-[#11131a] p-3 flex items-center gap-2.5"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribí tu consulta o síntoma..."
                  className="flex-1 rounded-xl border border-[#343a48] bg-[#171a22] px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={consultingAI || !chatInput.trim()}
                  className={`flex items-center space-x-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-50 ${greyBtn}`}
                >
                  {consultingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>Consultar</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ESENCIALES (SIMPLIFIED TABLE LIST, SORTED BY PÚBLICO)      */}
        {/* ================================================================= */}
        {activeTab === 'esenciales' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3">
              <div className="flex items-center space-x-2.5">
                <Star className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Esenciales</h2>
                <span className="text-xs text-muted-foreground">
                  ({kpis.esencialesCubiertos}/{kpis.esencialesTotal} cubiertos)
                </span>
              </div>
              <button
                onClick={openNewEsencialModal}
                className={`shrink-0 flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-zinc-600 ${greyBtnActive}`}
              >
                <span>+ Esencial</span>
              </button>
            </div>

            <div className="rounded-xl border border-[#323846] bg-[#171a22] overflow-hidden">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#2c313f] bg-[#12151c] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-[21%] py-2.5 pl-3.5 pr-2">Categoría</th>
                    <th className="w-[17%] py-2.5 px-2">Principal Activo</th>
                    <th className="w-[8%] py-2.5 px-1.5 text-center">Público</th>
                    <th className="w-[24%] py-2.5 px-2">Síntomas</th>
                    <th className="w-[18%] py-2.5 px-2">Marcas sugeridas</th>
                    <th className="w-[12%] py-2.5 pl-2 pr-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262b38] text-xs">
                  {sortedEsenciales.map((esc) => {
                    const { cubierto, medicamentosQueCubren } = verificarCoberturaEsencial(
                      esc,
                      state.medicamentos
                    )
                    return (
                      <tr
                        key={esc.id}
                        className={`transition-colors hover:bg-[#1c202b] ${
                          !esc.activo ? 'opacity-50' : ''
                        }`}
                      >
                        {/* 1. Categoría: Grey tag if in stock, Heart-icon style (bg-primary/15 border-primary/40 text-primary) if missing */}
                        <td className="py-2 pl-3.5 pr-2 align-middle">
                          <span
                            className={`inline-block rounded-xl px-2.5 py-1 text-xs font-semibold leading-snug break-words ${
                              cubierto
                                ? 'bg-zinc-700 text-white border border-zinc-400'
                                : 'bg-primary/15 border border-primary/40 text-primary'
                            }`}
                            title={
                              cubierto
                                ? `En stock: ${medicamentosQueCubren
                                    .map((m) => m.nombre)
                                    .join(', ')}`
                                : 'Sin stock disponible'
                            }
                          >
                            {formatCategoriaEsencial(esc)}
                          </span>
                        </td>

                        {/* 2. Principal Activo */}
                        <td className="py-2 px-2 text-zinc-200 leading-snug break-words align-middle">
                          {formatPrincipalActivoEsencial(esc)}
                        </td>

                        {/* 3. Público: Only emoji, 50% larger */}
                        <td className="py-2 px-1.5 text-center align-middle">
                          {esc.publico === 'pediatrico' ? (
                            <span
                              className="inline-block text-lg leading-none select-none"
                              title="Bebé / Pediátrico"
                            >
                              👶
                            </span>
                          ) : esc.publico === 'ambos' ? (
                            <span
                              className="inline-block text-lg leading-none select-none"
                              title="Familia"
                            >
                              👨‍👩‍👧
                            </span>
                          ) : (
                            <span
                              className="inline-block text-lg leading-none select-none"
                              title="Adultos"
                            >
                              🧑
                            </span>
                          )}
                        </td>

                        {/* 4. Síntomas */}
                        <td
                          className="py-2 px-2 text-muted-foreground leading-snug break-words align-middle"
                          title={esc.descripcion}
                        >
                          {formatSintomasEsencial(esc)}
                        </td>

                        {/* 5. Marcas sugeridas */}
                        <td
                          className="py-2 px-2 text-zinc-300 leading-snug break-words align-middle"
                          title={formatMarcasSugeridas(esc)}
                        >
                          {formatMarcasSugeridas(esc)}
                        </td>

                        {/* 6. Acciones: + Stock (Plus icon), Editar (Pencil icon), Eliminar (Trash icon) */}
                        <td className="py-2 pl-2 pr-3.5 text-right align-middle">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                openNewMedModal({
                                  nombre: esc.nombre,
                                  droga: esc.droga_sugerida,
                                  publico: esc.publico,
                                  categoria: esc.categoria,
                                  unidad: esc.unidad_sugerida,
                                  cantidad_actual: esc.unidad_sugerida === 'ml' ? 100 : 10,
                                  cantidad_inicial: esc.unidad_sugerida === 'ml' ? 100 : 10,
                                  es_esencial: true,
                                  esencial_id: esc.id,
                                })
                              }
                              className={`p-1.5 rounded-lg ${greyBtn}`}
                              title="+ Stock"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditEsencialModal(esc)}
                              className={`p-1.5 rounded-lg ${greyBtn}`}
                              title="Editar"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteEsencial(esc.id, esc.nombre)}
                              className={`p-1.5 rounded-lg ${greyBtn}`}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: ALERTAS (COMPACT HEIGHT, UNIFIED CHECKBOX, GREY TAGS)      */}
        {/* ================================================================= */}
        {activeTab === 'alertas' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Settings Form */}
            <form
              onSubmit={handleSaveConfig}
              className="flex flex-col justify-between rounded-2xl border border-[#323846] bg-[#171a22] p-5 space-y-3.5"
            >
              <div className="space-y-3.5">
                <h3 className="text-base font-bold text-foreground flex items-center space-x-2">
                  <Settings className="h-4 w-4 text-primary" />
                  <span>Configuración</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      Email destinatario de las alertas:
                    </label>
                    <input
                      type="email"
                      required
                      value={configForm.email_alertas}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, email_alertas: e.target.value })
                      }
                      className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      Anticipación (días):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={configForm.dias_proximo_vencer}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          dias_proximo_vencer: Number(e.target.value || 30),
                        })
                      }
                      className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    Alertas automáticas:
                  </span>

                  <label className="flex items-center space-x-3 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(configForm.alertar_proximo_vencer)}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          alertar_proximo_vencer: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-[#343a48] accent-[#f87171]"
                    />
                    <span>⏳ Producto próximo a vencer</span>
                  </label>

                  <label className="flex items-center space-x-3 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(configForm.alertar_vencido || configForm.alertar_sin_stock)}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          alertar_vencido: e.target.checked,
                          alertar_sin_stock: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-[#343a48] accent-[#f87171]"
                    />
                    <span>🚨 Producto vencido / sin stock</span>
                  </label>

                  <label className="flex items-center space-x-3 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(configForm.alertar_esencial_faltante)}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          alertar_esencial_faltante: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-[#343a48] accent-[#f87171]"
                    />
                    <span>⭐ Producto esencial faltante</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className={`w-full rounded-xl px-4 py-2 text-sm font-semibold ${greyBtn}`}
              >
                {savingConfig ? 'Guardando...' : 'Guardar'}
              </button>
            </form>

            {/* Movements Log */}
            <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-5 flex flex-col space-y-3.5">
              <h3 className="text-base font-bold text-foreground flex items-center space-x-2">
                <History className="h-4 w-4 text-primary" />
                <span>Últimos Movimientos</span>
              </h3>

              {state.movimientos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Todavía no hay movimientos registrados.
                </p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {state.movimientos.slice(0, 30).map((mov) => (
                    <div
                      key={mov.id}
                      className="rounded-xl border border-[#2c313f] bg-[#0e1016] px-3 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                          <span>{mov.medicamento_nombre}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-zinc-700 text-white font-semibold">
                            {mov.tipo}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{mov.motivo}</p>
                      </div>
                      <div className="text-right text-muted-foreground shrink-0 ml-2">
                        <div>
                          {new Date(mov.created_at).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#383e4e] bg-[#1e222d]/95 backdrop-blur px-2 py-1.5 grid grid-cols-4 gap-1">
        <a
          href="/?tab=stock"
          onClick={(e) => handleTabNavClick(e, 'stock')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'stock' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Package className="h-5 w-5 mb-0.5" />
          <span>Stock</span>
        </a>

        <a
          href="/?tab=consulta"
          onClick={(e) => handleTabNavClick(e, 'consulta')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'consulta' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Bot className="h-5 w-5 mb-0.5" />
          <span>Consultorio IA</span>
        </a>

        <a
          href="/?tab=esenciales"
          onClick={(e) => handleTabNavClick(e, 'esenciales')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'esenciales' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Star className="h-5 w-5 mb-0.5" />
          <span>Esenciales</span>
        </a>

        <a
          href="/?tab=alertas"
          onClick={(e) => handleTabNavClick(e, 'alertas')}
          className={`relative flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'alertas' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Bell className="h-5 w-5 mb-0.5" />
          <span>Alertas</span>
        </a>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT MEDICAMENTO (COMPACT 3 TABS, NO VERTICAL SCROLL)    */}
      {/* ===================================================================== */}
      {medModalOpen && (
        <div
          onClick={() => setMedModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-[#383f4e]">
              <h2 className="text-base font-bold text-foreground">
                {editingMed ? 'Editar Medicamento' : 'Nuevo Medicamento'}
              </h2>
              <button
                type="button"
                onClick={() => setMedModalOpen(false)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3 Section Tabs: General | Stock | Uso */}
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#14171f] p-1 border border-[#363c4b]">
              {[
                { id: 'general', label: 'General' },
                { id: 'stock', label: 'Stock' },
                { id: 'uso', label: 'Uso' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMedModalTab(t.id as MedModalTab)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    medModalTab === t.id
                      ? greyBtnActive
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveMedicamento} className="mt-3.5">
              {/* TAB 1: GENERAL (Compact single-row photo bar + tight grid) */}
              {medModalTab === 'general' && (
                <div className="space-y-3">
                  {/* Ultra-compact Photo & AI Bar */}
                  <div className="rounded-xl border border-[#383f4e] bg-[#161922] px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-zinc-300 shrink-0">
                          Fotos ({medForm.fotos_input.length})
                        </span>

                        {medForm.fotos_input.length > 0 && (
                          <div className="flex items-center gap-1.5 overflow-x-auto">
                            {medForm.fotos_input.map((imgSrc, idx) => (
                              <div
                                key={idx}
                                className="relative h-8 w-8 shrink-0 rounded-md overflow-hidden border border-[#383f4e] bg-[#0e1016]"
                              >
                                <img
                                  src={imgSrc}
                                  alt={`Foto ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhotoAtIndex(idx)}
                                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 text-white transition-opacity"
                                  title="Quitar"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleMultiplePhotosSelected}
                        className="hidden"
                      />
                      <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultiplePhotosSelected}
                        className="hidden"
                      />

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={analyzingPhoto}
                          className={`flex items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-medium ${greyBtn}`}
                        >
                          <Camera className="h-3 w-3" />
                          <span>Cámara</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={analyzingPhoto}
                          className={`flex items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-medium ${greyBtn}`}
                        >
                          <Plus className="h-3 w-3" />
                          <span>Fotos</span>
                        </button>

                        {medForm.fotos_input.length > 0 && (
                          <button
                            type="button"
                            onClick={() => analyzePhotosWithAI()}
                            disabled={analyzingPhoto}
                            className={`flex items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-medium ${greyBtn}`}
                          >
                            {analyzingPhoto ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            <span>Analizar</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {analyzingPhoto && (
                      <div className="flex items-center space-x-1.5 text-[11px] text-red-300">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <span>Analizando con IA...</span>
                      </div>
                    )}

                    {!analyzingPhoto && aiHybridMessage && (
                      <p className="text-[11px] text-amber-300 truncate" title={aiHybridMessage}>
                        {aiHybridMessage}
                      </p>
                    )}
                  </div>

                  {/* General Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Nombre Comercial *
                      </label>
                      <input
                        type="text"
                        required
                        value={medForm.nombre}
                        onChange={(e) => {
                          updateMedFormAutoStock({ nombre: e.target.value })
                          if (e.target.value.trim()) clearFieldMissingFlag('nombre')
                        }}
                        placeholder="Ej: Ibupirac 4%, Tafirol 1g"
                        className={`w-full rounded-lg border bg-[#13161f] px-3 py-1.5 text-sm text-foreground ${
                          isFieldMissingFromAI('nombre')
                            ? 'border-amber-400'
                            : 'border-[#383f4e]'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Droga / Principio Activo
                      </label>
                      <input
                        type="text"
                        value={medForm.droga}
                        onChange={(e) => {
                          updateMedFormAutoStock({ droga: e.target.value })
                          if (e.target.value.trim()) clearFieldMissingFlag('droga')
                        }}
                        placeholder="Ej: Ibuprofeno"
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Concentración
                      </label>
                      <input
                        type="text"
                        value={medForm.concentracion}
                        onChange={(e) => {
                          setMedForm({ ...medForm, concentracion: e.target.value })
                          if (e.target.value.trim()) clearFieldMissingFlag('concentracion')
                        }}
                        placeholder="Ej: 400 mg, 4%"
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Público
                      </label>
                      <select
                        value={medForm.publico}
                        onChange={(e) =>
                          updateMedFormAutoStock({ publico: e.target.value as PublicoObjetivo })
                        }
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      >
                        <option value="adulto">🧑 Adultos</option>
                        <option value="pediatrico">👶 Pediátrico</option>
                        <option value="ambos">👨‍👩‍👧 Ambos</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Categoría
                      </label>
                      <select
                        value={medForm.categoria}
                        onChange={(e) => setMedForm({ ...medForm, categoria: e.target.value })}
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      >
                        {CATEGORIAS_MEDICAMENTOS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: STOCK */}
              {medModalTab === 'stock' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Unidad de Medida
                      </label>
                      <select
                        value={medForm.unidad}
                        onChange={(e) =>
                          setMedForm({ ...medForm, unidad: e.target.value as UnidadMedida })
                        }
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      >
                        {UNIDADES_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Fecha de Vencimiento
                      </label>
                      <input
                        type="date"
                        value={medForm.fecha_vencimiento}
                        onChange={(e) => {
                          setMedForm({ ...medForm, fecha_vencimiento: e.target.value })
                          if (e.target.value) clearFieldMissingFlag('fecha_vencimiento')
                        }}
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Cantidad Disponible *
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        required
                        value={medForm.cantidad_actual}
                        onChange={(e) => {
                          setMedForm({ ...medForm, cantidad_actual: Number(e.target.value) })
                          clearFieldMissingFlag('cantidad_actual')
                        }}
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm font-bold text-foreground"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Contenido Total Envase
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={medForm.cantidad_inicial}
                        onChange={(e) => {
                          updateMedFormAutoStock({ cantidad_inicial: Number(e.target.value) })
                          clearFieldMissingFlag('cantidad_inicial')
                        }}
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-zinc-200 block mb-1">
                        Stock Mínimo (por defecto 0, o 20% si es esencial)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={medForm.stock_minimo}
                        onChange={(e) => {
                          setStockMinimoTouched(true)
                          setMedForm({ ...medForm, stock_minimo: Number(e.target.value) })
                        }}
                        className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: USO */}
              {medModalTab === 'uso' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-200 block mb-1">
                      Para qué sirve (solo síntomas resumidos)
                    </label>
                    <input
                      type="text"
                      value={medForm.para_que_sirve}
                      onChange={(e) => updateMedFormAutoStock({ para_que_sirve: e.target.value })}
                      placeholder="Ej: Fiebre, tos, dolor de panza, dolores musculares"
                      className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-200 block mb-1">
                      Dosis recomendada
                    </label>
                    <input
                      type="text"
                      value={medForm.posologia_referencia}
                      onChange={(e) =>
                        setMedForm({ ...medForm, posologia_referencia: e.target.value })
                      }
                      placeholder="Ej: 1 comprimido cada 8 hs"
                      className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-200 block mb-1">
                      Vincular a Esencial (opcional)
                    </label>
                    <select
                      value={medForm.esencial_id}
                      onChange={(e) =>
                        setMedForm({
                          ...medForm,
                          esencial_id: e.target.value,
                          es_esencial: Boolean(e.target.value),
                          stock_minimo: !stockMinimoTouched
                            ? calcularStockMinimoPorDefecto(
                                medForm.cantidad_inicial,
                                esProductoConsideradoEsencial(
                                  {
                                    ...medForm,
                                    esencial_id: e.target.value,
                                    es_esencial: Boolean(e.target.value),
                                  },
                                  state.esenciales
                                )
                              )
                            : medForm.stock_minimo,
                        })
                      }
                      className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                    >
                      <option value="">Detección automática</option>
                      {state.esenciales.map((esc) => (
                        <option key={esc.id} value={esc.id}>
                          ⭐ {esc.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Modal Footer (1 word & grey) */}
              <div className="flex items-center justify-end space-x-2.5 pt-4 mt-4 border-t border-[#383f4e]">
                <button
                  type="button"
                  onClick={() => setMedModalOpen(false)}
                  className={`rounded-xl px-4 py-1.5 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMed}
                  className={`flex items-center space-x-1.5 rounded-xl px-5 py-1.5 text-xs font-semibold disabled:opacity-50 ${greyBtnActive}`}
                >
                  {savingMed && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DESCONTAR DOSIS USADA                                          */}
      {/* ===================================================================== */}
      {dosisModalMed && (
        <div
          onClick={() => setDosisModalMed(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#4a5264] bg-[#232733] p-6 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                Usar • {dosisModalMed.nombre}
              </h3>
              <button
                onClick={() => setDosisModalMed(null)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConsumeDosis} className="mt-4 space-y-4">
              <div className="text-xs text-muted-foreground">
                Disponible:{' '}
                <strong className="text-foreground">
                  {dosisModalMed.cantidad_actual} {dosisModalMed.unidad}
                </strong>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-2">
                  Cantidad ({dosisModalMed.unidad}):
                </label>
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {(dosisModalMed.unidad === 'ml'
                    ? [2.5, 5, 7.5, 10, 15]
                    : dosisModalMed.unidad === 'gotas'
                    ? [5, 10, 15, 20, 30]
                    : [0.5, 1, 2]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDosisCantidad(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        dosisCantidad === preset ? greyBtnActive : greyBtn
                      }`}
                    >
                      -{preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={dosisModalMed.cantidad_actual}
                  required
                  value={dosisCantidad}
                  onChange={(e) => setDosisCantidad(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3.5 py-2 text-sm font-bold text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Nota (opcional):
                </label>
                <input
                  type="text"
                  value={dosisMotivo}
                  onChange={(e) => setDosisMotivo(e.target.value)}
                  placeholder="Ej: Fiebre / Dolor de cabeza"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDosisModalMed(null)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDosis}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtnActive}`}
                >
                  {submittingDosis ? 'Descontando...' : 'Descontar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: REPONER STOCK                                                  */}
      {/* ===================================================================== */}
      {reponerModalMed && (
        <div
          onClick={() => setReponerModalMed(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#4a5264] bg-[#232733] p-6 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                Reponer • {reponerModalMed.nombre}
              </h3>
              <button
                onClick={() => setReponerModalMed(null)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleReponerStock} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Cantidad a sumar ({reponerModalMed.unidad}):
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={reponerCantidad}
                  onChange={(e) => setReponerCantidad(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3.5 py-2 text-sm font-bold text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Nueva fecha de vencimiento:
                </label>
                <input
                  type="date"
                  value={reponerVencimiento}
                  onChange={(e) => setReponerVencimiento(e.target.value)}
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReponerModalMed(null)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReponer}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtnActive}`}
                >
                  {submittingReponer ? 'Guardando...' : 'Reponer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DAR DE BAJA EL PRODUCTO COMPLETO                               */}
      {/* ===================================================================== */}
      {bajaModalMed && (
        <div
          onClick={() => setBajaModalMed(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#4a5264] bg-[#232733] p-6 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-red-300">
                Dar de Baja • {bajaModalMed.nombre}
              </h3>
              <button
                onClick={() => setBajaModalMed(null)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleBajaMedicamento} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-200 block">
                  Motivo:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'vencido', label: 'Vencido' },
                    { id: 'tirado', label: 'Descartado' },
                    { id: 'perdido', label: 'Perdido' },
                    { id: 'agotado', label: 'Agotado' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBajaMotivo(opt.id as MotivoBaja)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold text-center ${
                        bajaMotivo === opt.id ? greyBtnActive : greyBtn
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Comentario (opcional):
                </label>
                <input
                  type="text"
                  value={bajaDetalle}
                  onChange={(e) => setBajaDetalle(e.target.value)}
                  placeholder="Ej: Frasco abierto hace más de 1 mes"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBajaModalMed(null)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingBaja}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtnActive}`}
                >
                  {submittingBaja ? 'Procesando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT PRODUCTO ESENCIAL                                   */}
      {/* ===================================================================== */}
      {esencialModalOpen && (
        <div
          onClick={() => setEsencialModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[#4a5264] bg-[#232733] p-6 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                {editingEsencial ? 'Editar Esencial' : 'Nuevo Esencial'}
              </h3>
              <button
                onClick={() => setEsencialModalOpen(false)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEsencial} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Categoría / Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={esencialForm.nombre}
                  onChange={(e) => setEsencialForm({ ...esencialForm, nombre: e.target.value })}
                  placeholder="Ej: Paracetamol Pediátrico, Sales de Rehidratación Oral..."
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Principal Activo
                  </label>
                  <input
                    type="text"
                    value={esencialForm.droga_sugerida}
                    onChange={(e) =>
                      setEsencialForm({ ...esencialForm, droga_sugerida: e.target.value })
                    }
                    placeholder="Ej: Paracetamol, Ibuprofeno, Loratadina..."
                    className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-2 text-sm text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Público
                  </label>
                  <select
                    value={esencialForm.publico}
                    onChange={(e) =>
                      setEsencialForm({
                        ...esencialForm,
                        publico: e.target.value as PublicoObjetivo,
                      })
                    }
                    className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-2 text-sm text-foreground"
                  >
                    <option value="pediatrico">👶 Bebé</option>
                    <option value="ambos">👨‍👩‍👧 Familia</option>
                    <option value="adulto">🧑 Adultos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Síntomas
                </label>
                <input
                  type="text"
                  value={esencialForm.descripcion}
                  onChange={(e) =>
                    setEsencialForm({ ...esencialForm, descripcion: e.target.value })
                  }
                  placeholder="Ej: Fiebre, dolor de cabeza, inflamación"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Marcas sugeridas / Palabras clave (separadas por coma):
                </label>
                <input
                  type="text"
                  value={esencialForm.keywords}
                  onChange={(e) => setEsencialForm({ ...esencialForm, keywords: e.target.value })}
                  placeholder="Ej: Tafirol, Ibupirac, Actron"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#383f4e]">
                <button
                  type="button"
                  onClick={() => setEsencialModalOpen(false)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${greyBtnActive}`}
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Photo Lightbox Modal */}
      {lightboxPhotos.length > 0 && (
        <div
          onClick={() => setLightboxPhotos([])}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col items-center max-w-3xl w-full"
          >
            <button
              onClick={() => setLightboxPhotos([])}
              className={`absolute -top-10 right-0 rounded-full p-2 ${greyBtn}`}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative flex items-center justify-center w-full">
              {lightboxPhotos.length > 1 && (
                <button
                  onClick={() =>
                    setLightboxIndex(
                      (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length
                    )
                  }
                  className={`absolute left-2 rounded-full p-2 ${greyBtn}`}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              <img
                src={lightboxPhotos[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[75vh] max-w-full rounded-2xl border border-[#4a5264] object-contain"
              />

              {lightboxPhotos.length > 1 && (
                <button
                  onClick={() =>
                    setLightboxIndex((lightboxIndex + 1) % lightboxPhotos.length)
                  }
                  className={`absolute right-2 rounded-full p-2 ${greyBtn}`}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>

            {lightboxPhotos.length > 1 && (
              <div className="mt-4 flex items-center gap-2">
                {lightboxPhotos.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className={`h-14 w-14 rounded-lg overflow-hidden border-2 transition-all ${
                      idx === lightboxIndex ? 'border-primary scale-105' : 'border-transparent opacity-60'
                    }`}
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
