import { NextRequest, NextResponse } from 'next/server'
import { analyzeMedicationPhotos } from '@/utils/ai-botiquin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const images: string[] = Array.isArray(body.imagesBase64)
      ? body.imagesBase64.filter(Boolean)
      : body.imageBase64
      ? [body.imageBase64]
      : []

    if (images.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No se recibió ninguna imagen para analizar.' },
        { status: 400 }
      )
    }

    const extracted = await analyzeMedicationPhotos(images)
    return NextResponse.json({
      ok: true,
      data: extracted,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error analizando las fotos con IA'
    console.error('Error in /api/ai/analyze-photo:', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
