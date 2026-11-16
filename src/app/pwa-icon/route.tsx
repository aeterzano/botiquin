import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const sizeParam = Number(req.nextUrl.searchParams.get('size'))
  const size = sizeParam === 512 ? 512 : 192
  const svgSize = Math.round(size * 0.58)
  const radius = Math.round(size * 0.22)
  const borderWidth = Math.max(4, Math.round(size * 0.03))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#171a22',
          borderRadius: `${radius}px`,
          border: `${borderWidth}px solid rgba(248, 113, 113, 0.55)`,
        }}
      >
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f87171"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  )
}
