'use client'

/**
 * CubeLoader — enterprise-grade 3D rotating cube loading screen.
 *
 * Usage:
 *   <CubeLoader />              — fixed full-screen overlay (auth gates, cold starts)
 *   <CubeLoader fullScreen={false} />  — inline block that fills its container
 */

import { Mic, Headphones, PenTool, BookOpen } from 'lucide-react'

// ── Cube geometry ──────────────────────────────────────────────────────────────

const CUBE_PX = 132
const HALF    = CUBE_PX / 2

const FACES = [
  { id: 'front', transform: `translateZ(${HALF}px)`,                icon: Mic,        color: '#9333ea' },
  { id: 'right', transform: `rotateY(90deg) translateZ(${HALF}px)`, icon: Headphones, color: '#4338ca' },
  { id: 'back',  transform: `rotateY(180deg) translateZ(${HALF}px)`,icon: PenTool,    color: '#ea580c' },
  { id: 'left',  transform: `rotateY(-90deg) translateZ(${HALF}px)`,icon: BookOpen,   color: '#0d9488' },
] as const

// ── Component ──────────────────────────────────────────────────────────────────

interface CubeLoaderProps {
  /**
   * true  → fixed full-screen overlay (default) — use for auth gates / cold starts
   * false → fills its container — use inside dashboard / card areas
   */
  fullScreen?: boolean
}

export function CubeLoader({ fullScreen = true }: CubeLoaderProps) {
  const outerStyle: React.CSSProperties = fullScreen
    ? {
        position:       'fixed',
        inset:          0,
        zIndex:         9999,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#f7f6f4',
      }
    : {
        display:        'flex',
        width:          '100%',
        alignItems:     'center',
        justifyContent: 'center',
        minHeight:      '60vh',
        background:     'transparent',
      }

  return (
    <>
      {/* ── Keyframe animations injected once per mount ─────────────────── */}
      <style>{`
        @keyframes clap-cube-spin {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
        @keyframes clap-dot-bounce {
          0%, 60%, 100% { transform: translateY(0);    opacity: 0.35; }
          30%           { transform: translateY(-7px); opacity: 1;    }
        }
      `}</style>

      <div style={outerStyle} aria-live="polite" aria-label="Loading workspace">
        <div
          style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            36,
            userSelect:     'none',
          }}
        >
          {/* ── 3-D Cube ──────────────────────────────────────────────────── */}
          <div style={{ position: 'relative' }}>

            {/* Perspective wrapper — keeps transforms context correct */}
            <div
              style={{
                width:             CUBE_PX,
                height:            CUBE_PX,
                perspective:       '520px',
                perspectiveOrigin: '50% 50%',
              }}
            >
              {/* Spinning inner — Y-axis only keeps top/bottom invisible */}
              <div
                style={{
                  width:          '100%',
                  height:         '100%',
                  position:       'relative',
                  transformStyle: 'preserve-3d',
                  animation:      'clap-cube-spin 5.5s linear infinite',
                }}
              >
                {FACES.map(({ id, transform, icon: Icon, color }) => (
                  <div
                    key={id}
                    style={{
                      position:        'absolute',
                      inset:           0,
                      transform,
                      background:      '#ffffff',
                      borderRadius:    16,
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      boxShadow: [
                        'inset 0 0 0 1px rgba(0,0,0,0.05)',
                        '0 2px 6px rgba(0,0,0,0.08)',
                        '0 10px 40px rgba(0,0,0,0.12)',
                      ].join(', '),
                    }}
                  >
                    <Icon
                      size={46}
                      color={color}
                      strokeWidth={1.6}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Ambient floor shadow — grounds the cube in 3-D space */}
            <div
              style={{
                position:        'absolute',
                bottom:          -20,
                left:            '50%',
                transform:       'translateX(-50%)',
                width:           108,
                height:          16,
                borderRadius:    '50%',
                background:      'radial-gradient(ellipse at center, rgba(0,0,0,0.20) 0%, transparent 70%)',
                filter:          'blur(6px)',
              }}
            />
          </div>

          {/* ── Status typography ─────────────────────────────────────────── */}
          <div
            style={{
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              gap:            10,
              marginTop:      8,
            }}
          >
            {/* Primary heading */}
            <p
              style={{
                margin:        0,
                fontSize:      21,
                fontWeight:    700,
                letterSpacing: '-0.025em',
                color:         '#0f172a',
                fontFamily:    'inherit',
              }}
            >
              Workspace Initializing
            </p>

            {/* Sub-label + bouncing dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  fontSize:      11,
                  fontWeight:    600,
                  letterSpacing: '0.20em',
                  textTransform: 'uppercase',
                  color:         '#94a3b8',
                  fontFamily:    'inherit',
                }}
              >
                Loading Tools
              </span>

              {/* Three sequentially bouncing dots */}
              {([0, 1, 2] as const).map((i) => (
                <span
                  key={i}
                  style={{
                    display:      'inline-block',
                    width:        4,
                    height:       4,
                    borderRadius: '50%',
                    background:   '#cbd5e1',
                    animation:    `clap-dot-bounce 1.6s ease-in-out ${i * 0.28}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
