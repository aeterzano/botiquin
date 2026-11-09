'use client'

import React, { useState, useMemo, useRef } from 'react'
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
  PlusCircle,
  Trash2,
  Edit3,
  Send,
  Mail,
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
  Calendar,
  Info,
  ArchiveX,
  Images,
  PenTool,
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
  const [alertas, setAlertas] = useState<AlertaActiva[]>(initialAlertas)
  const [activeTab, setActiveTab] = useState<TabType>('stock')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(
    null
  )

  // Stock filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPublico, setFilterPublico] = useState<'todos' | PublicoObjetivo>('todos')
  const [filterEstado, setFilterEstado] = useState<
    'activos' | 'proximo_vencer' | 'vencidos' | 'sin_stock' | 'bajas'
  >('activos')

  // Add / Edit Medication Modal (Multi-Photo + Auto/Hybrid/Manual)
  const [medModalOpen, setMedModalOpen] = useState(false)
  const [editingMed, setEditingMed] = useState<Medicamento | null>(null)
  const [modoCarga, setModoCarga] = useState<ModoCargaMed>('hibrido_ia')
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false)
  const [savingMed, setSavingMed] = useState(false)

  // Hybrid AI state tracking which fields came from AI and which ones were missing in the photo(s)
  const [aiDetectedFields, setAiDetectedFields] = useState<string[]>([])
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
    fotos_input: [] as string[], // 1 or more base64 or public URLs
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

  // Consultorio IA state
  const [chatInput, setChatInput] = useState('')
  const [pacienteTipo, setPacienteTipo] = useState<'auto' | 'adulto' | 'pediatrico'>('auto')
  const [edadPesoDetalle, setEdadPesoDetalle] = useState('')
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
  const [sendingEmailNow, setSendingEmailNow] = useState(false)

  function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ text, type })
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev))
    }, 4500)
  }

  // Helper to check if a field is still flagged as missing by the hybrid AI check
  function isFieldMissingFromAI(fieldName: string): boolean {
    if (!aiMissingFields.some((f) => f.campo === fieldName)) return false
    // Clear warning automatically once user types a value into that field
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
        if (filterEstado === 'vencidos' && !esMedicamentoVencido(med)) return false
        if (filterEstado === 'sin_stock' && med.cantidad_actual > 0) return false
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

      // Reset file input value so selecting the same or another file works again
      e.target.value = ''

      // If in hybrid/auto IA mode, automatically analyze all photos together
      if (modoCarga === 'hibrido_ia') {
        await analyzePhotosWithAI(updatedPhotos)
      } else {
        showToast(
          `${compressedList.length} foto(s) agregada(s). Podés completar a mano o tocar "Analizar con IA".`,
          'info'
        )
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
        // Hybrid merge: if AI found a value, fill it; if AI didn't find it in the new photo, keep whatever the user already typed!
        const nextCantInicial =
          d.cantidad_inicial !== null && d.cantidad_inicial !== undefined
            ? Number(d.cantidad_inicial)
            : prev.cantidad_inicial

        return {
          ...prev,
          nombre: d.nombre || prev.nombre,
          droga: d.droga || prev.droga,
          concentracion: d.concentracion || prev.concentracion,
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
          'Se completaron los datos detectados en las fotos. Completá manualmente los datos faltantes resaltados.'
      )

      showToast(
        photos.length > 1
          ? `¡${photos.length} fotos analizadas con IA! Revisá los campos resaltados si falta algún dato.`
          : '¡Foto analizada con IA! Completá manualmente lo que no figuraba en la imagen.',
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
          json.emailSent ? ' • Se envió alerta por email a aeterzano@gmail.com' : ''
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

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: queryText,
      pacienteTipo:
        pacienteTipo === 'pediatrico'
          ? '👶 Bebé / Pediátrico'
          : pacienteTipo === 'adulto'
          ? '🧑 Adulto'
          : 'Automático',
      edadPeso: edadPesoDetalle,
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
          edadPesoDetalle,
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
      showToast('Producto de primera necesidad guardado', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error guardando esencial', 'error')
    }
  }

  async function handleDeleteEsencial(id: string, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" de la lista de productos de primera necesidad?`)) return
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
      showToast('Configuración de alertas actualizada', 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error guardando configuración', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleSendEmailAlertsNow() {
    setSendingEmailNow(true)
    try {
      const res = await fetch('/api/botiquin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_alerts_now' }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      setState(json.state)
      setAlertas(json.alertasActivas)

      if (json.result?.sent) {
        showToast(
          `¡Correo enviado con éxito a ${json.result.recipient} con ${json.result.alertsSentCount} alertas!`,
          'success'
        )
      } else if (json.result?.error) {
        showToast(`Error SMTP: ${json.result.error}`, 'error')
      } else {
        showToast('No hay alertas activas pendientes para enviar por correo.', 'info')
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error enviando correo', 'error')
    } finally {
      setSendingEmailNow(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pb-20 md:pb-8">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 max-w-md animate-in fade-in slide-in-from-bottom-3">
          <div
            className={`flex items-center space-x-3 rounded-xl border px-4 py-3 shadow-2xl ${
              toast.type === 'error'
                ? 'bg-red-950/95 border-red-500/40 text-red-200'
                : toast.type === 'info'
                ? 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
                : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100'
            }`}
          >
            {toast.type === 'error' ? (
              <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="h-5 w-5 text-blue-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.text}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="border-b border-border bg-card px-4 md:px-6 py-3.5 sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => setActiveTab('stock')}
              className="flex items-center space-x-2.5 text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/30 text-primary">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <span className="text-lg font-bold text-foreground tracking-tight block leading-none">
                  Botiquín Virtual
                </span>
                <span className="hidden">

                </span>
              </div>
            </button>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-1.5">
              <button
                onClick={() => setActiveTab('stock')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'stock'
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Mi Stock ({kpis.totalVigentes})</span>
              </button>

              <button
                onClick={() => setActiveTab('consulta')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'consulta'
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Bot className="h-4 w-4" />
                <span>Consultorio IA</span>
              </button>

              <button
                onClick={() => setActiveTab('esenciales')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'esenciales'
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Star className="h-4 w-4" />
                <span>
                  1ra Necesidad ({kpis.esencialesCubiertos}/{kpis.esencialesTotal})
                </span>
              </button>

              <button
                onClick={() => setActiveTab('alertas')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'alertas'
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Bell className="h-4 w-4" />
                <span>Alertas y Config</span>
                {alertas.length > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {alertas.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            <button
              onClick={() => openNewMedModal()}
              className="flex items-center space-x-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Cargar Medicamento</span>
            </button>

            <form action="/auth/signout" method="post">
              <button
                title={`Cerrar sesión (${userEmail})`}
                className="flex items-center space-x-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
              className="flex items-center space-x-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              <span>Cargar</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-foreground hover:bg-muted"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border mt-3 pt-4 pb-2 flex flex-col space-y-2">
            <div className="text-xs text-muted-foreground px-2 pb-1 truncate">
              Sesión: {userEmail}
            </div>
            <form action="/auth/signout" method="post">
              <button className="w-full flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:bg-muted">
                <LogOut className="h-4 w-4" />
                <span>Cerrar Sesión</span>
              </button>
            </form>
          </div>
        )}
      </nav>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-6 py-6">
        {/* ================================================================= */}
        {/* TAB 1: MI STOCK                                                   */}
        {/* ================================================================= */}
        {activeTab === 'stock' && (
          <div className="space-y-6">
            {/* Top Summary Banner & Quick Actions */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div
                onClick={() => {
                  setFilterEstado('activos')
                  setFilterPublico('todos')
                }}
                className="cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stock Actual
                  </span>
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-bold text-foreground">
                    {kpis.totalVigentes}
                  </span>

                </div>
                <div className="mt-2 flex items-center space-x-3 text-xs text-muted-foreground">
                  <span className="flex items-center space-x-1">
                    <Baby className="h-3.5 w-3.5 text-sky-400" />
                    <span>{kpis.pediatricosCount} Pediátricos</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <User className="h-3.5 w-3.5 text-violet-400" />
                    <span>{kpis.adultosCount} Adultos</span>
                  </span>
                </div>
              </div>

              <div
                onClick={() => setFilterEstado('proximo_vencer')}
                className="cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Próximos a Vencer
                  </span>
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span
                    className={`text-2xl md:text-3xl font-bold ${
                      kpis.proximosCount > 0 ? 'text-amber-400' : 'text-foreground'
                    }`}
                  >
                    {kpis.proximosCount}
                  </span>
                  <span className="text-xs text-muted-foreground">

                  </span>
                </div>

              </div>

              <div
                onClick={() =>
                  setFilterEstado(kpis.vencidosCount > 0 ? 'vencidos' : 'sin_stock')
                }
                className="cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-red-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Vencidos / Sin Stock
                  </span>
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div className="mt-2 flex items-baseline space-x-3">
                  <div>
                    <span
                      className={`text-2xl md:text-3xl font-bold ${
                        kpis.vencidosCount > 0 ? 'text-red-400' : 'text-foreground'
                      }`}
                    >
                      {kpis.vencidosCount}
                    </span>

                  </div>
                  <span className="text-muted-foreground">/</span>
                  <div>
                    <span
                      className={`text-2xl md:text-3xl font-bold ${
                        kpis.sinStockCount > 0 ? 'text-rose-400' : 'text-foreground'
                      }`}
                    >
                      {kpis.sinStockCount}
                    </span>

                  </div>
                </div>

              </div>

              <div
                onClick={() => setActiveTab('esenciales')}
                className="cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-violet-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Primera Necesidad
                  </span>
                  <Star className="h-4 w-4 text-violet-400" />
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-bold text-foreground">
                    {kpis.esencialesCubiertos}/{kpis.esencialesTotal}
                  </span>

                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {kpis.esencialesTotal - kpis.esencialesCubiertos > 0 ? (
                    <span className="text-amber-400 font-medium">
                      Faltan {kpis.esencialesTotal - kpis.esencialesCubiertos} esenciales
                    </span>
                  ) : (
                    <span className="text-emerald-400">Botiquín esencial completo</span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick CTA Banner to AI Consultation */}
            <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-emerald-950/40 via-card to-card p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    ¿Tenés algún síntoma o consulta sobre qué tomar o darle al bebé?
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                    Consultale a la IA: revisa tu stock vigente, separa pediátricos de adultos y te avisa si tenés que comprar algo.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('consulta')}
                className="w-full md:w-auto shrink-0 flex items-center justify-center space-x-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                <span>Consultar a la IA</span>
              </button>
            </div>

            {/* Filters & Search Bar */}
            <div className="flex flex-col space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, droga o síntoma (ej: Tafirol, Ibuprofeno, fiebre, vómito)..."
                    className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Público Filter Pills */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
                  <button
                    onClick={() => setFilterPublico('todos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filterPublico === 'todos'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterPublico('pediatrico')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filterPublico === 'pediatrico'
                        ? 'bg-sky-500 text-white'
                        : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Baby className="h-3.5 w-3.5" />
                    <span>Pediátrico / Bebé</span>
                  </button>
                  <button
                    onClick={() => setFilterPublico('adulto')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filterPublico === 'adulto'
                        ? 'bg-violet-500 text-white'
                        : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>Adultos</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto pt-1 border-t border-border/60">
                {[
                  { id: 'activos', label: 'Activos en Botiquín' },
                  { id: 'proximo_vencer', label: `Próximos a vencer (${kpis.proximosCount})` },
                  { id: 'vencidos', label: `Vencidos (${kpis.vencidosCount})` },
                  { id: 'sin_stock', label: `Sin stock (${kpis.sinStockCount})` },
                  { id: 'bajas', label: 'Dados de baja / Historial' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setFilterEstado(
                        tab.id as
                          | 'activos'
                          | 'proximo_vencer'
                          | 'vencidos'
                          | 'sin_stock'
                          | 'bajas'
                      )
                    }
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      filterEstado === tab.id
                        ? 'bg-muted text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Medications Grid */}
            {filteredMeds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                <Pill className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="text-lg font-semibold text-foreground">
                  No hay medicamentos en esta vista
                </h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                  Podés dar de alta un medicamento subiendo 1 o más fotos (modo automático / híbrido con IA) o ingresando los datos manualmente.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => openNewMedModal(undefined, 'hibrido_ia')}
                    className="inline-flex items-center space-x-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Cargar con Fotos + IA (Híbrido)</span>
                  </button>
                  <button
                    onClick={() => openNewMedModal(undefined, 'manual')}
                    className="inline-flex items-center space-x-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    <PenTool className="h-4 w-4" />
                    <span>Carga Manual</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      : 100

                  const allPhotos =
                    med.fotos_urls && med.fotos_urls.length > 0
                      ? med.fotos_urls
                      : med.foto_url
                      ? [med.foto_url]
                      : []

                  return (
                    <div
                      key={med.id}
                      className={`flex flex-col justify-between rounded-2xl border bg-card p-4 shadow-sm transition-all ${
                        vencido
                          ? 'border-red-500/50 bg-red-950/10'
                          : proximo
                          ? 'border-amber-500/40'
                          : sinStock
                          ? 'border-rose-500/40 opacity-90'
                          : 'border-border hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        {/* Header row: Photo + Badges */}
                        <div className="flex items-start gap-3.5">
                          {allPhotos.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLightboxPhotos(allPhotos)
                                setLightboxIndex(0)
                              }}
                              className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-background relative group"
                            >
                              <img
                                src={allPhotos[0]}
                                alt={med.nombre}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                              {allPhotos.length > 1 && (
                                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white flex items-center space-x-0.5">
                                  <Images className="h-2.5 w-2.5 mr-0.5" />
                                  <span>{allPhotos.length}</span>
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                              {med.unidad === 'ml' || med.unidad === 'gotas' ? (
                                <Droplets className="h-7 w-7 text-sky-400" />
                              ) : (
                                <Pill className="h-7 w-7 text-primary" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {med.publico === 'pediatrico' ? (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-400 border border-sky-500/30">
                                  <Baby className="h-3 w-3" />
                                  <span>Pediátrico</span>
                                </span>
                              ) : med.publico === 'adulto' ? (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-300 border border-violet-500/30">
                                  <User className="h-3 w-3" />
                                  <span>Adultos</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                                  <Users className="h-3 w-3" />
                                  <span>Familiar / Ambos</span>
                                </span>
                              )}

                              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground truncate max-w-[140px]">
                                {med.categoria}
                              </span>
                            </div>

                            <h3 className="group/nombre relative text-base font-bold text-foreground leading-snug cursor-default">
                              <span className="block truncate" title={med.nombre}>
                                {med.nombre}
                              </span>
                              <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/nombre:block z-50 w-max max-w-[260px] rounded-lg border border-border bg-zinc-900/95 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-xl whitespace-normal break-words">
                                {med.nombre}
                              </span>
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {med.droga || 'Sin especificar'}{' '}
                              {med.concentracion ? `• ${med.concentracion}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Stock Progress Bar & Quantity */}
                        <div className="mt-4 rounded-xl bg-background/80 border border-border/70 p-3">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground font-medium">Disponibilidad:</span>
                            <span
                              className={`font-bold text-sm ${
                                sinStock
                                  ? 'text-red-400'
                                  : med.cantidad_actual <= med.stock_minimo
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {med.cantidad_actual} / {med.cantidad_inicial} {med.unidad}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full transition-all ${
                                sinStock
                                  ? 'bg-red-500'
                                  : med.cantidad_actual <= med.stock_minimo
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          {/* Expiration Badge */}
                          <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-border/50">
                            <span className="text-muted-foreground flex items-center space-x-1">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Vencimiento:</span>
                            </span>
                            {med.fecha_vencimiento ? (
                              <span
                                className={`font-semibold px-2 py-0.5 rounded-md ${
                                  vencido
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : proximo
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300'
                                }`}
                              >
                                {med.fecha_vencimiento}{' '}
                                {vencido
                                  ? `(Vencido hace ${Math.abs(diasVenc!)}d)`
                                  : diasVenc === 0
                                  ? '(Vence HOY)'
                                  : `(${diasVenc}d)`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No especificado</span>
                            )}
                          </div>
                        </div>

                        {/* Indications & Dosage */}
                        {(med.para_que_sirve || med.posologia_referencia) && (
                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            {med.para_que_sirve && (
                              <p className="group/tip relative cursor-default">
                                <span
                                  className="line-clamp-2"
                                  title={`Para qué sirve: ${med.para_que_sirve}`}
                                >
                                  <strong className="text-foreground/90">Para qué sirve:</strong>{' '}{med.para_que_sirve}
  
                                </span>
                                <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:block z-50 w-max max-w-[280px] rounded-lg border border-border bg-zinc-900/95 px-3 py-2 text-xs text-zinc-100 shadow-xl whitespace-normal break-words leading-relaxed">
                                  <strong className="text-emerald-400">Para qué sirve:</strong>{' '}{med.para_que_sirve}
  
                                </span>

                              </p>
                            )}
                            {med.posologia_referencia && (
                              <p className="group/tip relative cursor-default">
                                <span
                                  className="line-clamp-2"
                                  title={`Dosis ref.: ${med.posologia_referencia}`}
                                >
                                  <strong className="text-foreground/90">Dosis ref.:</strong>{' '}{med.posologia_referencia}
  
                                </span>
                                <span className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover/tip:block z-50 w-max max-w-[280px] rounded-lg border border-border bg-zinc-900/95 px-3 py-2 text-xs text-zinc-100 shadow-xl whitespace-normal break-words leading-relaxed">
                                  <strong className="text-sky-400">Dosis ref.:</strong>{' '}{med.posologia_referencia}
  
                                </span>

                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      {med.estado === 'activo' ? (
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            disabled={med.cantidad_actual <= 0}
                            onClick={() => {
                              setDosisModalMed(med)
                              setDosisCantidad(med.unidad === 'ml' ? 5 : 1)
                              setDosisMotivo('')
                            }}
                            className="flex-1 flex items-center justify-center space-x-1 rounded-lg bg-primary/15 border border-primary/30 px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-40 transition-colors"
                          >
                            <MinusCircle className="h-3.5 w-3.5" />
                            <span>Usar Dosis</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReponerModalMed(med)
                              setReponerCantidad(med.cantidad_inicial || 10)
                              setReponerVencimiento(med.fecha_vencimiento || '')
                            }}
                            title="Reponer / Sumar Stock"
                            className="flex items-center justify-center space-x-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            <PlusCircle className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Reponer</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditMedModal(med)}
                            title="Editar"
                            className="p-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                            title="Dar de baja el producto completo (vencido / tirado / perdido)"
                            className="p-2 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            <ArchiveX className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                          <span className="text-red-400 font-medium">
                            Baja ({med.motivo_baja || 'descartado'})
                          </span>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setReponerModalMed(med)
                                setReponerCantidad(med.cantidad_inicial || 10)
                                setReponerVencimiento('')
                              }}
                              className="text-emerald-400 hover:underline font-medium"
                            >
                              Reactivar / Reponer
                            </button>
                            <button
                              onClick={() => handleDeletePermanent(med.id, med.nombre)}
                              className="text-red-400 hover:underline"
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
        {/* TAB 2: CONSULTORIO IA                                             */}
        {/* ================================================================= */}
        {activeTab === 'consulta' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Patient Selector & Quick Prompts */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center space-x-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      Consultorio de Botiquín IA
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Conectado en tiempo real a tu stock ({kpis.totalVigentes} vigentes)
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ¿Para quién es la consulta?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('auto')}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        pacienteTipo === 'auto'
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      Automático
                    </button>
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('pediatrico')}
                      className={`flex items-center justify-center space-x-1 py-2 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        pacienteTipo === 'pediatrico'
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      <Baby className="h-3.5 w-3.5" />
                      <span>Bebé / Niño</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPacienteTipo('adulto')}
                      className={`flex items-center justify-center space-x-1 py-2 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        pacienteTipo === 'adulto'
                          ? 'bg-violet-500/20 border-violet-400 text-violet-300'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Adulto</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Edad / Peso aproximado (opcional, muy útil para bebés):
                  </label>
                  <input
                    type="text"
                    value={edadPesoDetalle}
                    onChange={(e) => setEdadPesoDetalle(e.target.value)}
                    placeholder="Ej: Bebé de 11 meses, pesa 9.5 kg"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    Consultas frecuentes en 1 clic:
                  </span>
                  <div className="flex flex-col gap-2">
                    {[
                      'Me duele la espalda, de mi stock ¿qué puedo tomar?',
                      'El bebé no para de vomitar, ¿qué le doy?',
                      'El bebé tiene 38.5°C de fiebre, ¿qué tengo en stock para darle?',
                      'Me duele fuerte la cabeza y tengo malestar, ¿qué puedo tomar?',
                      'Tengo dolor de panza / acidez estomacal, ¿qué hay en mi botiquín?',
                    ].map((ejemplo) => (
                      <button
                        key={ejemplo}
                        type="button"
                        onClick={() => handleSendConsulta(ejemplo)}
                        disabled={consultingAI}
                        className="text-left text-xs rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-muted/60 px-3 py-2.5 text-foreground transition-colors"
                      >
                        &ldquo;{ejemplo}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right 2 Columns: Chat & Structured Recommendations */}
            <div className="lg:col-span-2 flex flex-col rounded-2xl border border-border bg-card overflow-hidden min-h-[560px]">
              {/* Chat Messages Area */}
              <div className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto max-h-[640px]">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-14 px-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30 mb-4">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">
                      Hacé tu consulta médica sobre tu Botiquín
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-md">
                      Escribí qué síntoma tenés vos o el bebé. La IA revisará tus{' '}
                      <strong>{kpis.totalVigentes} medicamentos vigentes en stock</strong>, te dirá qué podés usar y, si no tenés nada disponible, te sugerirá qué comprar.
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
                        className={`max-w-2xl rounded-2xl p-4 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background border border-border text-foreground w-full'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] opacity-75">
                          <span className="font-semibold">
                            {msg.role === 'user'
                              ? `Tu consulta (${msg.pacienteTipo}${
                                  msg.edadPeso ? ` • ${msg.edadPeso}` : ''
                                })`
                              : '🤖 Asistente Farmacéutico IA'}
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>

                        <div className="text-sm whitespace-pre-line leading-relaxed">
                          {msg.text}
                        </div>

                        {/* Structured AI Sections */}
                        {msg.aiData && (
                          <div className="mt-4 space-y-4 pt-4 border-t border-border">
                            {/* 1. Recomendados de tu stock */}
                            {msg.aiData.recomendados_del_stock.length > 0 ? (
                              <div className="space-y-2.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Disponible en tu Stock para este malestar:</span>
                                </h4>
                                <div className="grid grid-cols-1 gap-2.5">
                                  {msg.aiData.recomendados_del_stock.map((rec) => (
                                    <div
                                      key={rec.id}
                                      className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                      <div>
                                        <div className="font-bold text-sm text-emerald-200">
                                          {rec.nombre}{' '}
                                          <span className="text-xs font-normal text-emerald-300/80">
                                            ({rec.droga})
                                          </span>
                                        </div>
                                        <div className="text-xs text-zinc-300 mt-1">
                                          <strong>Dosis orientativa:</strong> {rec.dosis_sugerida}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {rec.motivo} • Stock disponible:{' '}
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
                                        className="shrink-0 flex items-center justify-center space-x-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition-colors"
                                      >
                                        <MinusCircle className="h-3.5 w-3.5" />
                                        <span>
                                          Descontar dosis (-{rec.cantidad_descontar_sugerida || 1}{' '}
                                          {rec.unidad})
                                        </span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 flex items-start space-x-2.5">
                                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-200">
                                  <strong>No tenés medicamentos vigentes en tu stock</strong> para
                                  tratar específicamente este malestar. Mirá abajo las sugerencias
                                  para comprar en la farmacia.
                                </div>
                              </div>
                            )}

                            {/* 2. Advertencias de medicamentos vencidos o sin stock */}
                            {msg.aiData.advertencias_stock.length > 0 && (
                              <div className="rounded-xl border border-red-500/40 bg-red-950/25 p-3.5 space-y-1.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center space-x-1.5">
                                  <ShieldAlert className="h-4 w-4" />
                                  <span>Atención en tu Botiquín (Vencidos / Agotados):</span>
                                </h4>
                                <ul className="list-disc list-inside text-xs text-red-200 space-y-1">
                                  {msg.aiData.advertencias_stock.map((adv, i) => (
                                    <li key={i}>{adv}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* 3. Sugerencias para comprar */}
                            {msg.aiData.sugerencias_compra.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center space-x-1.5">
                                  <ShoppingBag className="h-4 w-4" />
                                  <span>Sugerencias adicionales para comprar en Farmacia:</span>
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                  {msg.aiData.sugerencias_compra.map((sug, i) => (
                                    <div
                                      key={i}
                                      className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-xs"
                                    >
                                      <div className="font-bold text-sky-200">
                                        {sug.nombre_sugerido}{' '}
                                        <span className="font-normal text-sky-300/80">
                                          ({sug.droga} • {sug.publico})
                                        </span>
                                      </div>
                                      <p className="text-zinc-300 mt-1">{sug.motivo}</p>
                                      {sug.presentacion_sugerida && (
                                        <p className="text-muted-foreground mt-0.5">
                                          Presentación sugerida: {sug.presentacion_sugerida}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 4. Pautas de alarma */}
                            {msg.aiData.pautas_alarma.length > 0 && (
                              <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                                <strong className="text-foreground block mb-1">
                                  🩺 Cuándo consultar al médico / guardia:
                                </strong>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {msg.aiData.pautas_alarma.map((p, i) => (
                                    <li key={i}>{p}</li>
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
                  <div className="flex items-center space-x-3 rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>
                      Analizando tu stock disponible, fechas de vencimiento y recomendaciones médicas...
                    </span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendConsulta()
                }}
                className="border-t border-border bg-background p-3 md:p-4 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder='Ej: "Me duele la espalda, ¿qué puedo tomar?" o "El bebé no para de vomitar, ¿qué le doy?"'
                  className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={consultingAI || !chatInput.trim()}
                  className="flex items-center space-x-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {consultingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Consultar</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: PRIMERA NECESIDAD (ESENCIALES)                             */}
        {/* ================================================================= */}
        {activeTab === 'esenciales' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center space-x-2">
                  <Star className="h-5 w-5 text-violet-400" />
                  <span>Productos de Primera Necesidad (Esenciales)</span>
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Lista predefinida y editable por vos. Cuando un esencial no está cubierto por ningún medicamento vigente en tu stock, el sistema genera alerta y te envía un email a{' '}
                  <strong>{state.config.email_alertas}</strong>.
                </p>
              </div>
              <button
                onClick={openNewEsencialModal}
                className="shrink-0 flex items-center justify-center space-x-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar Esencial</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {state.esenciales.map((esc) => {
                const { cubierto, medicamentosQueCubren } = verificarCoberturaEsencial(
                  esc,
                  state.medicamentos
                )
                return (
                  <div
                    key={esc.id}
                    className={`rounded-2xl border bg-card p-5 flex flex-col justify-between transition-colors ${
                      !esc.activo
                        ? 'border-border opacity-60'
                        : cubierto
                        ? 'border-emerald-500/35'
                        : 'border-red-500/45 bg-red-950/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {cubierto ? (
                            <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Cubierto en Stock</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 rounded-md bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300 border border-red-500/35">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>FALTANTE</span>
                            </span>
                          )}

                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {esc.publico === 'pediatrico'
                              ? '👶 Pediátrico'
                              : esc.publico === 'adulto'
                              ? '🧑 Adultos'
                              : '👨‍👩‍👧 Ambos'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openEditEsencialModal(esc)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Editar esencial"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEsencial(esc.id, esc.nombre)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-muted"
                            title="Eliminar esencial"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-foreground">{esc.nombre}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Droga / Referencia: <strong>{esc.droga_sugerida}</strong>
                      </p>
                      {esc.descripcion && (
                        <p className="text-xs text-muted-foreground mt-2">{esc.descripcion}</p>
                      )}

                      {cubierto ? (
                        <div className="mt-3 rounded-xl bg-emerald-950/25 border border-emerald-500/25 p-2.5 text-xs text-emerald-200">
                          <strong>Cubierto por:</strong>{' '}
                          {medicamentosQueCubren
                            .map((m) => `${m.nombre} (${m.cantidad_actual} ${m.unidad})`)
                            .join(', ')}
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-red-950/25 border border-red-500/25 p-2.5 text-xs text-red-200">
                          <span>No hay ningún producto activo y en fecha que lo cubra.</span>
                          <button
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
                            className="ml-2 shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground"
                          >
                            + Cargar al Stock
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/60 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <span>Palabras clave de detección:</span>
                      {esc.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded bg-background border border-border px-1.5 py-0.5"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: ALERTAS, HISTORIAL Y CONFIGURACIÓN                         */}
        {/* ================================================================= */}
        {activeTab === 'alertas' && (
          <div className="space-y-6">
            {/* Active Alerts & Manual Email Trigger */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center space-x-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <span>Centro de Alertas por Email ({alertas.length} activas)</span>
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Se envía un correo automático a{' '}
                    <strong className="text-foreground">{state.config.email_alertas}</strong> ante:
                    Producto próximo a vencer, Producto vencido, Primera necesidad faltante o
                    Producto sin stock.
                  </p>
                </div>

                <button
                  onClick={handleSendEmailAlertsNow}
                  disabled={sendingEmailNow}
                  className="shrink-0 flex items-center justify-center space-x-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sendingEmailNow ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  <span>Enviar Reporte por Email Ahora</span>
                </button>
              </div>

              {alertas.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                  <p className="text-sm font-semibold text-emerald-200">
                    ¡Todo en orden! No hay medicamentos vencidos, próximos a vencer ni faltantes.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {alertas.map((a, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3.5 ${
                        a.tipo === 'vencido' || a.tipo === 'sin_stock'
                          ? 'border-red-500/40 bg-red-950/15'
                          : a.tipo === 'proximo_vencer'
                          ? 'border-amber-500/40 bg-amber-950/15'
                          : 'border-violet-500/40 bg-violet-950/15'
                      }`}
                    >
                      <div className="text-sm font-bold text-foreground">{a.titulo}</div>
                      <p className="text-xs text-muted-foreground mt-1">{a.detalle}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Settings & History Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings Form */}
              <form
                onSubmit={handleSaveConfig}
                className="rounded-2xl border border-border bg-card p-5 space-y-4"
              >
                <h3 className="text-base font-bold text-foreground flex items-center space-x-2">
                  <Settings className="h-4 w-4 text-primary" />
                  <span>Configuración de Reglas y Notificaciones</span>
                </h3>

                <div className="space-y-1.5">
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
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Umbral de &ldquo;Próximo a vencer&rdquo; (días antes de la fecha de vencimiento):
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
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                  />
                </div>

                <div className="space-y-2.5 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    Escenarios que disparan mail automático:
                  </span>
                  {[
                    {
                      key: 'alertar_proximo_vencer',
                      label: '⏳ Producto próximo a vencer',
                    },
                    {
                      key: 'alertar_vencido',
                      label: '🚨 Producto vencido',
                    },
                    {
                      key: 'alertar_esencial_faltante',
                      label: '⭐ Producto de primera necesidad faltante',
                    },
                    {
                      key: 'alertar_sin_stock',
                      label: '📦 Producto sin stock (0 disponibles)',
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center space-x-3 text-sm text-foreground cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(configForm[item.key as keyof BotiquinConfig])}
                        onChange={(e) =>
                          setConfigForm({
                            ...configForm,
                            [item.key]: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-border accent-emerald-500"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </form>

              {/* Movements & Sent Emails Log */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-base font-bold text-foreground flex items-center space-x-2">
                  <History className="h-4 w-4 text-primary" />
                  <span>Últimos Movimientos de Stock y Consumos</span>
                </h3>

                {state.movimientos.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    Todavía no hay movimientos registrados.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {state.movimientos.slice(0, 30).map((mov) => (
                      <div
                        key={mov.id}
                        className="rounded-xl border border-border bg-background p-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">
                            {mov.medicamento_nombre}{' '}
                            <span
                              className={`ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase ${
                                mov.tipo === 'alta' || mov.tipo === 'reposicion'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : mov.tipo === 'consumo'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : mov.tipo === 'baja'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-zinc-700 text-zinc-300'
                              }`}
                            >
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
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur px-2 py-1.5 grid grid-cols-4 gap-1">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'stock' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Package className="h-5 w-5 mb-0.5" />
          <span>Mi Stock</span>
        </button>

        <button
          onClick={() => setActiveTab('consulta')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'consulta' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Bot className="h-5 w-5 mb-0.5" />
          <span>Consulta IA</span>
        </button>

        <button
          onClick={() => setActiveTab('esenciales')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'esenciales' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Star className="h-5 w-5 mb-0.5" />
          <span>Esenciales</span>
        </button>

        <button
          onClick={() => setActiveTab('alertas')}
          className={`relative flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium ${
            activeTab === 'alertas' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Bell className="h-5 w-5 mb-0.5" />
          <span>Alertas</span>
          {alertas.length > 0 && (
            <span className="absolute top-1 right-4 h-4 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white flex items-center justify-center">
              {alertas.length}
            </span>
          )}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT MEDICAMENTO (MULTI-FOTO + AUTO / HÍBRIDO / MANUAL)  */}
      {/* ===================================================================== */}
      {medModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 md:p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {editingMed ? 'Editar Medicamento' : 'Alta de Medicamento en el Botiquín'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Podés subir 1 o más fotos para autocompletar con IA (modo híbrido) o cargar todo manualmente.
                </p>
              </div>
              <button
                onClick={() => setMedModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mode Selector Tabs: Automático/Híbrido con IA vs Carga Manual */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-background p-1.5 border border-border">
              <button
                type="button"
                onClick={() => setModoCarga('hibrido_ia')}
                className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-3 text-xs font-semibold transition-colors ${
                  modoCarga === 'hibrido_ia'
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                <span>Automático / Híbrido (Fotos + IA)</span>
              </button>
              <button
                type="button"
                onClick={() => setModoCarga('manual')}
                className={`flex items-center justify-center space-x-2 rounded-lg py-2 px-3 text-xs font-semibold transition-colors ${
                  modoCarga === 'manual'
                    ? 'bg-zinc-800 text-foreground border border-zinc-700 shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PenTool className="h-4 w-4" />
                <span>Carga Manual (Con o sin fotos)</span>
              </button>
            </div>

            <form onSubmit={handleSaveMedicamento} className="mt-4 space-y-4">
              {/* Multi-Photo Upload & AI Vision Box */}
              <div
                className={`rounded-xl border border-dashed p-4 space-y-3 ${
                  modoCarga === 'hibrido_ia'
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-background/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Images className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        Fotos del Medicamento ({medForm.fotos_input.length} cargada
                        {medForm.fotos_input.length === 1 ? '' : 's'})
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {modoCarga === 'hibrido_ia'
                          ? 'Subí 1 o más fotos (ej: frente de la caja + solapa de vencimiento). Lo que no se vea en la foto te lo pediremos completar abajo.'
                          : 'Opcional: podés adjuntar 1 o más fotos del envase y escribir los datos manualmente abajo.'}
                      </p>
                    </div>
                  </div>

                  {/* Hidden File Inputs: 1 for Camera Capture, 1 for Multi-File Gallery */}
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

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={analyzingPhoto}
                      className="flex items-center space-x-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Sacar Foto</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={analyzingPhoto}
                      className="flex items-center space-x-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      <span>Subir 1 o más Fotos</span>
                    </button>

                    {medForm.fotos_input.length > 0 && (
                      <button
                        type="button"
                        onClick={() => analyzePhotosWithAI()}
                        disabled={analyzingPhoto}
                        className="flex items-center space-x-1 rounded-xl border border-primary/40 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {analyzingPhoto ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Analizando...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>
                              Analizar {medForm.fotos_input.length} foto(s) con IA
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Thumbnails Gallery of Uploaded Photos */}
                {medForm.fotos_input.length > 0 && (
                  <div className="flex items-center gap-2.5 overflow-x-auto pt-2 border-t border-border/60">
                    {medForm.fotos_input.map((imgSrc, idx) => (
                      <div
                        key={idx}
                        className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border border-border bg-background group"
                      >
                        <img
                          src={imgSrc}
                          alt={`Foto ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhotoAtIndex(idx)}
                          title="Quitar esta foto"
                          className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white hover:bg-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {analyzingPhoto && (
                  <div className="flex items-center space-x-2.5 rounded-xl bg-primary/10 border border-primary/30 p-3 text-xs text-primary">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>
                      Gemini Vision está leyendo tus {medForm.fotos_input.length} foto(s) para extraer nombre, droga, vencimiento y posología...
                    </span>
                  </div>
                )}

                {/* Hybrid AI Report Banner: Shows what was found and what needs manual entry */}
                {!analyzingPhoto && (aiHybridMessage || aiMissingFields.length > 0) && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3.5 space-y-2">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-100">
                        <strong className="block text-amber-300">
                          Modo Híbrido (Foto + Carga Manual):
                        </strong>
                        <span>{aiHybridMessage}</span>
                      </div>
                    </div>

                    {aiMissingFields.length > 0 && (
                      <div className="pl-6 space-y-1">
                        <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider block">
                          Completá manualmente estos datos que no se vieron en la foto (o subí otra foto donde se vean):
                        </span>
                        <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-0.5">
                          {aiMissingFields.map((f, i) => (
                            <li key={i}>
                              <strong>{f.etiqueta}:</strong> {f.motivo}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Main Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      Nombre Comercial *
                    </label>
                    {isFieldMissingFromAI('nombre') ? (
                      <span className="text-[10px] font-semibold text-amber-400">
                        ⚠️ Completar manualmente
                      </span>
                    ) : aiDetectedFields.includes('nombre') ? (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ✨ Leído de la foto
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    required
                    value={medForm.nombre}
                    onChange={(e) => {
                      updateMedFormAutoStock({ nombre: e.target.value })
                      if (e.target.value.trim()) clearFieldMissingFlag('nombre')
                    }}
                    placeholder="Ej: Ibupirac 4%, Tafirol 1g, Reliveran Gotas"
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground ${
                      isFieldMissingFromAI('nombre')
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : 'border-border'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      Droga / Principio Activo
                    </label>
                    {isFieldMissingFromAI('droga') ? (
                      <span className="text-[10px] font-semibold text-amber-400">
                        ⚠️ Completar manualmente
                      </span>
                    ) : aiDetectedFields.includes('droga') ? (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ✨ Leído de la foto
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={medForm.droga}
                    onChange={(e) => {
                      updateMedFormAutoStock({ droga: e.target.value })
                      if (e.target.value.trim()) clearFieldMissingFlag('droga')
                    }}
                    placeholder="Ej: Ibuprofeno, Paracetamol, Metoclopramida"
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground ${
                      isFieldMissingFromAI('droga')
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : 'border-border'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      Concentración / Gramaje
                    </label>
                    {isFieldMissingFromAI('concentracion') ? (
                      <span className="text-[10px] font-semibold text-amber-400">
                        ⚠️ No visible — Completar
                      </span>
                    ) : aiDetectedFields.includes('concentracion') ? (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ✨ Leído de la foto
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={medForm.concentracion}
                    onChange={(e) => {
                      setMedForm({ ...medForm, concentracion: e.target.value })
                      if (e.target.value.trim()) clearFieldMissingFlag('concentracion')
                    }}
                    placeholder="Ej: 400 mg, 4g/100ml, 2 mg/ml"
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground ${
                      isFieldMissingFromAI('concentracion')
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : 'border-border'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      Público (Adultos / Pediátrico) *
                    </label>
                    {aiDetectedFields.includes('publico') && (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ✨ Detectado
                      </span>
                    )}
                  </div>
                  <select
                    value={medForm.publico}
                    onChange={(e) =>
                      updateMedFormAutoStock({ publico: e.target.value as PublicoObjetivo })
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="adulto">🧑 Adultos</option>
                    <option value="pediatrico">👶 Pediátrico / Bebés</option>
                    <option value="ambos">👨‍👩‍👧 Ambos / Uso Familiar</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Categoría / Uso Principal
                  </label>
                  <select
                    value={medForm.categoria}
                    onChange={(e) => setMedForm({ ...medForm, categoria: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {CATEGORIAS_MEDICAMENTOS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground">
                      Fecha de Vencimiento
                    </label>
                    {isFieldMissingFromAI('fecha_vencimiento') ? (
                      <span className="text-[10px] font-semibold text-amber-400">
                        ⚠️ No visible en foto — Cargar manual
                      </span>
                    ) : medForm.fecha_vencimiento && aiDetectedFields.includes('fecha_vencimiento') ? (
                      <span className="text-[10px] font-medium text-emerald-400">
                        ✨ Leído de la foto
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="date"
                    value={medForm.fecha_vencimiento}
                    onChange={(e) => {
                      setMedForm({ ...medForm, fecha_vencimiento: e.target.value })
                      if (e.target.value) clearFieldMissingFlag('fecha_vencimiento')
                    }}
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground ${
                      isFieldMissingFromAI('fecha_vencimiento')
                        ? 'border-amber-500 ring-1 ring-amber-500/40'
                        : 'border-border'
                    }`}
                  />
                </div>
              </div>

              {/* Quantity & Unit Row */}
              <div
                className={`grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border p-3.5 ${
                  isFieldMissingFromAI('cantidad_inicial') ||
                  aiMissingFields.some((f) => f.campo === 'cantidad_actual')
                    ? 'border-amber-500/50 bg-amber-950/10'
                    : 'border-border bg-background/60'
                }`}
              >
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Unidad de Medida
                  </label>
                  <select
                    value={medForm.unidad}
                    onChange={(e) =>
                      setMedForm({ ...medForm, unidad: e.target.value as UnidadMedida })
                    }
                    className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground"
                  >
                    {UNIDADES_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Cant. Disponible *
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
                      clearFieldMissingFlag('cantidad_inicial')
                    }}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-emerald-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Contenido Envase
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
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Stock Mínimo
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={medForm.stock_minimo}
                    onChange={(e) =>
                      {
                        setStockMinimoTouched(true)
                        setMedForm({ ...medForm, stock_minimo: Number(e.target.value) })
                      }
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>

              {/* Details & Posology */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    ¿Para qué sirve? (Síntomas / Indicaciones)
                  </label>
                  <input
                    type="text"
                    value={medForm.para_que_sirve}
                    onChange={(e) => updateMedFormAutoStock({ para_que_sirve: e.target.value })}
                    placeholder="Ej: Fiebre, dolor de espalda, contracturas, dolor de cabeza..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Posología / Dosis de referencia
                    </label>
                    <input
                      type="text"
                      value={medForm.posologia_referencia}
                      onChange={(e) =>
                        setMedForm({ ...medForm, posologia_referencia: e.target.value })
                      }
                      placeholder="Ej: 1 comp cada 8 hs / 5 ml cada 8 hs"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Vincular a Esencial de 1ra Necesidad (opcional)
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
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Detección automática por droga/nombre</option>
                      {state.esenciales.map((esc) => (
                        <option key={esc.id} value={esc.id}>
                          ⭐ {esc.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setMedModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMed}
                  className="flex items-center space-x-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingMed && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingMed ? 'Guardar Cambios' : 'Guardar en el Stock'}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Registrar Dosis Usada • {dosisModalMed.nombre}
              </h3>
              <button
                onClick={() => setDosisModalMed(null)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConsumeDosis} className="mt-4 space-y-4">
              <div className="text-xs text-muted-foreground">
                Disponible actualmente:{' '}
                <strong className="text-foreground">
                  {dosisModalMed.cantidad_actual} {dosisModalMed.unidad}
                </strong>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-2">
                  Cantidad utilizada ({dosisModalMed.unidad}):
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        dosisCantidad === preset
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      -{preset} {dosisModalMed.unidad}
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
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-bold text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nota / Para quién se usó (opcional):
                </label>
                <input
                  type="text"
                  value={dosisMotivo}
                  onChange={(e) => setDosisMotivo(e.target.value)}
                  placeholder="Ej: Dosis para dolor de espalda / Fiebre del bebé"
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDosisModalMed(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDosis}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {submittingDosis ? 'Descontando...' : `Descontar -${dosisCantidad} ${dosisModalMed.unidad}`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Reponer Stock • {reponerModalMed.nombre}
              </h3>
              <button
                onClick={() => setReponerModalMed(null)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReponerStock} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Cantidad a sumar ({reponerModalMed.unidad}):
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={reponerCantidad}
                  onChange={(e) => setReponerCantidad(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nueva fecha de vencimiento (si compraste caja nueva):
                </label>
                <input
                  type="date"
                  value={reponerVencimiento}
                  onChange={(e) => setReponerVencimiento(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReponerModalMed(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReponer}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                >
                  {submittingReponer ? 'Guardando...' : `+ Sumar ${reponerCantidad} ${reponerModalMed.unidad}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DAR DE BAJA EL PRODUCTO COMPLETO (VENCIDO / TIRADO / PERDIDO)  */}
      {/* ===================================================================== */}
      {bajaModalMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-red-400">
                Dar de Baja Producto Completo
              </h3>
              <button
                onClick={() => setBajaModalMed(null)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBajaMedicamento} className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Vas a dar de baja <strong>{bajaModalMed.nombre}</strong> (actualmente con{' '}
                {bajaModalMed.cantidad_actual} {bajaModalMed.unidad}). Si este medicamento cubría un
                producto de primera necesidad y no hay otro reemplazo, se enviará una alerta a tu
                correo.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground block">
                  Motivo de la baja:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'vencido', label: '🚨 Se venció' },
                    { id: 'tirado', label: '🗑️ Lo tiré / Descarté' },
                    { id: 'perdido', label: '🔍 Lo perdí' },
                    { id: 'agotado', label: '📦 Se terminó todo' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBajaMotivo(opt.id as MotivoBaja)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold text-left transition-colors ${
                        bajaMotivo === opt.id
                          ? 'border-red-500 bg-red-500/20 text-red-200'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Comentario adicional (opcional):
                </label>
                <input
                  type="text"
                  value={bajaDetalle}
                  onChange={(e) => setBajaDetalle(e.target.value)}
                  placeholder="Ej: Frasco abierto hace más de 1 mes"
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBajaModalMed(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingBaja}
                  className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600"
                >
                  {submittingBaja ? 'Procesando...' : 'Confirmar Baja Total'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                {editingEsencial
                  ? 'Editar Producto de Primera Necesidad'
                  : 'Nuevo Producto de Primera Necesidad'}
              </h3>
              <button
                onClick={() => setEsencialModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEsencial} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nombre del Esencial *
                </label>
                <input
                  type="text"
                  required
                  value={esencialForm.nombre}
                  onChange={(e) => setEsencialForm({ ...esencialForm, nombre: e.target.value })}
                  placeholder="Ej: Ibuprofeno Pediátrico, Sales de Rehidratación..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Droga / Producto sugerido
                  </label>
                  <input
                    type="text"
                    value={esencialForm.droga_sugerida}
                    onChange={(e) =>
                      setEsencialForm({ ...esencialForm, droga_sugerida: e.target.value })
                    }
                    placeholder="Ej: Ibuprofeno 4%"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
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
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="ambos">👨‍👩‍👧 Ambos</option>
                    <option value="pediatrico">👶 Pediátrico</option>
                    <option value="adulto">🧑 Adultos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Palabras clave para detectar automáticamente en tu stock (separadas por coma):
                </label>
                <input
                  type="text"
                  value={esencialForm.keywords}
                  onChange={(e) => setEsencialForm({ ...esencialForm, keywords: e.target.value })}
                  placeholder="Ej: ibuprofeno, ibupirac, actron"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Descripción / Utilidad
                </label>
                <input
                  type="text"
                  value={esencialForm.descripcion}
                  onChange={(e) =>
                    setEsencialForm({ ...esencialForm, descripcion: e.target.value })
                  }
                  placeholder="Ej: Fundamental para fiebre e inflamación"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEsencialModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Guardar Esencial
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
              className="absolute -top-10 right-0 rounded-full bg-zinc-800 p-2 text-white hover:bg-zinc-700"
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
                  className="absolute left-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              <img
                src={lightboxPhotos[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[75vh] max-w-full rounded-2xl border border-border object-contain"
              />

              {lightboxPhotos.length > 1 && (
                <button
                  onClick={() =>
                    setLightboxIndex((lightboxIndex + 1) % lightboxPhotos.length)
                  }
                  className="absolute right-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
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
