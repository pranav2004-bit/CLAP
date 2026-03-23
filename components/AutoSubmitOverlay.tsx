'use client'

import { AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react'

// ── AutoSubmitOverlay ─────────────────────────────────────────────────────────
// Full-screen, non-dismissible overlay shown when a student's test is auto-submitted.
// Renders at z-[200] (above all modals) and makes underlying content completely
// inert via the HTML `inert` attribute on the caller's content wrapper.
//
// Props:
//   active     — whether the overlay is visible
//   reason     — WHY the test was auto-submitted (drives icon + title)
//   status     — backend call status ('saving' → 'done' | 'error')
//   countdown  — redirect countdown value (starts at 10, decrements to 0)
//
// The caller drives the countdown with a useEffect (see [type]/page.tsx and
// [assignment_id]/page.tsx). This component is purely presentational.
// ─────────────────────────────────────────────────────────────────────────────

export type AutoSubmitReason = 'timer' | 'tab_switch' | 'fullscreen' | 'malpractice'
export type AutoSubmitStatus = 'saving' | 'done' | 'error'

export interface AutoSubmitOverlayProps {
  active: boolean
  reason: AutoSubmitReason
  status: AutoSubmitStatus
  countdown: number
}

const TITLES: Record<AutoSubmitReason, string> = {
  timer:      "Time's Up",
  tab_switch: 'Tab Switch Limit Reached',
  fullscreen: 'Fullscreen Limit Reached',
  malpractice:'Assessment Auto-Submitted',
}

const SUBTITLES: Record<AutoSubmitReason, string> = {
  timer:      'Your test time has expired.',
  tab_switch: 'You reached the tab-switching limit (2/2).',
  fullscreen: 'You reached the fullscreen-exit limit (3/3).',
  malpractice:'A malpractice event triggered automatic submission.',
}

export function AutoSubmitOverlay({ active, reason, status, countdown }: AutoSubmitOverlayProps) {
  if (!active) return null

  // SVG ring geometry: r=40, circumference ≈ 251.3 px
  const R = 40
  const C = 2 * Math.PI * R
  // offset goes from C (empty) → 0 (full circle) as countdown goes 10 → 0
  const offset = C * (countdown / 10)
  const ringColor =
    countdown > 6 ? '#6366f1' :   // indigo-500 — plenty of time
    countdown > 3 ? '#f97316' :   // orange-500 — hurrying
                   '#ef4444'      // red-500    — last seconds

  const statusColorClass =
    status === 'saving' ? 'text-indigo-600' :
    status === 'done'   ? 'text-green-600'  : 'text-orange-600'

  const statusMessage =
    status === 'saving' ? 'Saving your work…' :
    status === 'done'   ? 'Submitted. Evaluation started.' :
                          'Your answers are saved and will be processed automatically.'

  return (
    /* Outer backdrop — full viewport, highest z-index, pointer events ON
       (covers everything underneath). The caller applies `inert` + pointer-events-none
       to the content wrapper so nothing below is reachable. */
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assessment submitted"
      aria-live="polite"
    >
      {/* Card — responsive padding, max-width keeps it readable on all screens */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 text-center max-w-sm w-full shadow-2xl">

        {/* Icon — reason-specific */}
        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
          {reason === 'timer'      && <Clock       className="w-8 h-8 text-indigo-600" />}
          {reason === 'tab_switch' && <AlertTriangle className="w-8 h-8 text-red-500"  />}
          {reason === 'fullscreen' && <ShieldAlert  className="w-8 h-8 text-orange-500" />}
          {reason === 'malpractice'&& <AlertTriangle className="w-8 h-8 text-red-500"  />}
        </div>

        {/* Title + subtitle */}
        <h2 className="text-xl font-bold text-gray-900 mb-1">{TITLES[reason]}</h2>
        <p className="text-xs text-gray-500 mb-4">{SUBTITLES[reason]}</p>

        {/* Backend status indicator */}
        <p className={`text-sm mb-6 font-medium transition-colors duration-300 flex items-center justify-center gap-1.5 ${statusColorClass}`}>
          {status === 'done' && (
            <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          {status === 'saving' && (
            <span
              className="inline-block w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{statusMessage}</span>
        </p>

        {/* SVG Countdown Ring
            The ring arc starts empty (offset = C) and fills as countdown decreases.
            Transition: stroke-dashoffset 0.9s linear gives a smooth per-second animation.
            The SVG is rotated -90° so the arc starts at 12 o'clock. */}
        <div
          className="relative flex items-center justify-center mx-auto mb-5"
          style={{ width: 96, height: 96 }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 96 96"
            className="absolute inset-0 w-full h-full -rotate-90"
          >
            {/* Track (gray) */}
            <circle
              cx="48" cy="48" r={R}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            {/* Progress arc — color-coded by time remaining */}
            <circle
              cx="48" cy="48" r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              stroke={ringColor}
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
            />
          </svg>
          {/* Countdown number centred over the ring */}
          <span
            className="text-3xl font-bold font-mono tabular-nums relative z-10"
            style={{ color: ringColor }}
          >
            {countdown}
          </span>
        </div>

        {/* Footer lines */}
        <p className="text-xs text-gray-400">
          Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}…
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Your evaluation will continue automatically.
        </p>
      </div>
    </div>
  )
}
