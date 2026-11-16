import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Botiquín Virtual Familiar',
    short_name: 'Botiquín',
    description:
      'Control de stock de medicamentos familiares, vencimientos, esenciales, alertas y Dr. Botiquín IA.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b0c10',
    theme_color: '#1e222d',
    categories: ['medical', 'health', 'lifestyle'],
    icons: [
      {
        src: '/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
