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
  ChevronDown,
  ChevronUp,
  Download,
  Plane,
  Copy,
  Share2,
  Calculator,
  MapPin,
  CheckSquare,
  Square,
  FileText,
  Sun,
} from 'lucide-react'
import {
  AlertaActiva,
  BotiquinConfig,
  BotiquinState,
  calcularDiasVencimiento,
  calcularDosisPediatricaPorPeso,
  calcularEdadDesdeFecha,
  calcularStockMinimoPorDefecto,
  detectarGeneroPorNombre,
  esProductoConsideradoEsencial,
  CATEGORIAS_MEDICAMENTOS,
  esMedicamentoProximoAVencer,
  esMedicamentoVencido,
  ITEMS_VIAJE_EXTRA,
  Medicamento,
  MiembroFamilia,
  MotivoBaja,
  normalizeText,
  obtenerEmojiFamiliar,
  ProductoEsencial,
  PublicoObjetivo,
  UnidadMedida,
  verificarCoberturaEsencial,
  ConfiguracionViaje,
  EntornoViaje,
  evaluarViaje,
  ItemPersonalizadoViaje,
  AlertaEvaluacionViaje,
} from '@/utils/botiquin-types'
import { CampoFaltanteIA, ConsultaAIResponse } from '@/utils/ai-botiquin'

type TabType = 'stock' | 'consulta' | 'viaje' | 'configuracion'
type ConfigSubTab = 'familia' | 'esenciales' | 'alertas'
type ViajeSubTab = 'valija' | 'clima' | 'notas'
type ModoCargaMed = 'hibrido_ia' | 'manual'
type MedModalTab = 'general' | 'stock' | 'uso'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

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
  const [state, setState] = useState<BotiquinState>({
    ...initialState,
    familia: initialState.familia || [],
    consultas_historial: initialState.consultas_historial || [],
  })
  const [, setAlertas] = useState<AlertaActiva[]>(initialAlertas)
  const [activeTab, setActiveTab] = useState<TabType>('stock')
  const [configSubTab, setConfigSubTab] = useState<ConfigSubTab>('familia')
  const [viajeSubTab, setViajeSubTab] = useState<ViajeSubTab>('valija')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null
  )

  // Expanded family member history state inside Configuración -> Familia
  const [expandedFamiliarHistoryId, setExpandedFamiliarHistoryId] = useState<string | null>(null)
  const [familiarHistoryTab, setFamiliarHistoryTab] = useState<'consultas' | 'consumos'>('consultas')

  // PWA Install Prompt state
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalonePWA, setIsStandalonePWA] = useState(false)

  // Mobile / Click Tooltip state for Stock cards ('Función' & 'Dosis')
  const [activeCardTooltip, setActiveCardTooltip] = useState<{
    medId: string
    field: 'funcion' | 'dosis'
  } | null>(null)

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
  const [dosisFamiliarId, setDosisFamiliarId] = useState<string>('')
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

  // Consultorio IA state (Family member selector + 'otro' option)
  const [chatInput, setChatInput] = useState('')
  const [selectedFamiliarId, setSelectedFamiliarId] = useState<string>(() =>
    initialState.familia && initialState.familia.length > 0 ? initialState.familia[0].id : 'otro'
  )
  const [pacienteTipoOtro, setPacienteTipoOtro] = useState<'adulto' | 'pediatrico'>('adulto')
  const [pacienteEdad, setPacienteEdad] = useState('')
  const [pacientePeso, setPacientePeso] = useState('')
  const [consultingAI, setConsultingAI] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([])

  // Family Member Modal state
  const [familiarModalOpen, setFamiliarModalOpen] = useState(false)
  const [editingFamiliar, setEditingFamiliar] = useState<MiembroFamilia | null>(null)
  const [savingFamiliar, setSavingFamiliar] = useState(false)
  const [familiarForm, setFamiliarForm] = useState({
    id: '',
    nombre: '',
    genero: 'masculino' as 'masculino' | 'femenino',
    fecha_nacimiento: '',
    peso_kg: '',
    antecedentes_medicos: '',
    dolores_recurrentes: '',
  })

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

  // Shopping List Modal (1-Click Pharmacy List for WhatsApp)
  const [shoppingModalOpen, setShoppingModalOpen] = useState(false)
  const [includeViajeInShopping, setIncludeViajeInShopping] = useState(false)
  const [excludedShoppingKeys, setExcludedShoppingKeys] = useState<string[]>([])
  const [customShoppingNote, setCustomShoppingNote] = useState('')

  // Travel / Vacation Section State & Persistence (Full dedicated section)
  const [viajeConfig, setViajeConfig] = useState<ConfiguracionViaje>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('botiquin_viaje_config')
        if (saved) return JSON.parse(saved)
      } catch {
        // ignore
      }
    }
    return {
      destino: '',
      entornos: ['playa'],
      familiaresIds: (initialState.familia || []).map((f) => f.id),
      notas: '',
      itemsPersonalizados: [],
    }
  })

  function updateViajeConfig(
    updater:
      | Partial<ConfiguracionViaje>
      | ((prev: ConfiguracionViaje) => ConfiguracionViaje)
  ) {
    setViajeConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      try {
        window.localStorage.setItem('botiquin_viaje_config', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const [packedViajeIds, setPackedViajeIds] = useState<string[]>([])
  const [viajeFiltro, setViajeFiltro] = useState<'todos' | 'pendientes' | 'empacados' | 'faltantes'>('todos')
  const [mostrarFormNuevoItemViaje, setMostrarFormNuevoItemViaje] = useState(false)
  const [nuevoItemViajeNombre, setNuevoItemViajeNombre] = useState('')
  const [nuevoItemViajeDroga, setNuevoItemViajeDroga] = useState('')
  const [nuevoItemViajeParaQue, setNuevoItemViajeParaQue] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedPacked = window.localStorage.getItem('botiquin_viaje_packed')
      if (savedPacked) {
        setPackedViajeIds(JSON.parse(savedPacked))
      }
    } catch {
      // ignore
    }
  }, [])

  function togglePackedViajeItem(id: string) {
    setPackedViajeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try {
        window.localStorage.setItem('botiquin_viaje_packed', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Register Service Worker & listen for PWA beforeinstallprompt
  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsStandalonePWA(checkStandalone)

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  // Close mobile card tooltip when clicking outside
  useEffect(() => {
    if (!activeCardTooltip) return
    const handleOutsideClick = () => setActiveCardTooltip(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [activeCardTooltip])

  // Keep selectedFamiliarId valid when family list changes
  useEffect(() => {
    const fam = state.familia || []
    if (
      selectedFamiliarId !== 'otro' &&
      !fam.some((f) => f.id === selectedFamiliarId)
    ) {
      setSelectedFamiliarId(fam.length > 0 ? fam[0].id : 'otro')
    }
  }, [state.familia, selectedFamiliarId])

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

  // Helper to get clean canonical URL for each section/subsection
  function getSectionUrl(tab: TabType, sub?: string): string {
    if (tab === 'consulta') return '/consultorio'
    if (tab === 'viaje') {
      const targetSub = sub || viajeSubTab
      return targetSub === 'valija' ? '/viaje' : `/viaje?sub=${targetSub}`
    }
    if (tab === 'configuracion') {
      const targetSub = sub || configSubTab
      return targetSub === 'familia' ? '/configuracion' : `/configuracion?sub=${targetSub}`
    }
    return '/stock'
  }

  // Helper to change section/subsection and persist in URL + localStorage so refreshing stays in the exact same view
  function navigateToSection(tab: TabType, sub?: string) {
    setActiveTab(tab)
    if (tab === 'configuracion' && sub) {
      setConfigSubTab(sub as ConfigSubTab)
    } else if (tab === 'viaje' && sub) {
      setViajeSubTab(sub as ViajeSubTab)
    }
    setMobileMenuOpen(false)

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('botiquin_active_tab', tab)
        if (tab === 'configuracion' && sub) {
          window.localStorage.setItem('botiquin_config_subtab', sub)
        } else if (tab === 'viaje' && sub) {
          window.localStorage.setItem('botiquin_viaje_subtab', sub)
        }
      } catch {
        // ignore
      }

      const url = getSectionUrl(tab, sub)
      const currentFullPath = window.location.pathname + window.location.search
      if (currentFullPath !== url) {
        window.history.pushState(null, '', url)
      }
    }
  }

  // Restore exact section and subsection on mount / refresh / popstate
  useEffect(() => {
    function syncTabFromUrlOrStorage() {
      const pathname = window.location.pathname.toLowerCase()
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      const subParam = params.get('sub')

      let resolvedTab: TabType | null = null
      let resolvedSub: ConfigSubTab | null = null
      let resolvedViajeSub: ViajeSubTab | null = null

      // 1. Check clean pathname first (/viaje, /consultorio, /configuracion, /stock)
      if (pathname.startsWith('/viaje')) {
        resolvedTab = 'viaje'
        if (pathname.includes('/clima') || subParam === 'clima') {
          resolvedViajeSub = 'clima'
        } else if (pathname.includes('/notas') || subParam === 'notas') {
          resolvedViajeSub = 'notas'
        } else if (pathname.includes('/valija') || subParam === 'valija') {
          resolvedViajeSub = 'valija'
        }
      } else if (pathname.startsWith('/consultorio') || pathname.startsWith('/consulta')) {
        resolvedTab = 'consulta'
      } else if (pathname.startsWith('/configuracion')) {
        resolvedTab = 'configuracion'
        if (pathname.includes('/esenciales') || subParam === 'esenciales') {
          resolvedSub = 'esenciales'
        } else if (pathname.includes('/alertas') || subParam === 'alertas') {
          resolvedSub = 'alertas'
        } else if (pathname.includes('/familia') || subParam === 'familia') {
          resolvedSub = 'familia'
        }
      } else if (pathname.startsWith('/stock')) {
        resolvedTab = 'stock'
      } else if (pathname.startsWith('/esenciales')) {
        resolvedTab = 'configuracion'
        resolvedSub = 'esenciales'
      } else if (pathname.startsWith('/alertas')) {
        resolvedTab = 'configuracion'
        resolvedSub = 'alertas'
      } else if (pathname.startsWith('/historial')) {
        resolvedTab = 'configuracion'
        resolvedSub = 'familia'
      }

      // 2. Fallback to legacy ?tab= query parameter for backward compatibility
      if (!resolvedTab && tabParam) {
        if (tabParam === 'stock' || tabParam === 'consulta') {
          resolvedTab = tabParam
        } else if (tabParam === 'viaje') {
          resolvedTab = 'viaje'
          if (subParam === 'valija' || subParam === 'clima' || subParam === 'notas') {
            resolvedViajeSub = subParam
          }
        } else if (tabParam === 'configuracion' || tabParam === 'historial') {
          resolvedTab = 'configuracion'
          if (subParam === 'familia' || subParam === 'esenciales' || subParam === 'alertas') {
            resolvedSub = subParam
          } else {
            resolvedSub = 'familia'
          }
        } else if (tabParam === 'esenciales') {
          resolvedTab = 'configuracion'
          resolvedSub = 'esenciales'
        } else if (tabParam === 'alertas') {
          resolvedTab = 'configuracion'
          resolvedSub = 'alertas'
        }
      }

      // 3. Fallback to localStorage if accessed at root '/' or '/dashboard' without a section in URL
      if (!resolvedTab) {
        try {
          const savedTab = window.localStorage.getItem('botiquin_active_tab')
          const savedSub = window.localStorage.getItem('botiquin_config_subtab')
          const savedViajeSub = window.localStorage.getItem('botiquin_viaje_subtab')
          if (
            savedTab === 'stock' ||
            savedTab === 'consulta' ||
            savedTab === 'viaje' ||
            savedTab === 'configuracion'
          ) {
            resolvedTab = savedTab
          }
          if (savedSub === 'familia' || savedSub === 'esenciales' || savedSub === 'alertas') {
            resolvedSub = savedSub
          }
          if (savedViajeSub === 'valija' || savedViajeSub === 'clima' || savedViajeSub === 'notas') {
            resolvedViajeSub = savedViajeSub
          }
        } catch {
          // ignore
        }
      }

      const finalTab = resolvedTab || 'stock'
      const finalSub = resolvedSub || 'familia'
      const finalViajeSub = resolvedViajeSub || 'valija'

      setActiveTab(finalTab)
      setConfigSubTab(finalSub)
      setViajeSubTab(finalViajeSub)

      try {
        window.localStorage.setItem('botiquin_active_tab', finalTab)
        window.localStorage.setItem('botiquin_config_subtab', finalSub)
        window.localStorage.setItem('botiquin_viaje_subtab', finalViajeSub)
      } catch {
        // ignore
      }

      const expectedUrl = getSectionUrl(finalTab, finalTab === 'viaje' ? finalViajeSub : finalSub)
      const currentFullPath = window.location.pathname + window.location.search

      // Keep URL clean and updated if arrived from legacy ?tab= or root /
      if (
        currentFullPath !== expectedUrl &&
        (window.location.search.includes('tab=') ||
          window.location.pathname === '/' ||
          window.location.pathname === '/dashboard')
      ) {
        window.history.replaceState(null, '', expectedUrl)
      }
    }

    syncTabFromUrlOrStorage()
    window.addEventListener('popstate', syncTabFromUrlOrStorage)
    return () => window.removeEventListener('popstate', syncTabFromUrlOrStorage)
  }, [])

  function handleTabNavClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    tab: TabType,
    sub?: string
  ) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
      return
    }
    e.preventDefault()
    navigateToSection(tab, sub)
  }

  // Close any open pop-up when pressing ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activeCardTooltip) {
          setActiveCardTooltip(null)
          return
        }
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
        if (familiarModalOpen) {
          setFamiliarModalOpen(false)
          return
        }
        if (esencialModalOpen) {
          setEsencialModalOpen(false)
          return
        }
        if (shoppingModalOpen) {
          setShoppingModalOpen(false)
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
    activeCardTooltip,
    lightboxPhotos.length,
    dosisModalMed,
    reponerModalMed,
    bajaModalMed,
    familiarModalOpen,
    esencialModalOpen,
    shoppingModalOpen,
    medModalOpen,
  ])

  function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ text, type })
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev))
    }, 4500)
  }

  async function handleInstallPWA() {
    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt()
      const choice = await deferredInstallPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredInstallPrompt(null)
        showToast('¡Instalando Botiquín Virtual en tu dispositivo!', 'success')
      }
      setMobileMenuOpen(false)
    } else {
      showToast(
        'En Chrome tocá el menú (⋮) > "Instalar aplicación" o en iOS "Compartir" > "Agregar a inicio".',
        'info'
      )
    }
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

  // Evaluation of Travel Recommendations according to destination & environments
  const viajeEvaluacion = useMemo(() => {
    return evaluarViaje(viajeConfig.entornos, viajeConfig.destino)
  }, [viajeConfig.entornos, viajeConfig.destino])

  // Travel / Vacation Checklist (Esenciales adaptados a quienes viajan + Extras destino + Personalizados)
  const viajeChecklist = useMemo(() => {
    const activosVigentes = state.medicamentos.filter(
      (m) => m.estado === 'activo' && m.cantidad_actual > 0 && !esMedicamentoVencido(m)
    )

    // Determine who travels
    const familiaresViajando = (state.familia || []).filter((f) =>
      viajeConfig.familiaresIds.length === 0 || viajeConfig.familiaresIds.includes(f.id)
    )
    const hayNinosViajando = familiaresViajando.some(
      (f) => calcularEdadDesdeFecha(f.fecha_nacimiento).esPediatrico
    )
    const hayAdultosViajando = familiaresViajando.some(
      (f) => !calcularEdadDesdeFecha(f.fecha_nacimiento).esPediatrico
    )

    // 1. Esenciales de la familia
    const itemsEsenciales = sortedEsenciales
      .filter((e) => {
        if (!e.activo) return false
        if (!hayNinosViajando && e.publico === 'pediatrico') return false
        if (!hayAdultosViajando && e.publico === 'adulto') return false
        return true
      })
      .map((esc) => {
        const { cubierto, medicamentosQueCubren } = verificarCoberturaEsencial(
          esc,
          state.medicamentos
        )
        return {
          id: `esc:${esc.id}`,
          origen: 'esencial' as const,
          nombre: formatCategoriaEsencial(esc),
          droga: formatPrincipalActivoEsencial(esc),
          publico: esc.publico,
          descripcion: formatSintomasEsencial(esc),
          cubierto,
          stockDetalle: medicamentosQueCubren
            .map((m) => `${formatEspacioMedida(m.nombre)} (${m.cantidad_actual} ${m.unidad})`)
            .join(', '),
          medicamentosQueCubren,
        }
      })

    // 2. Extras sugeridos por destino y entorno
    const itemsExtras = viajeEvaluacion.extrasSugeridos
      .filter((extra) => {
        return !itemsEsenciales.some((ie) =>
          extra.keywords.some((kw) => normalizeText(ie.nombre).includes(normalizeText(kw)))
        )
      })
      .map((extra) => {
        const matches = activosVigentes.filter((m) => {
          const text = normalizeText(`${m.nombre} ${m.droga} ${m.para_que_sirve} ${m.categoria}`)
          return extra.keywords.some((kw) => text.includes(normalizeText(kw)))
        })
        return {
          id: `extra:${extra.id}`,
          origen: 'viaje' as const,
          nombre: extra.nombre,
          droga: extra.droga_sugerida,
          publico: extra.publico,
          descripcion: extra.descripcion,
          cubierto: matches.length > 0,
          stockDetalle: matches
            .map((m) => `${formatEspacioMedida(m.nombre)} (${m.cantidad_actual} ${m.unidad})`)
            .join(', '),
          medicamentosQueCubren: matches,
        }
      })

    // 3. Ítems personalizados agregados manualmente
    const itemsPersonalizados = (viajeConfig.itemsPersonalizados || []).map((custom) => {
      const matches = activosVigentes.filter((m) => {
        const text = normalizeText(`${m.nombre} ${m.droga} ${m.para_que_sirve} ${m.categoria}`)
        return (
          text.includes(normalizeText(custom.nombre)) ||
          (custom.droga_sugerida && text.includes(normalizeText(custom.droga_sugerida)))
        )
      })
      return {
        id: `custom:${custom.id}`,
        origen: 'personalizado' as const,
        nombre: custom.nombre,
        droga: custom.droga_sugerida || 'Personalizado',
        publico: 'ambos' as PublicoObjetivo,
        descripcion: custom.descripcion || '',
        cubierto: matches.length > 0,
        stockDetalle: matches
          .map((m) => `${formatEspacioMedida(m.nombre)} (${m.cantidad_actual} ${m.unidad})`)
          .join(', '),
        medicamentosQueCubren: matches,
      }
    })

    return [...itemsEsenciales, ...itemsExtras, ...itemsPersonalizados]
  }, [sortedEsenciales, state.medicamentos, state.familia, viajeConfig, viajeEvaluacion])

  // Pharmacy Shopping List (Esenciales faltantes + Vencidos / Sin Stock + optional Viaje extras)
  const shoppingListItems = useMemo(() => {
    const list: {
      key: string
      titulo: string
      subtitulo: string
      motivo: 'Esencial faltante' | 'Reponer (Sin stock / Vencido)' | 'Botiquín de viaje'
    }[] = []

    // 1. Missing Esenciales
    for (const esc of sortedEsenciales.filter((e) => e.activo)) {
      const { cubierto } = verificarCoberturaEsencial(esc, state.medicamentos)
      if (!cubierto) {
        const pubLabel =
          esc.publico === 'pediatrico'
            ? '👶 Bebé/Niño'
            : esc.publico === 'adulto'
            ? '🧑 Adulto'
            : '👨‍👩‍👧 Familia'
        const marcas = formatMarcasSugeridas(esc)
        list.push({
          key: `esc-${esc.id}`,
          titulo: `${formatCategoriaEsencial(esc)} (${pubLabel})`,
          subtitulo: `${formatPrincipalActivoEsencial(esc)}${
            marcas && marcas !== '-' ? ` • Ej: ${marcas}` : ''
          }`,
          motivo: 'Esencial faltante',
        })
      }
    }

    // 2. Expired or Zero-Stock Medications in Stock
    for (const med of state.medicamentos.filter((m) => m.estado === 'activo')) {
      const venc = esMedicamentoVencido(med)
      const agotado = med.cantidad_actual <= 0
      if (venc || agotado) {
        list.push({
          key: `med-${med.id}`,
          titulo: formatEspacioMedida(med.nombre),
          subtitulo: `${formatEspacioMedida(med.droga) || med.categoria} (${
            venc ? 'Vencido' : 'Sin stock'
          })`,
          motivo: 'Reponer (Sin stock / Vencido)',
        })
      }
    }

    // 3. Optional Travel Missing Items
    if (includeViajeInShopping) {
      for (const v of viajeChecklist) {
        if (!v.cubierto && !list.some((existing) => existing.key === v.id || existing.titulo === v.nombre)) {
          list.push({
            key: v.id,
            titulo: v.nombre,
            subtitulo: v.droga,
            motivo: 'Botiquín de viaje',
          })
        }
      }
    }

    return list
  }, [sortedEsenciales, state.medicamentos, includeViajeInShopping, viajeChecklist])

  function buildShoppingWhatsAppText(): string {
    const selected = shoppingListItems.filter((item) => !excludedShoppingKeys.includes(item.key))
    const lines: string[] = ['🛒 *Lista de Farmacia - Botiquín Familiar*']
    if (selected.length > 0) {
      lines.push('')
      for (const item of selected) {
        lines.push(`• *${item.titulo}* — ${item.subtitulo}`)
      }
    }
    if (customShoppingNote.trim()) {
      lines.push('')
      lines.push(`📝 *Nota:* ${customShoppingNote.trim()}`)
    }
    return lines.join('\n')
  }

  function openWhatsApp(text: string) {
    // Usamos api.whatsapp.com/send/?text= directamente para evitar el bug del acortador wa.me,
    // el cual en su redirección HTTP 302 corrompe los emojis UTF-8 de 4 bytes convirtiéndolos en  (\uFFFD)
    const url = `https://api.whatsapp.com/send/?text=${encodeURIComponent(text)}`
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      window.location.href = url
    }
  }

  async function copyToClipboard(text: string, successMsg: string = 'Copiado al portapapeles.') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      showToast(successMsg, 'success')
    } catch {
      showToast('No se pudo copiar automáticamente.', 'error')
    }
  }

  function buildViajeWhatsAppText(): string {
    const lines: string[] = ['🧳 *Botiquín de Viaje / Vacaciones*']
    const entornosLabels = viajeConfig.entornos
      .map((e) => {
        if (e === 'playa') return '🏖️ Playa'
        if (e === 'montana') return '🏔️ Montaña'
        if (e === 'selva') return '🌴 Selva/Trópico'
        return '🏙️ Ciudad'
      })
      .join(', ')

    if (entornosLabels) {
      lines.push(`• *Clima / Entorno:* ${entornosLabels}`)
    }

    const familiaresViajando = (state.familia || []).filter((f) =>
      viajeConfig.familiaresIds.length === 0 || viajeConfig.familiaresIds.includes(f.id)
    )
    if (familiaresViajando.length > 0) {
      lines.push(`• *Viajeros:* ${familiaresViajando.map((f) => f.nombre).join(', ')}`)
    }

    const empacados = viajeChecklist.filter((i) => packedViajeIds.includes(i.id))
    const pendientes = viajeChecklist.filter((i) => !packedViajeIds.includes(i.id))
    const faltantes = viajeChecklist.filter((i) => !i.cubierto)

    lines.push('')
    lines.push(`📋 *Progreso:* ${empacados.length} de ${viajeChecklist.length} en valija`)

    if (faltantes.length > 0) {
      lines.push('')
      lines.push('🛒 *FALTA COMPRAR EN FARMACIA:*')
      for (const f of faltantes) {
        lines.push(`• [ ] *${f.nombre}* (${f.droga})`)
      }
    }

    if (pendientes.length > 0) {
      lines.push('')
      lines.push('📦 *PENDIENTE DE GUARDAR EN VALIJA:*')
      for (const p of pendientes) {
        lines.push(`• [ ] ${p.nombre}${p.cubierto ? ' (✓ En stock)' : ' (⚠️ Falta comprar)'}`)
      }
    }

    if (empacados.length > 0) {
      lines.push('')
      lines.push('✅ *YA GUARDADO EN LA VALIJA:*')
      for (const e of empacados) {
        lines.push(`• [✓] ${e.nombre}`)
      }
    }

    if (viajeConfig.notas && viajeConfig.notas.trim()) {
      lines.push('')
      lines.push(`📝 *Notas:* ${viajeConfig.notas.trim()}`)
    }

    return lines.join('\n')
  }

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

  // Add photos WITHOUT auto-triggering AI analysis so user can take multiple photos first
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

      showToast(
        `${compressedList.length} foto(s) cargada(s). Podés sumar más o presionar "Analizar".`,
        'info'
      )
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

    const familiarObj = (state.familia || []).find((f) => f.id === dosisFamiliarId)

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
          familiar_id: familiarObj ? familiarObj.id : null,
          familiar_nombre: familiarObj ? familiarObj.nombre : null,
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
          familiarObj ? ` (${familiarObj.nombre})` : ''
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
    const familiarObj =
      selectedFamiliarId !== 'otro'
        ? (state.familia || []).find((f) => f.id === selectedFamiliarId)
        : null

    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'consume_dosis',
          id: medId,
          cantidad,
          motivo: 'Dosis registrada desde el Consultorio IA',
          familiar_id: familiarObj ? familiarObj.id : null,
          familiar_nombre: familiarObj ? familiarObj.nombre : 'Otro',
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      showToast(
        `Dosis descontada de ${nombre} (-${cantidad})${
          familiarObj ? ` • ${familiarObj.nombre}` : ''
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

    const familiarObj =
      selectedFamiliarId !== 'otro'
        ? (state.familia || []).find((f) => f.id === selectedFamiliarId) || null
        : null

    let labelPaciente = 'Otro'
    let detalleEdadPeso = ''
    let tipoParaIA: 'auto' | 'adulto' | 'pediatrico' = pacienteTipoOtro

    if (familiarObj) {
      const edadInfo = calcularEdadDesdeFecha(familiarObj.fecha_nacimiento)
      const emojiFam = obtenerEmojiFamiliar(familiarObj)
      labelPaciente = `${emojiFam} ${familiarObj.nombre}`
      const parts: string[] = [edadInfo.texto]
      if (familiarObj.peso_kg) parts.push(`${familiarObj.peso_kg} kg`)
      detalleEdadPeso = parts.join(' • ')
      tipoParaIA = edadInfo.esPediatrico ? 'pediatrico' : 'adulto'
    } else {
      labelPaciente =
        pacienteTipoOtro === 'pediatrico' ? '👶 Otro (Bebé/Niño)' : '🧑 Otro (Adulto)'
      const edadPesoParts: string[] = []
      if (pacienteEdad.trim()) edadPesoParts.push(`Edad: ${pacienteEdad.trim()} años`)
      if (pacientePeso.trim()) edadPesoParts.push(`Peso: ${pacientePeso.trim()} kg`)
      detalleEdadPeso = edadPesoParts.join(', ')
    }

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: queryText,
      pacienteTipo: labelPaciente,
      edadPeso: detalleEdadPeso,
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
          familiarId: familiarObj ? familiarObj.id : 'otro',
          pacienteNombre: familiarObj ? familiarObj.nombre : labelPaciente,
          pacienteTipo: tipoParaIA,
          edadPesoDetalle: detalleEdadPeso,
          pesoOverride: pacientePeso.trim() || null,
          historial: historialPayload,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      if (json.state) {
        setState(json.state)
      }

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

  // Family Member handlers
  function openNewFamiliarModal() {
    setEditingFamiliar(null)
    setFamiliarForm({
      id: '',
      nombre: '',
      genero: 'masculino',
      fecha_nacimiento: '',
      peso_kg: '',
      antecedentes_medicos: '',
      dolores_recurrentes: '',
    })
    setFamiliarModalOpen(true)
  }

  function openEditFamiliarModal(miembro: MiembroFamilia) {
    setEditingFamiliar(miembro)
    const detectedGen =
      miembro.genero ||
      (miembro.alergias === 'femenino' || miembro.alergias === 'masculino'
        ? miembro.alergias
        : detectarGeneroPorNombre(miembro.nombre))
    setFamiliarForm({
      id: miembro.id,
      nombre: miembro.nombre,
      genero: detectedGen,
      fecha_nacimiento: miembro.fecha_nacimiento || '',
      peso_kg:
        miembro.peso_kg !== null && miembro.peso_kg !== undefined
          ? String(miembro.peso_kg)
          : '',
      antecedentes_medicos: miembro.antecedentes_medicos || '',
      dolores_recurrentes: miembro.dolores_recurrentes || '',
    })
    setFamiliarModalOpen(true)
  }

  async function handleSaveFamiliar(e: React.FormEvent) {
    e.preventDefault()
    if (!familiarForm.nombre.trim()) {
      showToast('Ingresá el nombre del integrante', 'error')
      return
    }
    setSavingFamiliar(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_familiar',
          familiar: {
            ...familiarForm,
            peso_kg: familiarForm.peso_kg.trim() ? Number(familiarForm.peso_kg) : null,
          },
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)
      if (json.miembro && selectedFamiliarId === 'otro' && state.familia.length === 0) {
        setSelectedFamiliarId(json.miembro.id)
      }
      setFamiliarModalOpen(false)
      const extraMsg =
        json.nuevosEsencialesCount > 0
          ? ` • Se sumaron ${json.nuevosEsencialesCount} esencial(es) al catálogo según su ficha`
          : ''
      showToast(`Integrante "${familiarForm.nombre}" guardado${extraMsg}`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error guardando integrante', 'error')
    } finally {
      setSavingFamiliar(false)
    }
  }

  async function handleDeleteFamiliar(id: string, nombre: string) {
    if (!confirm(`¿Quitar a "${nombre}" del grupo familiar?`)) return
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_familiar', id }),
      })
      const json = await res.json()
      if (json.ok) {
        setState(json.state)
        setAlertas(json.alertasActivas)
        showToast(`"${nombre}" eliminado del grupo familiar`, 'info')
      }
    } catch {
      showToast('Error eliminando integrante', 'error')
    }
  }

  async function handleDeleteConsultaHistorial(id: string) {
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_consulta_historial', id }),
      })
      const json = await res.json()
      if (json.ok) {
        setState(json.state)
        showToast('Consulta eliminada del historial', 'info')
      }
    } catch {
      showToast('Error eliminando consulta', 'error')
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

  const activeFamiliarObj = useMemo(
    () =>
      selectedFamiliarId !== 'otro'
        ? (state.familia || []).find((f) => f.id === selectedFamiliarId) || null
        : null,
    [state.familia, selectedFamiliarId]
  )

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0c10] text-foreground pb-20 landscape:pb-16 md:pb-8">
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

      {/* Navbar (compact in mobile landscape) */}
      <nav className="border-b border-[#383e4e] bg-[#1e222d] px-4 md:px-8 py-3 landscape:py-2 md:landscape:py-3.5 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center space-x-8">
            <a
              href="/stock"
              onClick={(e) => handleTabNavClick(e, 'stock')}
              className="flex items-center space-x-3 text-left"
            >
              <div className="flex h-9 w-9 landscape:h-8 landscape:w-8 md:landscape:h-9 md:landscape:w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/40 text-primary">
                <HeartPulse className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-foreground tracking-tight block leading-none">
                Botiquín Virtual
              </span>
            </a>

            {/* Desktop Nav Links: Stock | Consultorio IA | Configuración */}
            <div className="hidden lg:flex items-center space-x-2">
              <a
                href="/stock"
                onClick={(e) => handleTabNavClick(e, 'stock')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'stock'
                    ? greyBtnActive
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Stock</span>
              </a>

              <a
                href="/consultorio"
                onClick={(e) => handleTabNavClick(e, 'consulta')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'consulta'
                    ? greyBtnActive
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Bot className="h-4 w-4" />
                <span>Consultorio IA</span>
              </a>

              <a
                href="/viaje"
                onClick={(e) => handleTabNavClick(e, 'viaje')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'viaje'
                    ? greyBtnActive
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Plane className="h-4 w-4" />
                <span>Viaje</span>
              </a>

              <a
                href="/configuracion"
                onClick={(e) => handleTabNavClick(e, 'configuracion', configSubTab)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  activeTab === 'configuracion'
                    ? greyBtnActive
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </a>
            </div>
          </div>

          <div className="hidden lg:flex items-center space-x-3">
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

          {/* Mobile & Mobile-Landscape Header Right (conserves Hamburger Menu) */}
          <div className="flex lg:hidden items-center space-x-2">
            <button
              onClick={() => openNewMedModal()}
              className="flex items-center space-x-1 rounded-xl bg-primary/15 border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
            >
              <span>+ Medicamento</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-lg ${greyBtn}`}
              aria-label="Menú"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Hamburger Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#383e4e] mt-2.5 pt-2.5 pb-2 flex flex-col space-y-1.5 max-h-[75dvh] overflow-y-auto">
            <a
              href="/stock"
              onClick={(e) => handleTabNavClick(e, 'stock')}
              className={`flex items-center space-x-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === 'stock'
                  ? greyBtnActive
                  : 'text-zinc-200 hover:bg-zinc-800/70'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Stock</span>
            </a>

            <a
              href="/consultorio"
              onClick={(e) => handleTabNavClick(e, 'consulta')}
              className={`flex items-center space-x-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === 'consulta'
                  ? greyBtnActive
                  : 'text-zinc-200 hover:bg-zinc-800/70'
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>Consultorio IA</span>
            </a>

            <a
              href="/viaje"
              onClick={(e) => handleTabNavClick(e, 'viaje')}
              className={`flex items-center space-x-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === 'viaje'
                  ? greyBtnActive
                  : 'text-zinc-200 hover:bg-zinc-800/70'
              }`}
            >
              <Plane className="h-4 w-4" />
              <span>Botiquín de Viaje</span>
            </a>

            <a
              href="/configuracion"
              onClick={(e) => handleTabNavClick(e, 'configuracion', configSubTab)}
              className={`flex items-center space-x-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === 'configuracion'
                  ? greyBtnActive
                  : 'text-zinc-200 hover:bg-zinc-800/70'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Configuración</span>
            </a>

            {!isStandalonePWA && (
              <button
                type="button"
                onClick={handleInstallPWA}
                className={`w-full flex items-center space-x-2.5 rounded-lg px-3 py-2 text-sm font-medium ${greyBtn}`}
              >
                <Download className="h-4 w-4 text-primary" />
                <span>Instalar</span>
              </button>
            )}

            <div className="border-t border-[#2e3444] pt-2 mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground px-2 truncate">
                {userEmail}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${greyBtn}`}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Salir</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8 py-4 landscape:py-3 md:py-6">
        {/* ================================================================= */}
        {/* TAB 1: STOCK                                                      */}
        {/* ================================================================= */}
        {activeTab === 'stock' && (
          <div className="space-y-5">
            {/* 3 Compact Top Summary Cards (3 columns in mobile landscape too) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 landscape:grid-cols-3 gap-3.5">
              <div
                onClick={() => setFilterEstado('proximo_vencer')}
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Próximos a Vencer
                  </span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-1 flex items-baseline">
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
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3 hover:border-red-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vencidos / Sin Stock
                  </span>
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div className="mt-1 flex items-baseline space-x-2">
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
                onClick={() => navigateToSection('configuracion', 'esenciales')}
                className="cursor-pointer rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Primera Necesidad
                  </span>
                  <Star className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-1 flex items-baseline">
                  <span className="text-2xl font-bold text-foreground">
                    {kpis.esencialesCubiertos} de {kpis.esencialesTotal}
                  </span>
                </div>
              </div>
            </div>

            {/* Filters & Search Bar */}
            <div className="flex flex-col space-y-3 rounded-xl border border-[#323846] bg-[#171a22] p-3.5">
              <div className="flex flex-col md:flex-row landscape:flex-row gap-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
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

                  <button
                    type="button"
                    onClick={() => setShoppingModalOpen(true)}
                    title="Lista de Compras de Farmacia (Compartir por WhatsApp)"
                    className={`shrink-0 flex items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${greyBtn}`}
                  >
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    <span className="hidden sm:inline">Compras</span>
                    {shoppingListItems.length > 0 && (
                      <span className="rounded-full bg-primary/20 border border-primary/40 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                        {shoppingListItems.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Público Filter Pills */}
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

              {/* Status Filter Tabs (ocupa todo el ancho, sin scroll horizontal en vertical) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-[#2c313f]">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-center truncate transition-colors ${
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

            {/* Medications Grid (2 cols in mobile landscape, 3 in desktop) */}
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
              <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  const isFuncionOpen =
                    activeCardTooltip?.medId === med.id && activeCardTooltip?.field === 'funcion'
                  const isDosisOpen =
                    activeCardTooltip?.medId === med.id && activeCardTooltip?.field === 'dosis'

                  return (
                    <div
                      key={med.id}
                      className={`flex flex-col justify-between rounded-2xl border bg-[#171a22] p-4 shadow-md transition-all ${
                        vencido
                          ? 'border-red-400/50'
                          : proximo
                          ? 'border-amber-400/45'
                          : sinStock
                          ? 'border-rose-400/40 opacity-90'
                          : 'border-[#323846] hover:border-zinc-500'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Header row: Photo + Badges */}
                        <div className="flex items-start gap-3">
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

                            <h3 className="group/nombre relative text-base font-bold text-foreground leading-snug cursor-default">
                              <span className="block truncate">
                                {formatEspacioMedida(med.nombre)}
                              </span>
                              <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/nombre:block z-50 w-max max-w-[260px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-2xl whitespace-normal break-words">
                                {formatEspacioMedida(med.nombre)}
                              </span>
                            </h3>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {formatEspacioMedida(med.droga) || 'Sin especificar'}{' '}
                              {med.concentracion
                                ? `• ${formatEspacioMedida(med.concentracion)}`
                                : ''}
                            </p>
                          </div>
                        </div>

                        {/* Disponibilidad: 75% | Vencimiento: 12/2027 ('|' exactly centered) */}
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
                        <div className="mt-3.5 pt-3 border-t border-[#282d3a] flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveCardTooltip((prev) =>
                                prev?.medId === med.id && prev?.field === 'funcion'
                                  ? null
                                  : { medId: med.id, field: 'funcion' }
                              )
                            }}
                            className={`group/sirve relative flex-1 flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium ${
                              isFuncionOpen ? greyBtnActive : greyBtn
                            }`}
                          >
                            <span>Función</span>
                            <span
                              className={`pointer-events-none absolute left-0 bottom-full mb-1.5 ${
                                isFuncionOpen
                                  ? 'block'
                                  : 'hidden md:group-hover/sirve:block'
                              } z-50 w-max max-w-[250px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-3 py-2 text-xs font-normal text-left text-zinc-100 shadow-2xl whitespace-normal break-words leading-relaxed`}
                            >
                              <strong className="text-red-300 block mb-0.5">Función:</strong>
                              {med.para_que_sirve || sintomasResumidos || 'Sin especificar'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveCardTooltip((prev) =>
                                prev?.medId === med.id && prev?.field === 'dosis'
                                  ? null
                                  : { medId: med.id, field: 'dosis' }
                              )
                            }}
                            className={`group/dosis relative flex-1 flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium ${
                              isDosisOpen ? greyBtnActive : greyBtn
                            }`}
                          >
                            <span>Dosis</span>
                            <span
                              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 ${
                                isDosisOpen
                                  ? 'block'
                                  : 'hidden md:group-hover/dosis:block'
                              } z-50 w-max max-w-[270px] rounded-lg border border-[#4a5264] bg-[#1e222d] px-3 py-2 text-xs font-normal text-left text-zinc-100 shadow-2xl whitespace-normal break-words leading-relaxed`}
                            >
                              <strong className="text-sky-300 block mb-0.5">Dosis:</strong>
                              <span>{med.posologia_referencia || 'Sin especificar'}</span>
                              {(() => {
                                const miembrosPediatricosConPeso = (state.familia || []).filter(
                                  (f) =>
                                    f.peso_kg &&
                                    f.peso_kg > 0 &&
                                    calcularEdadDesdeFecha(f.fecha_nacimiento).esPediatrico
                                )
                                const todosConPeso =
                                  miembrosPediatricosConPeso.length > 0
                                    ? miembrosPediatricosConPeso
                                    : (state.familia || []).filter(
                                        (f) => f.peso_kg && f.peso_kg > 0 && f.peso_kg <= 40
                                      )

                                if (todosConPeso.length > 0) {
                                  const calculos = todosConPeso
                                    .map((f) => ({
                                      miembro: f,
                                      calc: calcularDosisPediatricaPorPeso(med, f.peso_kg),
                                    }))
                                    .filter((x) => x.calc !== null)

                                  if (calculos.length === 0) return null
                                  return (
                                    <span className="mt-1.5 pt-1.5 border-t border-[#343a48] block space-y-1">
                                      <strong className="text-emerald-300 text-[11px] block">
                                        🧮 Dosis sugerida por peso:
                                      </strong>
                                      {calculos.map(({ miembro, calc }) => (
                                        <span
                                          key={miembro.id}
                                          className="block text-[11px] text-zinc-200"
                                        >
                                          {obtenerEmojiFamiliar(miembro)} <strong>{miembro.nombre}</strong> ({miembro.peso_kg} kg):{' '}
                                          <strong className="text-white">{calc!.dosisTexto}</strong>
                                        </span>
                                      ))}
                                    </span>
                                  )
                                }

                                // Referencia por peso 10 kg / 15 kg si es pediátrico y aún no cargaron peso
                                const ref10 = calcularDosisPediatricaPorPeso(med, 10)
                                const ref15 = calcularDosisPediatricaPorPeso(med, 15)
                                if (!ref10 || !ref15) return null
                                return (
                                  <span className="mt-1.5 pt-1.5 border-t border-[#343a48] block space-y-0.5">
                                    <strong className="text-emerald-300 text-[11px] block">
                                      🧮 Guía rápida por peso ({ref10.formula}):
                                    </strong>
                                    <span className="block text-[11px] text-zinc-200">
                                      • 10 kg: <strong>{ref10.dosisTexto}</strong>
                                    </span>
                                    <span className="block text-[11px] text-zinc-200">
                                      • 15 kg: <strong>{ref15.dosisTexto}</strong>
                                    </span>
                                  </span>
                                )
                              })()}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={med.cantidad_actual <= 0}
                            onClick={() => {
                              setDosisModalMed(med)
                              setDosisCantidad(med.unidad === 'ml' ? 5 : 1)
                              setDosisMotivo('')
                              setDosisFamiliarId(
                                state.familia && state.familia.length > 0
                                  ? state.familia[0].id
                                  : ''
                              )
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
                        <div className="mt-3.5 pt-3 border-t border-[#282d3a] flex items-center justify-between text-xs">
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
        {/* TAB 2: CONSULTORIO IA (ADAPTIVE IN MOBILE PORTRAIT & LANDSCAPE)   */}
        {/* ================================================================= */}
        {activeTab === 'consulta' && (
          <div className="grid grid-cols-1 landscape:grid-cols-3 lg:grid-cols-3 gap-4 items-stretch">
            {/* Left Column: Family Member Selector + 'Otro' + Virtual Medical Robot */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#323846] bg-[#171a22] p-4 lg:h-[calc(100vh-175px)] lg:min-h-[390px] lg:max-h-[490px] overflow-hidden">
              <div className="space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
                      <Bot className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-bold text-foreground">
                      Consultorio IA
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigateToSection('configuracion', 'familia')}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    + Familia
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    ¿Para quién es la consulta?
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-[82px] overflow-y-auto pr-0.5">
                    {(state.familia || []).map((miembro) => {
                      const selected = selectedFamiliarId === miembro.id
                      return (
                        <button
                          key={miembro.id}
                          type="button"
                          onClick={() => setSelectedFamiliarId(miembro.id)}
                          className={`flex items-center space-x-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium ${
                            selected ? greyBtnActive : greyBtn
                          }`}
                        >
                          <span>{obtenerEmojiFamiliar(miembro)}</span>
                          <span className="truncate max-w-[100px]">{miembro.nombre}</span>
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => setSelectedFamiliarId('otro')}
                      className={`flex items-center space-x-1 py-1.5 px-2.5 rounded-lg text-xs font-medium ${
                        selectedFamiliarId === 'otro' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Otro</span>
                    </button>
                  </div>
                </div>

                {/* Selected Family Member summary OR 'Otro' manual inputs */}
                {activeFamiliarObj ? (
                  <div className="rounded-xl border border-[#2c3242] bg-[#0e1016] px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between text-zinc-200 font-medium">
                      <span>
                        Edad:{' '}
                        <strong>
                          {calcularEdadDesdeFecha(activeFamiliarObj.fecha_nacimiento).texto}
                        </strong>
                      </span>
                      <span>
                        Peso:{' '}
                        <strong>
                          {activeFamiliarObj.peso_kg
                            ? `${activeFamiliarObj.peso_kg} kg`
                            : 'Sin cargar'}
                        </strong>
                      </span>
                    </div>
                    {(activeFamiliarObj.antecedentes_medicos ||
                      activeFamiliarObj.dolores_recurrentes) && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {[
                          activeFamiliarObj.antecedentes_medicos,
                          activeFamiliarObj.dolores_recurrentes,
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPacienteTipoOtro('pediatrico')}
                        className={`flex items-center justify-center space-x-1 py-1 px-2 rounded-lg text-xs font-medium ${
                          pacienteTipoOtro === 'pediatrico' ? greyBtnActive : greyBtn
                        }`}
                      >
                        <Baby className="h-3.5 w-3.5" />
                        <span>Bebé</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPacienteTipoOtro('adulto')}
                        className={`flex items-center justify-center space-x-1 py-1 px-2 rounded-lg text-xs font-medium ${
                          pacienteTipoOtro === 'adulto' ? greyBtnActive : greyBtn
                        }`}
                      >
                        <User className="h-3.5 w-3.5" />
                        <span>Adulto</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="120"
                          step="1"
                          inputMode="numeric"
                          value={pacienteEdad}
                          onChange={(e) => setPacienteEdad(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="Edad (años)"
                          className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          min="0"
                          max="300"
                          step="0.1"
                          inputMode="decimal"
                          value={pacientePeso}
                          onChange={(e) => setPacientePeso(e.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="Peso (kg)"
                          className="w-full rounded-lg border border-[#343a48] bg-[#0e1016] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Virtual Medical Robot Character (hidden on ultra-short mobile landscape to avoid overflow) */}
              <div className="mt-2.5 flex-1 min-h-0 hidden sm:flex landscape:hidden lg:landscape:flex flex-col items-center justify-center rounded-xl border border-[#282d3b] bg-[#10131b] p-2 text-center overflow-hidden">
                <svg
                  viewBox="0 0 180 145"
                  className="h-14 w-18 md:h-16 md:w-20 shrink-0 drop-shadow-md"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line x1="90" y1="8" x2="90" y2="22" stroke="#525b70" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="90" cy="7" r="5" fill="#f87171" />
                  <rect x="48" y="22" width="84" height="54" rx="18" fill="#232836" stroke="#4a5264" strokeWidth="2.5" />
                  <rect x="40" y="38" width="8" height="20" rx="4" fill="#363d4f" />
                  <rect x="132" y="38" width="8" height="20" rx="4" fill="#363d4f" />
                  <rect x="78" y="16" width="24" height="14" rx="5" fill="#171a22" stroke="#4a5264" strokeWidth="2" />
                  <path d="M90 19V27M86 23H94" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
                  <rect x="58" y="34" width="64" height="32" rx="10" fill="#0e1016" stroke="#323846" strokeWidth="1.5" />
                  <circle cx="75" cy="48" r="5" fill="#f87171" />
                  <circle cx="77" cy="46" r="1.5" fill="#ffffff" />
                  <circle cx="105" cy="48" r="5" fill="#f87171" />
                  <circle cx="107" cy="46" r="1.5" fill="#ffffff" />
                  <path d="M82 57C85 60 95 60 98 57" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" />
                  <rect x="80" y="76" width="20" height="8" rx="2" fill="#363d4f" />
                  <path
                    d="M44 100C44 90.0589 52.0589 82 62 82H118C127.941 82 136 90.0589 136 100V136C136 138.209 134.209 140 132 140H48C45.7909 140 44 138.209 44 136V100Z"
                    fill="#232836"
                    stroke="#4a5264"
                    strokeWidth="2.5"
                  />
                  <path d="M74 82L90 106L106 82" stroke="#383f4e" strokeWidth="2" strokeLinejoin="round" />
                  <path
                    d="M68 83C68 102 74 114 90 114C106 114 112 102 112 83"
                    stroke="#9ca3af"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <line x1="90" y1="114" x2="90" y2="125" stroke="#9ca3af" strokeWidth="3" />
                  <circle cx="90" cy="128" r="6" fill="#171a22" stroke="#f87171" strokeWidth="2.5" />
                  <circle cx="90" cy="128" r="2" fill="#f87171" />
                  <rect x="108" y="106" width="18" height="14" rx="3" fill="#14171f" stroke="#383f4e" strokeWidth="1.5" />
                  <path d="M111 113H114L116 109L118 117L120 113H123" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-semibold text-zinc-200 mt-0.5">
                  Dr. Botiquín IA
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {activeFamiliarObj
                    ? `Personalizado para ${activeFamiliarObj.nombre}`
                    : 'Asistente médico virtual'}
                </span>
              </div>
            </div>

            {/* Right 2 Columns: Chat Box */}
            <div className="landscape:col-span-2 lg:col-span-2 flex flex-col rounded-2xl border border-[#323846] bg-[#171a22] overflow-hidden min-h-[320px] max-h-[75dvh] lg:h-[calc(100vh-175px)] lg:min-h-[390px] lg:max-h-[490px]">
              {/* Chat Messages Area */}
              <div className="flex-1 p-4 md:p-5 space-y-4 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-2.5">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      Hacé una consulta médica sobre tu Botiquín
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-md">
                      {activeFamiliarObj
                        ? `El Dr. Botiquín IA tendrá en cuenta la edad, peso, antecedentes, dolores frecuentes e historial de ${activeFamiliarObj.nombre}.`
                        : 'Seleccioná un integrante de la familia (o "Otro") y escribí el síntoma para revisar tu stock vigente.'}
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
                                          <strong>Dosis:</strong>{' '}
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
                    <span>Analizando tu stock y el historial del paciente...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendConsulta()
                }}
                className="border-t border-[#323846] bg-[#11131a] p-2.5 sm:p-3 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribí tu consulta o síntoma..."
                  className="flex-1 rounded-xl border border-[#343a48] bg-[#171a22] px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={consultingAI || !chatInput.trim()}
                  className={`flex items-center space-x-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50 ${greyBtn}`}
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
        {/* TAB 3: BOTIQUÍN DE VIAJE / VACACIONES (SUBSECCIONES LIMPIAS)     */}
        {/* ================================================================= */}
        {activeTab === 'viaje' && (
          <div className="space-y-4">
            {/* Header & Subtitle (Neutral icon without bright color) */}
            <div className="flex items-center space-x-3 rounded-2xl border border-[#323846] bg-[#171a22] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 border border-zinc-700/80 text-foreground">
                <Plane className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Botiquín de Viaje / Vacaciones
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate sm:whitespace-normal">
                  Prepará tu bolso de medicamentos sin estrés. Tus ítems marcados se guardan automáticamente.
                </p>
              </div>
            </div>

            {/* Sub-navigation bar inside Viaje: Valija | Clima y Viajeros | Bloc de Notas */}
            {(() => {
              const totalViaje = viajeChecklist.length
              const enValijaCount = viajeChecklist.filter((i) =>
                packedViajeIds.includes(i.id)
              ).length

              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#323846] bg-[#171a22] px-3.5 py-2.5">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => navigateToSection('viaje', 'valija')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        viajeSubTab === 'valija' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      <span>
                        Valija ({enValijaCount}/{totalViaje})
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigateToSection('viaje', 'clima')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        viajeSubTab === 'clima' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      <span>Clima y Viajeros</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigateToSection('viaje', 'notas')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        viajeSubTab === 'notas' ? greyBtnActive : greyBtn
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Bloc de Notas</span>
                    </button>
                  </div>

                  {/* WhatsApp & Shopping Quick Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(buildViajeWhatsAppText(), 'Lista del viaje copiada al portapapeles.')}
                      title="Copiar lista del viaje al portapapeles"
                      className={`flex items-center space-x-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Copiar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openWhatsApp(buildViajeWhatsAppText())}
                      title="Compartir lista del viaje por WhatsApp"
                      className="flex items-center space-x-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 px-2.5 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIncludeViajeInShopping(true)
                        setShoppingModalOpen(true)
                      }}
                      title="Lista de Compras de Farmacia"
                      className={`flex items-center space-x-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                      <span>Compras</span>
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 1: CHECKLIST DE LA VALIJA                          */}
            {/* ------------------------------------------------------------- */}
            {viajeSubTab === 'valija' && (
              <div className="space-y-4">
                {/* Visual Progress Bar */}
                {(() => {
                  const totalViaje = viajeChecklist.length
                  const enValijaCount = viajeChecklist.filter((i) =>
                    packedViajeIds.includes(i.id)
                  ).length
                  const pctEmpacado =
                    totalViaje > 0 ? Math.round((enValijaCount / totalViaje) * 100) : 0

                  return (
                    <div className="rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground font-medium">
                          Progreso de preparación del bolso:
                        </span>
                        <strong className="text-foreground font-bold">
                          {enValijaCount} de {totalViaje} empacados ({pctEmpacado}%)
                        </strong>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[#0e1016] overflow-hidden border border-[#2b303d]">
                        <div
                          className="h-full bg-gradient-to-r from-zinc-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${pctEmpacado}%` }}
                        />
                      </div>
                    </div>
                  )
                })()}

                {/* Checklist Container */}
                <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 sm:p-5 space-y-4">
                  {/* Checklist Filter Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#2c313f]">
                    <div className="flex items-center space-x-1.5 overflow-x-auto">
                      {[
                        { id: 'todos', label: `Todos (${viajeChecklist.length})` },
                        {
                          id: 'pendientes',
                          label: `Pendientes (${
                            viajeChecklist.filter((i) => !packedViajeIds.includes(i.id)).length
                          })`,
                        },
                        {
                          id: 'empacados',
                          label: `En Valija (${
                            viajeChecklist.filter((i) => packedViajeIds.includes(i.id)).length
                          })`,
                        },
                        {
                          id: 'faltantes',
                          label: `Faltan en Botiquín (${
                            viajeChecklist.filter((i) => !i.cubierto).length
                          })`,
                        },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            setViajeFiltro(f.id as 'todos' | 'pendientes' | 'empacados' | 'faltantes')
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                            viajeFiltro === f.id
                              ? 'bg-zinc-700 text-white border border-zinc-400'
                              : 'text-muted-foreground hover:text-white hover:bg-zinc-800/60'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setMostrarFormNuevoItemViaje(!mostrarFormNuevoItemViaje)}
                      className={`shrink-0 flex items-center space-x-1 rounded-xl px-3 py-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Agregar Ítem</span>
                    </button>
                  </div>

                  {/* Inline Form to Add Custom Item */}
                  {mostrarFormNuevoItemViaje && (
                    <div className="rounded-xl border border-zinc-600 bg-[#0e1016] p-3 space-y-2.5 animate-in fade-in">
                      <h4 className="text-xs font-bold text-foreground">
                        Agregar ítem personalizado para el viaje:
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          value={nuevoItemViajeNombre}
                          onChange={(e) => setNuevoItemViajeNombre(e.target.value)}
                          placeholder="Nombre (ej: Nebulizador, Vacuna...)"
                          className="rounded-lg border border-[#383f4e] bg-[#141822] px-3 py-1.5 text-xs text-foreground"
                        />
                        <input
                          type="text"
                          value={nuevoItemViajeDroga}
                          onChange={(e) => setNuevoItemViajeDroga(e.target.value)}
                          placeholder="Detalle o Marca sugerida"
                          className="rounded-lg border border-[#383f4e] bg-[#141822] px-3 py-1.5 text-xs text-foreground"
                        />
                        <input
                          type="text"
                          value={nuevoItemViajeParaQue}
                          onChange={(e) => setNuevoItemViajeParaQue(e.target.value)}
                          placeholder="¿Para qué sirve? (opcional)"
                          className="rounded-lg border border-[#383f4e] bg-[#141822] px-3 py-1.5 text-xs text-foreground"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setMostrarFormNuevoItemViaje(false)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium ${greyBtn}`}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!nuevoItemViajeNombre.trim()) return
                            const nuevo: ItemPersonalizadoViaje = {
                              id: `cust-${Date.now()}`,
                              nombre: nuevoItemViajeNombre.trim(),
                              droga_sugerida: nuevoItemViajeDroga.trim(),
                              descripcion: nuevoItemViajeParaQue.trim(),
                            }
                            updateViajeConfig((prev) => ({
                              ...prev,
                              itemsPersonalizados: [...(prev.itemsPersonalizados || []), nuevo],
                            }))
                            setNuevoItemViajeNombre('')
                            setNuevoItemViajeDroga('')
                            setNuevoItemViajeParaQue('')
                            setMostrarFormNuevoItemViaje(false)
                            showToast('Ítem agregado al checklist del viaje')
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold ${greyBtnActive}`}
                        >
                          Guardar Ítem
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Checklist Items List */}
                  {(() => {
                    const itemsFiltrados = viajeChecklist.filter((item) => {
                      const isPacked = packedViajeIds.includes(item.id)
                      if (viajeFiltro === 'pendientes') return !isPacked
                      if (viajeFiltro === 'empacados') return isPacked
                      if (viajeFiltro === 'faltantes') return !item.cubierto
                      return true
                    })

                    if (itemsFiltrados.length === 0) {
                      return (
                        <div className="rounded-xl border border-dashed border-[#343a48] bg-[#0e1016] p-8 text-center text-xs text-muted-foreground">
                          No hay ítems en esta vista de filtro.
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-2">
                        {itemsFiltrados.map((item) => {
                          const isPacked = packedViajeIds.includes(item.id)
                          return (
                            <div
                              key={item.id}
                              className={`rounded-xl border p-3 transition-colors flex items-start justify-between gap-3 ${
                                isPacked
                                  ? 'border-emerald-500/30 bg-[#12181d]'
                                  : item.cubierto
                                  ? 'border-[#343a48] bg-[#141822]'
                                  : 'border-primary/35 bg-primary/5'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isPacked}
                                  onChange={() => togglePackedViajeItem(item.id)}
                                  title="Marcar como guardado en el bolso / valija"
                                  className="mt-1 h-4 w-4 rounded border-[#4a5264] accent-[#10b981] cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <span
                                      className={`text-xs font-bold ${
                                        isPacked
                                          ? 'line-through text-muted-foreground'
                                          : 'text-foreground'
                                      }`}
                                    >
                                      {item.nombre}
                                    </span>
                                    <span className="text-sm leading-none select-none">
                                      {item.publico === 'pediatrico'
                                        ? '👶'
                                        : item.publico === 'ambos'
                                        ? '👨‍👩‍👧'
                                        : '🧑'}
                                    </span>
                                    {item.origen === 'viaje' && (
                                      <span className="rounded-md bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                                        ✈️ Extra Viaje
                                      </span>
                                    )}
                                    {item.origen === 'esencial' && (
                                      <span className="rounded-md bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                        ⭐ Esencial
                                      </span>
                                    )}
                                    {item.origen === 'personalizado' && (
                                      <span className="rounded-md bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                        📝 Personalizado
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-muted-foreground">
                                    <strong className="text-zinc-300">{item.droga}</strong>
                                    {item.descripcion ? ` • ${item.descripcion}` : ''}
                                  </p>

                                  {item.cubierto ? (
                                    <div className="text-[11px] text-emerald-300 font-medium">
                                      ✓ En stock: {item.stockDetalle}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-red-300 font-medium">
                                      ⚠️ Falta en el botiquín
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                                    isPacked
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : item.cubierto
                                      ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                                      : 'bg-primary/15 text-primary border border-primary/40'
                                  }`}
                                >
                                  {isPacked ? '✓ En valija' : item.cubierto ? 'En stock' : 'Falta'}
                                </span>

                                {!item.cubierto && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openNewMedModal({
                                        nombre: item.nombre,
                                        droga: item.droga,
                                        publico: item.publico,
                                      })
                                    }
                                    title="Cargar en Stock"
                                    className={`p-1.5 rounded-lg ${greyBtn}`}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {item.origen === 'personalizado' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const customId = item.id.replace('custom:', '')
                                      updateViajeConfig((prev) => ({
                                        ...prev,
                                        itemsPersonalizados: (prev.itemsPersonalizados || []).filter(
                                          (x) => x.id !== customId
                                        ),
                                      }))
                                      setPackedViajeIds((prev) => prev.filter((x) => x !== item.id))
                                    }}
                                    title="Eliminar ítem personalizado"
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-300 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#2c313f]">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            '¿Estás seguro de que querés desmarcar todos los ítems de la valija para comenzar un nuevo viaje?'
                          )
                        ) {
                          setPackedViajeIds([])
                          try {
                            window.localStorage.removeItem('botiquin_viaje_packed')
                          } catch {
                            // ignore
                          }
                          showToast('Valija reiniciada')
                        }
                      }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      Reiniciar valija
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(buildViajeWhatsAppText(), 'Lista del viaje copiada al portapapeles.')}
                        className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold ${greyBtn}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openWhatsApp(buildViajeWhatsAppText())}
                        className="flex items-center space-x-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 px-3.5 py-1.5 text-xs font-semibold transition-colors"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Compartir por WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIncludeViajeInShopping(true)
                          setShoppingModalOpen(true)
                        }}
                        className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold ${greyBtn}`}
                      >
                        <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                        <span>Ver en Compras</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 2: CLIMA Y VIAJEROS                                */}
            {/* ------------------------------------------------------------- */}
            {viajeSubTab === 'clima' && (
              <div className="space-y-4">
                {/* Entorno / Clima Options */}
                <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#2c313f]">
                    <div className="flex items-center space-x-2">
                      <Sun className="h-4 w-4 text-zinc-300" />
                      <h3 className="text-sm font-bold text-foreground">
                        Entorno y Clima del Viaje
                      </h3>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Podés elegir más de uno
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Seleccioná las características climáticas del destino para sumar los medicamentos
                    preventivos necesarios:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {[
                      { id: 'playa', label: '🏖️ Playa / Mar', desc: 'Sol fuerte, agua, pileta y prevención de otitis' },
                      { id: 'montana', label: '🏔️ Montaña / Altura', desc: 'Clima frío, viento, caminatas y cefalea por altura' },
                      { id: 'selva', label: '🌴 Selva / Trópico', desc: 'Mosquitos, dengue, zika y vacunas requeridas' },
                      { id: 'ciudad', label: '🏙️ Ciudad / Urbano', desc: 'Traslado liviano, digestivos y ampollas por caminata' },
                    ].map((ent) => {
                      const isSelected = viajeConfig.entornos.includes(ent.id as EntornoViaje)
                      return (
                        <button
                          key={ent.id}
                          type="button"
                          onClick={() => {
                            const cur = viajeConfig.entornos
                            const next = cur.includes(ent.id as EntornoViaje)
                              ? cur.filter((x) => x !== ent.id)
                              : [...cur, ent.id as EntornoViaje]
                            updateViajeConfig({ entornos: next.length > 0 ? next : ['ciudad'] })
                          }}
                          className={`p-3 rounded-xl text-left border transition-all ${
                            isSelected
                              ? 'bg-zinc-700/80 border-zinc-400 text-white shadow-sm'
                              : 'bg-[#0e1016] border-[#2e3444] text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          <div className="text-xs sm:text-sm font-bold flex items-center justify-between">
                            <span>{ent.label}</span>
                            {isSelected && <span className="text-xs text-emerald-400 font-semibold">✓ Activo</span>}
                          </div>
                          <span className="text-[11px] text-zinc-300 block mt-1 leading-snug">
                            {ent.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Viajeros del Grupo Familiar */}
                <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#2c313f]">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-zinc-300" />
                      <h3 className="text-sm font-bold text-foreground">
                        ¿Quiénes viajan del grupo familiar?
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateViajeConfig({
                          familiaresIds: (state.familia || []).map((f) => f.id),
                        })
                      }
                      className="text-xs text-zinc-300 underline hover:text-white"
                    >
                      Viajan todos
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Tildá a los integrantes que participan del viaje para incluir automáticamente sus
                    esenciales específicos (pediátricos o de adultos):
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(state.familia || []).map((f) => {
                      const isSelected =
                        viajeConfig.familiaresIds.length === 0 ||
                        viajeConfig.familiaresIds.includes(f.id)
                      const edad = calcularEdadDesdeFecha(f.fecha_nacimiento)
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            const cur = viajeConfig.familiaresIds
                            const next = cur.includes(f.id)
                              ? cur.filter((x) => x !== f.id)
                              : [...cur, f.id]
                            updateViajeConfig({ familiaresIds: next })
                          }}
                          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                            isSelected
                              ? 'bg-zinc-700 text-white border-zinc-400 shadow-sm'
                              : 'bg-[#0e1016] border-[#2e3444] text-zinc-400 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <span className="text-base leading-none">{obtenerEmojiFamiliar(f)}</span>
                          <span>{f.nombre}</span>
                          <span className="text-[11px] font-normal text-zinc-400">
                            ({edad.esPediatrico ? 'Niño' : 'Adulto'})
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Alertas y Recomendaciones Médicas del Clima */}
                {viajeEvaluacion.alertas.length > 0 && (
                  <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 sm:p-5 space-y-3">
                    <h4 className="text-xs font-bold text-foreground flex items-center space-x-1.5 uppercase tracking-wider pb-2 border-b border-[#2c313f]">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>Recomendaciones Médicas según el Clima Seleccionado:</span>
                    </h4>

                    <div className="space-y-2.5">
                      {viajeEvaluacion.alertas.map((alerta, i) => (
                        <div
                          key={i}
                          className={`rounded-xl border p-3.5 text-xs leading-relaxed ${
                            alerta.nivel === 'importante'
                              ? 'border-red-400/40 bg-red-950/20 text-red-200'
                              : 'border-zinc-600 bg-zinc-900/60 text-zinc-200'
                          }`}
                        >
                          <strong className="block text-foreground font-semibold text-sm mb-1">
                            {alerta.titulo}
                          </strong>
                          <p className="text-zinc-300 text-xs leading-relaxed">
                            {alerta.mensaje}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 3: BLOC DE NOTAS Y RECORDATORIOS                   */}
            {/* ------------------------------------------------------------- */}
            {viajeSubTab === 'notas' && (
              <div className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-[#2c313f]">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-zinc-300" />
                    <h3 className="text-sm font-bold text-foreground">
                      Bloc de Notas y Recordatorios de Viaje
                    </h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Autoguardado
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Usá este espacio para anotar recetas médicas que necesites pedir antes de viajar,
                  teléfonos de asistencia médica en viaje, nombres de coberturas o cualquier
                  recordatorio importante para la familia:
                </p>

                <div className="pt-1">
                  <textarea
                    rows={8}
                    value={viajeConfig.notas}
                    onChange={(e) => updateViajeConfig({ notas: e.target.value })}
                    placeholder="Ejemplo:&#10;• Pedir receta del antibiótico al pediatra antes del viernes.&#10;• Llevar carnet de vacunación de los chicos.&#10;• Número de asistencia médica al viajero: +54 11 4000-0000 (Póliza 12345).&#10;• Comprar repelente verde DEET 25% en la farmacia antes de salir."
                    className="w-full rounded-xl border border-[#383f4e] bg-[#0e1016] p-3 text-xs sm:text-sm text-foreground focus:border-zinc-400 focus:outline-none leading-relaxed"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                  <span className="text-[11px] text-muted-foreground">
                    Las notas se incluirán automáticamente al compartir el checklist por WhatsApp.
                  </span>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(buildViajeWhatsAppText(), 'Checklist y notas copiadas al portapapeles.')}
                      className={`flex items-center space-x-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openWhatsApp(buildViajeWhatsAppText())}
                      className="flex items-center space-x-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 px-3.5 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Compartir Notas por WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: CONFIGURACIÓN (SUBSECCIONES: FAMILIA | ESENCIALES | ALERTAS) */}
        {/* ================================================================= */}
        {activeTab === 'configuracion' && (
          <div className="space-y-4">
            {/* Sub-navigation bar inside Configuración */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3">
              <div className="flex items-center flex-wrap gap-2">
                <a
                  href="/configuracion"
                  onClick={(e) => handleTabNavClick(e, 'configuracion', 'familia')}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    configSubTab === 'familia' ? greyBtnActive : greyBtn
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Familia</span>
                </a>

                <a
                  href="/configuracion?sub=esenciales"
                  onClick={(e) => handleTabNavClick(e, 'configuracion', 'esenciales')}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    configSubTab === 'esenciales' ? greyBtnActive : greyBtn
                  }`}
                >
                  <Star className="h-3.5 w-3.5" />
                  <span>Esenciales</span>
                </a>

                <a
                  href="/configuracion?sub=alertas"
                  onClick={(e) => handleTabNavClick(e, 'configuracion', 'alertas')}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    configSubTab === 'alertas' ? greyBtnActive : greyBtn
                  }`}
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span>Alertas</span>
                </a>
              </div>

              {!isStandalonePWA && (
                <button
                  type="button"
                  onClick={handleInstallPWA}
                  className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${greyBtn}`}
                >
                  <Download className="h-3.5 w-3.5 text-primary" />
                  <span>Instalar</span>
                </button>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 3.1: MIEMBROS DE LA FAMILIA + HISTORIAL INTEGRADO  */}
            {/* ------------------------------------------------------------- */}
            {configSubTab === 'familia' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Miembros de la Familia
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Edades automáticas, antecedentes, dolores recurrentes e historial de consultas y consumos por integrante.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openNewFamiliarModal}
                    className={`shrink-0 flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-zinc-600 ${greyBtnActive}`}
                  >
                    <span>+ Integrante</span>
                  </button>
                </div>

                {(state.familia || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#343a48] bg-[#171a22]/70 p-10 text-center">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                    <h3 className="text-base font-semibold text-foreground">
                      Todavía no cargaste integrantes de la familia
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                      Agregá a cada integrante con su fecha de nacimiento, peso, antecedentes médicos y dolores recurrentes.
                    </p>
                    <button
                      onClick={openNewFamiliarModal}
                      className={`mt-4 inline-flex items-center space-x-2 rounded-xl px-5 py-2 text-xs font-semibold ${greyBtnActive}`}
                    >
                      <span>+ Integrante</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(state.familia || []).map((miembro) => {
                      const edadInfo = calcularEdadDesdeFecha(miembro.fecha_nacimiento)
                      const consumosMiembro = (state.movimientos || []).filter(
                        (m) =>
                          m.tipo === 'consumo' &&
                          (m.familiar_id === miembro.id ||
                            (m.familiar_nombre &&
                              m.familiar_nombre.toLowerCase() ===
                                miembro.nombre.toLowerCase()) ||
                            m.motivo.toLowerCase().includes(miembro.nombre.toLowerCase()))
                      )
                      const consultasMiembro = (state.consultas_historial || []).filter(
                        (c) =>
                          c.familiar_id === miembro.id ||
                          c.paciente_nombre.toLowerCase() === miembro.nombre.toLowerCase()
                      )
                      const isHistoryExpanded = expandedFamiliarHistoryId === miembro.id

                      return (
                        <div
                          key={miembro.id}
                          className="rounded-2xl border border-[#323846] bg-[#171a22] p-4 flex flex-col justify-between space-y-3"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center space-x-2.5">
                                <span className="text-2xl leading-none select-none">
                                  {obtenerEmojiFamiliar(miembro)}
                                </span>
                                <div>
                                  <h3 className="text-base font-bold text-foreground leading-tight">
                                    {miembro.nombre}
                                  </h3>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Edad: <strong className="text-zinc-200">{edadInfo.texto}</strong>
                                    {miembro.peso_kg ? (
                                      <>
                                        {' '}
                                        • Peso:{' '}
                                        <strong className="text-zinc-200">
                                          {miembro.peso_kg} kg
                                        </strong>
                                      </>
                                    ) : null}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditFamiliarModal(miembro)}
                                  className={`p-1.5 rounded-lg ${greyBtn}`}
                                  title="Editar"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteFamiliar(miembro.id, miembro.nombre)
                                  }
                                  className={`p-1.5 rounded-lg ${greyBtn}`}
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="rounded-xl bg-[#0e1016] border border-[#282d3b] p-3 text-xs space-y-1.5">
                              <div>
                                <span className="text-muted-foreground">
                                  Antecedentes médicos / Alergias:
                                </span>{' '}
                                <span className="text-zinc-200">
                                  {miembro.antecedentes_medicos || 'Sin especificar'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Dolores o síntomas recurrentes:
                                </span>{' '}
                                <span className="text-zinc-200">
                                  {miembro.dolores_recurrentes || 'Sin especificar'}
                                </span>
                              </div>
                            </div>

                            {/* Integrated History inside the Family Member Card */}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedFamiliarHistoryId((prev) =>
                                    prev === miembro.id ? null : miembro.id
                                  )
                                }}
                                className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
                                  isHistoryExpanded ? greyBtnActive : greyBtn
                                }`}
                              >
                                <span className="flex items-center space-x-2">
                                  <History className="h-3.5 w-3.5 text-primary" />
                                  <span>
                                    Historial ({consultasMiembro.length} consultas •{' '}
                                    {consumosMiembro.length} consumos)
                                  </span>
                                </span>
                                {isHistoryExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>

                              {isHistoryExpanded && (
                                <div className="mt-2.5 rounded-xl border border-[#2c313f] bg-[#0e1016] p-3 space-y-2.5">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setFamiliarHistoryTab('consultas')}
                                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold ${
                                        familiarHistoryTab === 'consultas'
                                          ? greyBtnActive
                                          : greyBtn
                                      }`}
                                    >
                                      Consultas IA ({consultasMiembro.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFamiliarHistoryTab('consumos')}
                                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold ${
                                        familiarHistoryTab === 'consumos'
                                          ? greyBtnActive
                                          : greyBtn
                                      }`}
                                    >
                                      Consumos ({consumosMiembro.length})
                                    </button>
                                  </div>

                                  {familiarHistoryTab === 'consultas' ? (
                                    consultasMiembro.length === 0 ? (
                                      <p className="text-xs text-muted-foreground text-center py-3">
                                        Sin consultas registradas para {miembro.nombre}.
                                      </p>
                                    ) : (
                                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                        {consultasMiembro.map((c) => (
                                          <div
                                            key={c.id}
                                            className="rounded-lg border border-[#262b38] bg-[#141821] p-2.5 text-xs space-y-1.5"
                                          >
                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                              <span>
                                                {new Date(c.created_at).toLocaleDateString(
                                                  'es-AR',
                                                  {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                  }
                                                )}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDeleteConsultaHistorial(c.id)
                                                }
                                                className="text-zinc-400 hover:text-red-300"
                                                title="Eliminar consulta"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                            <div className="font-semibold text-foreground">
                                              “{c.consulta}”
                                            </div>
                                            <div className="text-zinc-300 leading-relaxed space-y-0.5">
                                              {renderFormattedChatText(c.respuesta_markdown)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  ) : consumosMiembro.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-3">
                                      Sin consumos de medicamentos registrados para {miembro.nombre}.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                                      {consumosMiembro.map((mov) => (
                                        <div
                                          key={mov.id}
                                          className="rounded-lg border border-[#262b38] bg-[#141821] px-2.5 py-2 text-xs flex items-center justify-between gap-2"
                                        >
                                          <div className="min-w-0">
                                            <div className="font-semibold text-foreground truncate">
                                              {formatEspacioMedida(mov.medicamento_nombre)}{' '}
                                              <span className="text-red-300">
                                                (-{mov.cantidad} {mov.unidad})
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                              {mov.motivo}
                                            </p>
                                          </div>
                                          <span className="text-[11px] text-muted-foreground shrink-0">
                                            {new Date(mov.created_at).toLocaleDateString('es-AR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 3.2: ESENCIALES (100% RESPONSIVE MOBILE + DESKTOP) */}
            {/* ------------------------------------------------------------- */}
            {configSubTab === 'esenciales' && (
              <div className="space-y-3">
                {/* Header with Shopping List & '+ Esencial' */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#323846] bg-[#171a22] px-4 py-3">
                  <div className="flex items-center space-x-2 min-w-0">
                    <Star className="h-4 w-4 text-primary shrink-0" />
                    <h2 className="text-sm font-bold text-foreground truncate">Esenciales</h2>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({kpis.esencialesCubiertos} de {kpis.esencialesTotal} cubiertos)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShoppingModalOpen(true)}
                      title="Lista de Compras de Farmacia (Compartir por WhatsApp)"
                      className={`flex items-center justify-center rounded-lg p-1.5 text-xs font-semibold ${greyBtn}`}
                    >
                      <ShoppingBag className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      onClick={openNewEsencialModal}
                      className={`shrink-0 flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold hover:bg-zinc-600 ${greyBtnActive}`}
                    >
                      <span>+ Esencial</span>
                    </button>
                  </div>
                </div>

                {/* MOBILE & SMALL SCREENS VIEW (Clean responsive cards, zero overlapping) */}
                <div className="md:hidden space-y-2.5">
                  {sortedEsenciales.map((esc) => {
                    const { cubierto, medicamentosQueCubren } = verificarCoberturaEsencial(
                      esc,
                      state.medicamentos
                    )
                    return (
                      <div
                        key={esc.id}
                        className={`rounded-xl border border-[#323846] bg-[#171a22] p-3.5 space-y-2 ${
                          !esc.activo ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Row 1: Category Tag + Público Emoji + Action Buttons */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center flex-wrap gap-2 min-w-0">
                            <span
                              className={`inline-block rounded-xl px-2.5 py-1 text-xs font-semibold leading-snug break-words ${
                                cubierto
                                  ? 'bg-zinc-700 text-white border border-zinc-400'
                                  : 'bg-primary/15 border border-primary/40 text-primary'
                              }`}
                            >
                              {formatCategoriaEsencial(esc)}
                            </span>
                            <span
                              className="text-lg leading-none select-none shrink-0"
                              title={
                                esc.publico === 'pediatrico'
                                  ? 'Bebé / Pediátrico'
                                  : esc.publico === 'ambos'
                                  ? 'Familia'
                                  : 'Adultos'
                              }
                            >
                              {esc.publico === 'pediatrico'
                                ? '👶'
                                : esc.publico === 'ambos'
                                ? '👨‍👩‍👧'
                                : '🧑'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                openNewMedModal({
                                  nombre: esc.nombre,
                                  droga: esc.droga_sugerida,
                                  publico: esc.publico,
                                  categoria: esc.categoria,
                                  unidad: esc.unidad_sugerida,
                                  cantidad_actual:
                                    esc.unidad_sugerida === 'ml' ? 100 : 10,
                                  cantidad_inicial:
                                    esc.unidad_sugerida === 'ml' ? 100 : 10,
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
                        </div>

                        {/* Row 2: Principal Activo & Síntomas */}
                        <div className="text-xs space-y-1 pt-0.5">
                          <div>
                            <span className="text-muted-foreground">Activo:</span>{' '}
                            <strong className="text-zinc-100">
                              {formatPrincipalActivoEsencial(esc)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Síntomas:</span>{' '}
                            <span className="text-zinc-300">{formatSintomasEsencial(esc)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Marcas:</span>{' '}
                            <span className="text-zinc-300">{formatMarcasSugeridas(esc)}</span>
                          </div>
                          {cubierto && medicamentosQueCubren.length > 0 && (
                            <div className="text-[11px] text-emerald-300/90 pt-0.5">
                              ✓ En stock:{' '}
                              {medicamentosQueCubren
                                .map((m) => formatEspacioMedida(m.nombre))
                                .join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* DESKTOP TABLE VIEW */}
                <div className="hidden md:block rounded-xl border border-[#323846] bg-[#171a22] overflow-hidden">
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
                            {/* 1. Categoría */}
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

                            {/* 6. Acciones */}
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
                                      cantidad_actual:
                                        esc.unidad_sugerida === 'ml' ? 100 : 10,
                                      cantidad_inicial:
                                        esc.unidad_sugerida === 'ml' ? 100 : 10,
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

            {/* ------------------------------------------------------------- */}
            {/* SUBSECCIÓN 3.3: ALERTAS                                       */}
            {/* ------------------------------------------------------------- */}
            {configSubTab === 'alertas' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                {/* Settings Form */}
                <form
                  onSubmit={handleSaveConfig}
                  className="flex flex-col justify-between rounded-2xl border border-[#323846] bg-[#171a22] p-5 space-y-3.5"
                >
                  <div className="space-y-3.5">
                    <h3 className="text-base font-bold text-foreground flex items-center space-x-2">
                      <Bell className="h-4 w-4 text-primary" />
                      <span>Alertas por Email</span>
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
                          checked={Boolean(
                            configForm.alertar_vencido || configForm.alertar_sin_stock
                          )}
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
                              <span>{formatEspacioMedida(mov.medicamento_nombre)}</span>
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
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (hidden in landscape to keep horizontal screen clean with hamburger menu) */}
      <div className="md:hidden landscape:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#383e4e] bg-[#1e222d]/95 backdrop-blur px-1.5 py-1.5 grid grid-cols-4 gap-1">
        <a
          href="/stock"
          onClick={(e) => handleTabNavClick(e, 'stock')}
          className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10.5px] font-medium ${
            activeTab === 'stock' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Package className="h-4 w-4 mb-0.5" />
          <span>Stock</span>
        </a>

        <a
          href="/consultorio"
          onClick={(e) => handleTabNavClick(e, 'consulta')}
          className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10.5px] font-medium ${
            activeTab === 'consulta' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Bot className="h-4 w-4 mb-0.5" />
          <span>Consultorio</span>
        </a>

        <a
          href="/viaje"
          onClick={(e) => handleTabNavClick(e, 'viaje')}
          className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10.5px] font-medium ${
            activeTab === 'viaje' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Plane className="h-4 w-4 mb-0.5" />
          <span>Viaje</span>
        </a>

        <a
          href="/configuracion"
          onClick={(e) => handleTabNavClick(e, 'configuracion', configSubTab)}
          className={`relative flex flex-col items-center justify-center py-1 rounded-lg text-[10.5px] font-medium ${
            activeTab === 'configuracion' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Settings className="h-4 w-4 mb-0.5" />
          <span>Config</span>
        </a>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT INTEGRANTE DE LA FAMILIA                            */}
      {/* ===================================================================== */}
      {familiarModalOpen && (
        <div
          onClick={() => setFamiliarModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                {editingFamiliar ? 'Editar Integrante' : 'Nuevo Integrante de la Familia'}
              </h3>
              <button
                onClick={() => setFamiliarModalOpen(false)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFamiliar} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={familiarForm.nombre}
                    onChange={(e) => {
                      const nextNombre = e.target.value
                      setFamiliarForm({
                        ...familiarForm,
                        nombre: nextNombre,
                        genero: detectarGeneroPorNombre(nextNombre),
                      })
                    }}
                    placeholder="Ej: Bauti, Marisol, Alejandro"
                    className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Ícono / Sexo
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFamiliarForm({ ...familiarForm, genero: 'masculino' })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium ${
                        familiarForm.genero === 'masculino' ? greyBtnActive : greyBtn
                      }`}
                    >
                      👨 Hombre
                    </button>
                    <button
                      type="button"
                      onClick={() => setFamiliarForm({ ...familiarForm, genero: 'femenino' })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium ${
                        familiarForm.genero === 'femenino' ? greyBtnActive : greyBtn
                      }`}
                    >
                      👩 Mujer
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Fecha de Nacimiento *
                  </label>
                  <input
                    type="date"
                    required
                    value={familiarForm.fecha_nacimiento}
                    onChange={(e) =>
                      setFamiliarForm({ ...familiarForm, fecha_nacimiento: e.target.value })
                    }
                    className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                  />
                  {familiarForm.fecha_nacimiento && (
                    <span className="text-[11px] text-primary mt-0.5 block">
                      Edad calculada:{' '}
                      {calcularEdadDesdeFecha(familiarForm.fecha_nacimiento).texto}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1">
                    Peso (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="300"
                    value={familiarForm.peso_kg}
                    onChange={(e) => setFamiliarForm({ ...familiarForm, peso_kg: e.target.value })}
                    placeholder="Ej: 10.5 o 74"
                    className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Antecedentes médicos / Alergias
                </label>
                <input
                  type="text"
                  value={familiarForm.antecedentes_medicos}
                  onChange={(e) =>
                    setFamiliarForm({ ...familiarForm, antecedentes_medicos: e.target.value })
                  }
                  placeholder="Ej: Alergia a penicilina, asma leve, gastritis, ninguno"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-200 block mb-1">
                  Dolores o síntomas recurrentes
                </label>
                <input
                  type="text"
                  value={familiarForm.dolores_recurrentes}
                  onChange={(e) =>
                    setFamiliarForm({ ...familiarForm, dolores_recurrentes: e.target.value })
                  }
                  placeholder="Ej: Migrañas, dolor lumbar, acidez, otitis, cólicos"
                  className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#383f4e]">
                <button
                  type="button"
                  onClick={() => setFamiliarModalOpen(false)}
                  className={`rounded-xl px-4 py-1.5 text-xs font-semibold ${greyBtn}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingFamiliar}
                  className={`rounded-xl px-4 py-1.5 text-xs font-semibold ${greyBtnActive}`}
                >
                  {savingFamiliar ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT MEDICAMENTO (COMPACT 3 TABS, MANUAL PHOTO ANALYZE)  */}
      {/* ===================================================================== */}
      {medModalOpen && (
        <div
          onClick={() => setMedModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h2 className="text-base font-bold text-foreground">
                {editingMed ? 'Editar Medicamento' : 'Cargar Medicamento'}
              </h2>
              <button
                onClick={() => setMedModalOpen(false)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3 Compact Tabs */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#161922] p-1 rounded-xl mt-3 border border-[#323846]">
              {[
                { id: 'general', label: '1. General' },
                { id: 'stock', label: '2. Stock' },
                { id: 'uso', label: '3. Uso' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMedModalTab(t.id as MedModalTab)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                    medModalTab === t.id
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveMedicamento} className="mt-3.5">
              {/* TAB 1: GENERAL */}
              {medModalTab === 'general' && (
                <div className="space-y-3">
                  {/* Compact Photo Bar: take multiple photos first, then press Analizar */}
                  <div className="rounded-xl border border-[#383f4e] bg-[#161922] p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {medForm.fotos_input.length === 0 ? (
                          <span className="text-xs text-muted-foreground truncate">
                            Sacá todas las fotos que quieras y luego tocá Analizar
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                            {medForm.fotos_input.map((foto, idx) => (
                              <div
                                key={idx}
                                className="relative h-9 w-9 shrink-0 rounded-lg overflow-hidden border border-[#4a5264] bg-black"
                              >
                                <img
                                  src={foto}
                                  alt={`Foto ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhotoAtIndex(idx)}
                                  className="absolute top-0 right-0 bg-black/80 text-red-300 p-0.5"
                                  title="Quitar"
                                >
                                  <X className="h-2.5 w-2.5" />
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
                            className="flex items-center space-x-1 rounded-lg bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 px-2.5 py-1 text-xs font-semibold transition-colors"
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
                        <span>Analizando las fotos con IA...</span>
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
                      Función (síntomas que trata)
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
                      Dosis
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

              {/* Modal Footer */}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                Usar • {formatEspacioMedida(dosisModalMed.nombre)}
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

              {(state.familia || []).length > 0 && (
                <div>
                  <label className="text-xs font-medium text-zinc-200 block mb-1.5">
                    ¿Para quién fue la dosis?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(state.familia || []).map((f) => {
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setDosisFamiliarId(f.id)}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            dosisFamiliarId === f.id ? greyBtnActive : greyBtn
                          }`}
                        >
                          <span>{obtenerEmojiFamiliar(f)}</span>
                          <span>{f.nombre}</span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setDosisFamiliarId('')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        dosisFamiliarId === '' ? greyBtnActive : greyBtn
                      }`}
                    >
                      Otro
                    </button>
                  </div>

                  {/* Calculadora Rápida de Dosis Pediátrica por Peso (mg/kg) */}
                  {(() => {
                    const miembroSel = (state.familia || []).find((f) => f.id === dosisFamiliarId)
                    if (!miembroSel || !miembroSel.peso_kg) return null
                    const calc = calcularDosisPediatricaPorPeso(dosisModalMed, miembroSel.peso_kg)
                    if (!calc) return null
                    return (
                      <div className="mt-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-semibold text-emerald-300 flex items-center gap-1">
                            <Calculator className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Dosis sugerida para {miembroSel.nombre} ({miembroSel.peso_kg} kg):{' '}
                              <strong className="text-white">{calc.dosisTexto}</strong>
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-300 mt-0.5">
                            {calc.formula}
                          </p>
                        </div>
                        {calc.cantidadSugerida !== null && (
                          <button
                            type="button"
                            onClick={() => setDosisCantidad(calc.cantidadSugerida!)}
                            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${greyBtn}`}
                          >
                            Usar {calc.cantidadSugerida} {dosisModalMed.unidad}
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

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
                  Motivo / Síntoma (opcional):
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-foreground">
                Reponer • {formatEspacioMedida(reponerModalMed.nombre)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e]">
              <h3 className="text-base font-bold text-red-300">
                Dar de Baja • {formatEspacioMedida(bajaModalMed.nombre)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
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
                    placeholder="Ej: Paracetamol, Ibuprofeno, Omeprazol"
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
                      idx === lightboxIndex
                        ? 'border-primary scale-105'
                        : 'border-transparent opacity-60'
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



      {/* ===================================================================== */}
      {/* MODAL: LISTA DE COMPRAS DE FARMACIA EN 1 CLIC (WHATSAPP)              */}
      {/* ===================================================================== */}
      {shoppingModalOpen && (
        <div
          onClick={() => setShoppingModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl border border-[#4a5264] bg-[#232733] p-5 shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#383f4e] shrink-0">
              <div className="flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 border border-primary/40 text-primary">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Lista de Compras de Farmacia
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Faltantes, por vencer y agotados listos para enviar por WhatsApp
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShoppingModalOpen(false)}
                className={`p-1.5 rounded-lg ${greyBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Option to include Travel Checklist missing items */}
            <div className="py-2.5 border-b border-[#343a48] flex items-center justify-between gap-2 shrink-0">
              <label className="flex items-center space-x-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeViajeInShopping}
                  onChange={(e) => setIncludeViajeInShopping(e.target.checked)}
                  className="h-4 w-4 rounded border-[#4a5264] accent-[#f87171]"
                />
                <span>✈️ Sumar faltantes del Botiquín de Viaje</span>
              </label>
              <span className="text-[11px] text-muted-foreground">
                {
                  shoppingListItems.filter((i) => !excludedShoppingKeys.includes(i.key))
                    .length
                }{' '}
                seleccionados
              </span>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto space-y-2 my-3 pr-1">
              {shoppingListItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#383f4e] bg-[#161922] p-6 text-center text-xs text-muted-foreground">
                  ¡Tu botiquín está al día! No hay medicamentos esenciales faltantes ni productos agotados.
                </div>
              ) : (
                shoppingListItems.map((item) => {
                  const included = !excludedShoppingKeys.includes(item.key)
                  return (
                    <label
                      key={item.key}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer transition-colors ${
                        included
                          ? 'border-[#383f4e] bg-[#161922]'
                          : 'border-[#2c313f] bg-[#12151c] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() =>
                          setExcludedShoppingKeys((prev) =>
                            prev.includes(item.key)
                              ? prev.filter((k) => k !== item.key)
                              : [...prev, item.key]
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-[#4a5264] accent-[#f87171] shrink-0"
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-semibold text-foreground flex items-center flex-wrap gap-1.5">
                          <span>{item.titulo}</span>
                          <span className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] text-zinc-200 font-normal">
                            {item.motivo}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.subtitulo}</p>
                      </div>
                    </label>
                  )
                })
              )}
            </div>

            {/* Extra note */}
            <div className="shrink-0 mb-3">
              <input
                type="text"
                value={customShoppingNote}
                onChange={(e) => setCustomShoppingNote(e.target.value)}
                placeholder="Agregar nota o producto extra (ej: Gasas, Curitas, Alcohol...)"
                className="w-full rounded-lg border border-[#383f4e] bg-[#13161f] px-3 py-1.5 text-xs text-foreground"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#383f4e] shrink-0">
              <button
                type="button"
                onClick={() => {
                  const text = buildShoppingWhatsAppText()
                  copyToClipboard(text, 'Lista de compras copiada al portapapeles.')
                }}
                className={`flex items-center space-x-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${greyBtn}`}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const text = buildShoppingWhatsAppText()
                  openWhatsApp(text)
                }}
                className="flex items-center space-x-1.5 rounded-xl bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 px-4 py-2 text-xs font-semibold transition-colors"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
