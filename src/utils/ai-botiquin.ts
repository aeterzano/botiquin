import {
  calcularDiasVencimiento,
  CATEGORIAS_MEDICAMENTOS,
  esMedicamentoVencido,
  Medicamento,
  PublicoObjetivo,
  UnidadMedida,
} from './botiquin-types'

export interface CampoFaltanteIA {
  campo: string
  etiqueta: string
  motivo: string
}

export interface ExtractedMedData {
  nombre: string
  droga: string
  concentracion: string
  publico: PublicoObjetivo
  categoria: string
  unidad: UnidadMedida
  cantidad_inicial: number | null
  fecha_vencimiento: string | null
  para_que_sirve: string
  posologia_referencia: string
  notas: string
  campos_detectados: string[]
  campos_faltantes: CampoFaltanteIA[]
  mensaje_hibrido: string
}

export interface RecomendadoDelStock {
  id: string
  nombre: string
  droga: string
  cantidad_actual: number
  unidad: string
  dosis_sugerida: string
  cantidad_descontar_sugerida: number
  motivo: string
}

export interface SugerenciaCompra {
  nombre_sugerido: string
  droga: string
  publico: string
  motivo: string
  presentacion_sugerida: string
}

export interface ConsultaAIResponse {
  respuesta_markdown: string
  en_stock_utilizable: boolean
  recomendados_del_stock: RecomendadoDelStock[]
  advertencias_stock: string[]
  sugerencias_compra: SugerenciaCompra[]
  pautas_alarma: string[]
  nivel_urgencia: 'baja' | 'media' | 'alta'
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest']

async function callGeminiAPI(parts: unknown[], temperature = 0.2): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('No se encontró GEMINI_API_KEY configurada en el servidor.')
  }

  let lastError = ''
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
          },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        lastError = `Status ${res.status}: ${errText}`
        continue
      }

      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text.trim()
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  throw new Error(`Error al consultar Gemini AI: ${lastError}`)
}

function cleanJsonString(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  return trimmed
}

export async function analyzeMedicationPhotos(
  imagesInput: string | string[]
): Promise<ExtractedMedData> {
  const imagesArray = Array.isArray(imagesInput) ? imagesInput : [imagesInput]
  const validImages = imagesArray.filter(Boolean)

  if (validImages.length === 0) {
    throw new Error('No se recibieron imágenes para analizar.')
  }

  const imageParts = validImages.map((imgDataUrl) => {
    const match = imgDataUrl.match(/^data:([^;]+);base64,(.+)$/)
    const mimeType = match ? match[1] : 'image/jpeg'
    const base64Data = match ? match[2] : imgDataUrl
    return {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    }
  })

  const prompt = `
Analizá ${
    validImages.length > 1
      ? `estas ${validImages.length} fotos de un mismo medicamento (por ejemplo: frente de la caja, dorso, solapa con fecha de vencimiento, blíster o prospecto)`
      : 'esta foto de un medicamento (caja, frasco, blíster o prospecto)'
  } y extraé toda la información posible en español (Argentina).

REGLA MUY IMPORTANTE PARA CARGA HÍBRIDA (IA + MANUAL):
- Combiná la información de todas las imágenes provistas.
- Si un dato (como "nombre" o "droga") se ve en la imagen, podés deducir con conocimiento farmacéutico "para_que_sirve", "categoria" y "posologia_referencia" habituales de ese medicamento.
- PERO para datos físicos específicos del envase que NO se vean en ninguna de las fotos (especialmente "fecha_vencimiento", o si no se ve "nombre", "droga", "concentracion" o "cantidad_inicial"), NO los inventes: devolvé "" o null en ese campo y agregalo en "campos_faltantes" para que el sistema le pida al usuario ingresarlo manualmente o subir otra foto donde se vea.

Devolvé EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "nombre": "Nombre comercial si es visible en las fotos (ej: 'Ibupirac 4% Suspensión', 'Tafirol 1g'). Si no se ve ningún nombre en la foto, devolver ''",
  "droga": "Principio activo / droga genérica (ej: 'Ibuprofeno', 'Paracetamol'). Si no se ve ni se puede deducir del nombre comercial visible, devolver ''",
  "concentracion": "Concentración o gramaje si se ve en la foto (ej: '4g / 100ml', '1000 mg', '400 mg'). Si no se ve, devolver ''",
  "publico": "Elegí uno entre: 'adulto', 'pediatrico', 'ambos' (si dice pediátrico, niños, lactantes, gotas pediátricas o suspensión infantil elegí 'pediatrico')",
  "categoria": "Elegí la categoría más adecuada entre: ${CATEGORIAS_MEDICAMENTOS.map((c) => `'${c}'`).join(', ')}",
  "unidad": "Elegí una unidad entre: 'comprimidos', 'ml', 'gotas', 'sobres', 'ampollas', 'g', 'disparos', 'unidades'",
  "cantidad_inicial": 10, // Número con el contenido total del envase si se lee en la caja (ej. 10 comprimidos, 90 ml, 20 ml). Si NO se ve en ninguna foto, devolver null.
  "fecha_vencimiento": null, // SOLO si la fecha de vencimiento (VTO / EXP / Vence) es visible en alguna de las fotos, devolver en formato "YYYY-MM-DD" (si dice MM/YYYY usar el último día de ese mes, ej "2027-08-31"). Si NO se ve la fecha de vencimiento en las fotos, devolver SIEMPRE null.
  "para_que_sirve": "Lista hiper resumida únicamente con los síntomas que trata separados por coma (ej: 'Fiebre, dolor de cabeza, dolores musculares' o 'Náuseas, vómitos'). Máximo 5 a 8 palabras, sin verbos ni oraciones largas.",
  "posologia_referencia": "Dosis habitual orientativa según prospecto para su público objetivo.",
  "notas": "Advertencias importantes (ej: 'Conservar en heladera una vez abierto', 'Agitar antes de usar').",
  "campos_detectados": ["nombre", "droga", "concentracion", "publico", "unidad", "para_que_sirve", "posologia_referencia"], // Lista de nombres de campos que SÍ pudiste completar a partir de las fotos
  "campos_faltantes": [
    // Lista de campos importantes que NO se ven en las fotos y el usuario debe completar manualmente (ej: fecha_vencimiento, cantidad_actual, cantidad_inicial, concentracion, nombre, droga)
    {
      "campo": "fecha_vencimiento",
      "etiqueta": "Fecha de Vencimiento",
      "motivo": "No se llega a ver la solapa o sello de vencimiento en las fotos subidas"
    }
  ],
  "mensaje_hibrido": "Resumen breve para el usuario (ej: 'Se detectó Ibupirac 4% (Ibuprofeno Pediátrico). Por favor completá manualmente la fecha de vencimiento y confirmá cuánta cantidad te queda disponible.')"
}
`

  const rawJson = await callGeminiAPI([{ text: prompt }, ...imageParts], 0.1)
  const parsed = JSON.parse(cleanJsonString(rawJson))

  const nombre = (parsed.nombre || '').trim()
  const droga = (parsed.droga || '').trim()
  const concentracion = (parsed.concentracion || '').trim()
  const fechaVencimiento = parsed.fecha_vencimiento || null
  const cantidadInicial =
    parsed.cantidad_inicial !== null &&
    parsed.cantidad_inicial !== undefined &&
    Number(parsed.cantidad_inicial) > 0
      ? Number(parsed.cantidad_inicial)
      : null

  const camposDetectados: string[] = Array.isArray(parsed.campos_detectados)
    ? parsed.campos_detectados
    : []

  const camposFaltantes: CampoFaltanteIA[] = Array.isArray(parsed.campos_faltantes)
    ? parsed.campos_faltantes
    : []

  // Ensure key missing fields are always flagged in campos_faltantes for the hybrid UI
  const ensureMissing = (campo: string, etiqueta: string, motivo: string) => {
    if (!camposFaltantes.some((f) => f.campo === campo)) {
      camposFaltantes.push({ campo, etiqueta, motivo })
    }
  }

  if (!nombre) {
    ensureMissing('nombre', 'Nombre Comercial', 'No se pudo leer el nombre en la imagen.')
  }
  if (!droga) {
    ensureMissing('droga', 'Droga / Principio Activo', 'No se identificó el principio activo en la imagen.')
  }
  if (!concentracion) {
    ensureMissing('concentracion', 'Concentración / Gramaje', 'No se visualizó el gramaje o concentración en la foto.')
  }
  if (!fechaVencimiento) {
    ensureMissing(
      'fecha_vencimiento',
      'Fecha de Vencimiento',
      'No se ve la fecha de vencimiento en las fotos (cargala manualmente o sumá una foto de la solapa).'
    )
  }
  if (cantidadInicial === null) {
    ensureMissing(
      'cantidad_inicial',
      'Contenido del Envase / Cantidad Disponible',
      'No se distingue la cantidad de unidades/ml en la foto; ingresá cuánto tenés disponible.'
    )
  } else {
    // Even if total box content was read, remind user to verify actual remaining stock if box is already opened
    ensureMissing(
      'cantidad_actual',
      'Cantidad Disponible Actual',
      `En la caja dice ${cantidadInicial}, verificá si está nueva o ajustá cuántas dosis quedan.`
    )
  }

  return {
    nombre,
    droga,
    concentracion,
    publico: ['adulto', 'pediatrico', 'ambos'].includes(parsed.publico)
      ? parsed.publico
      : 'adulto',
    categoria: CATEGORIAS_MEDICAMENTOS.includes(parsed.categoria)
      ? parsed.categoria
      : 'Otro',
    unidad: [
      'comprimidos',
      'ml',
      'gotas',
      'sobres',
      'ampollas',
      'g',
      'disparos',
      'unidades',
    ].includes(parsed.unidad)
      ? parsed.unidad
      : 'unidades',
    cantidad_inicial: cantidadInicial,
    fecha_vencimiento: fechaVencimiento,
    para_que_sirve: parsed.para_que_sirve || '',
    posologia_referencia: parsed.posologia_referencia || '',
    notas: parsed.notas || '',
    campos_detectados: camposDetectados,
    campos_faltantes: camposFaltantes,
    mensaje_hibrido:
      parsed.mensaje_hibrido ||
      'Completamos los datos visibles en las fotos. Revisá y completá manualmente los campos marcados en amarillo.',
  }
}

export async function analyzeMedicationPhoto(
  base64DataUrl: string
): Promise<ExtractedMedData> {
  return analyzeMedicationPhotos([base64DataUrl])
}

export async function consultBotiquinAI(params: {
  consulta: string
  pacienteTipo: 'auto' | 'adulto' | 'pediatrico'
  edadPesoDetalle?: string
  medicamentos: Medicamento[]
  historial?: { role: 'user' | 'assistant'; content: string }[]
}): Promise<ConsultaAIResponse> {
  const { consulta, pacienteTipo, edadPesoDetalle, medicamentos, historial = [] } = params

  const activos = medicamentos.filter((m) => m.estado === 'activo')

  const disponiblesVigentes = activos
    .filter((m) => m.cantidad_actual > 0 && !esMedicamentoVencido(m))
    .map((m) => ({
      id: m.id,
      nombre: m.nombre,
      droga: m.droga,
      concentracion: m.concentracion,
      publico: m.publico,
      categoria: m.categoria,
      cantidad_actual: m.cantidad_actual,
      unidad: m.unidad,
      fecha_vencimiento: m.fecha_vencimiento,
      dias_para_vencer: calcularDiasVencimiento(m.fecha_vencimiento),
      para_que_sirve: m.para_que_sirve,
      posologia_referencia: m.posologia_referencia,
      notas: m.notas,
    }))

  const noDisponiblesOVencidos = activos
    .filter((m) => m.cantidad_actual <= 0 || esMedicamentoVencido(m))
    .map((m) => ({
      id: m.id,
      nombre: m.nombre,
      droga: m.droga,
      publico: m.publico,
      motivo_no_disponible: esMedicamentoVencido(m)
        ? `VENCIDO el ${m.fecha_vencimiento}`
        : `SIN STOCK (0 ${m.unidad})`,
    }))

  const historialTexto =
    historial.length > 0
      ? historial
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.content}`)
          .join('\n')
      : 'Sin mensajes previos.'

  const prompt = `
Sos el Asistente Médico y Farmacéutico Inteligente del "Botiquín Virtual Familiar" (en español rioplatense/Argentina).
Tu objetivo es responder consultas del usuario sobre malestares o síntomas (ej: "me duele la espalda, de mi stock ¿qué puedo tomar?" o "el bebé no para de vomitar, ¿qué le doy?") basándote ESTRICTAMENTE primero en su STOCK ACTUAL y diferenciando rigurosamente entre medicamentos de ADULTOS y PEDIÁTRICOS.

DATOS DEL PACIENTE EN LA CONSULTA:
- Filtro de paciente seleccionado: ${
    pacienteTipo === 'pediatrico'
      ? 'Bebé / Niño (Pediátrico)'
      : pacienteTipo === 'adulto'
      ? 'Adulto'
      : 'Detectar automáticamente según la consulta'
  }
- Datos adicionales (edad/peso/contexto): ${edadPesoDetalle || 'No especificado'}

CONSULTA ACTUAL DEL USUARIO:
"${consulta}"

HISTORIAL RECIENTE DE CONVERSACIÓN:
${historialTexto}

=================================================================
STOCK DISPONIBLE Y VIGENTE EN EL BOTIQUÍN (No vencido y con stock > 0):
${JSON.stringify(disponiblesVigentes, null, 2)}

MEDICAMENTOS EN EL BOTIQUÍN QUE ESTÁN VENCIDOS O SIN STOCK (¡NO USAR, solo advertir si el usuario los tenía para este síntoma!):
${JSON.stringify(noDisponiblesOVencidos, null, 2)}
=================================================================

REGLAS CRÍTICAS DE RESPUESTA:
1. SEGURIDAD PEDIÁTRICA vs ADULTO:
   - NUNCA recomiendes un medicamento de uso exclusivo de adultos para un bebé o niño.
   - Si la consulta es por un bebé o niño (ej. "el bebé no para de vomitar", "el nene tiene fiebre"), solo considerá del stock los que tengan publico="pediatrico" o publico="ambos" y sean seguros para su edad. En vómitos de bebés, recordá que la hidratación fraccionada (Sales de Rehidratación Oral / lactancia) y la consulta pediátrica son prioritarias, y advertí precaución con antieméticos si no fueron indicados por su pediatra con dosis según peso.
2. EVALUACIÓN DEL STOCK:
   - Si en "STOCK DISPONIBLE Y VIGENTE" hay uno o más medicamentos que sirven para tratar el malestar consultado, incluilos en "recomendados_del_stock" con su "id" exacto, "dosis_sugerida" orientativa, y "cantidad_descontar_sugerida" (ej: 1 para 1 comprimido, 5 para 5 ml, etc.).
   - Si NO hay NADA disponible en el stock vigente para tratar ese malestar (o si lo que había está vencido o sin stock), poné "en_stock_utilizable": false, explicá claramente que actualmente NO tiene nada apto en su stock para ese cuadro, y completá obligatoriamente "sugerencias_compra" con opciones concretas para comprar en la farmacia.
   - Incluso si tiene algo parcial en stock (ej. tiene analgésico pero para vómitos le faltan Sales de Rehidratación Oral), podés sugerir el complemento en "sugerencias_compra".
3. ADVERTENCIAS DE VENCIDOS / SIN STOCK:
   - Si en "MEDICAMENTOS EN EL BOTIQUÍN QUE ESTÁN VENCIDOS O SIN STOCK" hay algún producto que hubiera servido para este síntoma, agregá una alerta clara en "advertencias_stock" diciendo por ejemplo: "Tenés [Nombre] cargado en el botiquín pero está VENCIDO / SIN STOCK. No lo utilices y reponelo."

Devolvé EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "respuesta_markdown": "Explicación clara, cálida y bien estructurada (usando negritas y viñetas) respondiendo directamente qué puede usar de su stock (indicando cuántas pastillas/ml le quedan y cuándo vence), o informando si no tiene nada en stock y qué debería comprar, más cuidados generales.",
  "en_stock_utilizable": true,
  "recomendados_del_stock": [
    {
      "id": "ID exacto del medicamento del stock vigente",
      "nombre": "Nombre del medicamento",
      "droga": "Droga y concentración",
      "cantidad_actual": 10,
      "unidad": "comprimidos",
      "dosis_sugerida": "Ej: 1 comprimido cada 8 hs luego de comer",
      "cantidad_descontar_sugerida": 1,
      "motivo": "Por qué sirve para este síntoma"
    }
  ],
  "advertencias_stock": [
    "Advertencia si tenía un medicamento relacionado pero está vencido o sin stock"
  ],
  "sugerencias_compra": [
    {
      "nombre_sugerido": "Ej: Sales de Rehidratación Oral / Ibuprofeno 400mg + Miorelajante",
      "droga": "Principio activo",
      "publico": "Adulto o Pediátrico",
      "motivo": "Por qué se sugiere comprarlo ante la falta de stock o para complementar",
      "presentacion_sugerida": "Ej: Sobres para reconstituir / Comprimidos"
    }
  ],
  "pautas_alarma": [
    "Signos de alarma ante los cuales acudir a guardia médica o consultar al pediatra de inmediato"
  ],
  "nivel_urgencia": "baja"
}
`

  const rawJson = await callGeminiAPI([{ text: prompt }], 0.25)
  const parsed = JSON.parse(cleanJsonString(rawJson))

  return {
    respuesta_markdown:
      parsed.respuesta_markdown ||
      'No pude procesar la respuesta en este momento. Por favor intentá nuevamente.',
    en_stock_utilizable: Boolean(parsed.en_stock_utilizable),
    recomendados_del_stock: Array.isArray(parsed.recomendados_del_stock)
      ? parsed.recomendados_del_stock
      : [],
    advertencias_stock: Array.isArray(parsed.advertencias_stock)
      ? parsed.advertencias_stock
      : [],
    sugerencias_compra: Array.isArray(parsed.sugerencias_compra)
      ? parsed.sugerencias_compra
      : [],
    pautas_alarma: Array.isArray(parsed.pautas_alarma) ? parsed.pautas_alarma : [],
    nivel_urgencia: ['baja', 'media', 'alta'].includes(parsed.nivel_urgencia)
      ? parsed.nivel_urgencia
      : 'baja',
  }
}
