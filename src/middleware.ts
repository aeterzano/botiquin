import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ALLOWED_EMAILS = ['aeterzano@gmail.com', 'villanuevamarisol27@gmail.com']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Archivos estáticos y recursos públicos que nunca deben bloquearse
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.startsWith('/pwa-icon') ||
    pathname.startsWith('/manifest') ||
    pathname === '/favicon.ico' ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|css|js)$/)
  ) {
    return NextResponse.next()
  }

  // 2. Restricción de Dominio: Exclusivamente *.terza.ar (o localhost para desarrollo local)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const isAllowedHost =
    host.includes('terza.ar') ||
    host.includes('localhost') ||
    host.includes('127.0.0.1')

  if (!isAllowedHost) {
    return new NextResponse(
      'Acceso denegado: Esta aplicación funciona exclusivamente en el dominio de terza.ar.',
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }

  // 3. Geobloqueo: Solo accesible desde IPs de Argentina (AR)
  const cfCountry = request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country')
  const geoCookie = request.cookies.get('user_country')

  if (geoCookie?.value && geoCookie.value !== 'AR') {
    return new NextResponse(
      'Acceso denegado: Esta aplicación solo está disponible para accesos desde Argentina.',
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }

  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    if (cfCountry !== 'AR') {
      return new NextResponse(
        'Acceso denegado: Esta aplicación solo está disponible para accesos desde Argentina.',
        { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }
  }

  // Fallback si no viene encabezado Cloudflare (ej. conexiones directas)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.ip

  const isLocalIp =
    !ip ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')

  if (!cfCountry && !geoCookie && !isLocalIp) {
    try {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`)
      const data = await res.json()
      if (data?.countryCode && data.countryCode !== 'AR') {
        return new NextResponse(
          'Acceso denegado: Esta aplicación solo está disponible para accesos desde Argentina.',
          { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
      }
    } catch {
      // Si la API externa no responde, no bloquear arbitrariamente
    }
  }

  // 4. Preparar respuesta base y cookie de país
  let baseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  if (cfCountry === 'AR') {
    baseResponse.cookies.set('user_country', 'AR', { maxAge: 86400, path: '/' })
  }

  // 5. Rutas públicas de autenticación
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')
  ) {
    return baseResponse
  }

  // 6. Cron jobs protegidos por Bearer Token CRON_SECRET
  if (pathname.startsWith('/api/cron/')) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return baseResponse
  }

  // 7. Verificación de Autenticación con Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          baseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            baseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userEmail = user?.email?.toLowerCase()

  if (!user || !userEmail || !ALLOWED_EMAILS.includes(userEmail)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'No autorizado. Debe iniciar sesión con una cuenta habilitada.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return baseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
