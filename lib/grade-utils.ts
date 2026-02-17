export interface GradeInfo {
  grade: string
  label: string
  color: string
  bgColor: string
}

const GRADE_MAP: Record<string, GradeInfo> = {
  'O':  { grade: 'O',  label: 'Outstanding', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  'A+': { grade: 'A+', label: 'Excellent',   color: 'text-blue-700',    bgColor: 'bg-blue-100' },
  'A':  { grade: 'A',  label: 'Very Good',   color: 'text-indigo-700',  bgColor: 'bg-indigo-100' },
  'B+': { grade: 'B+', label: 'Good',        color: 'text-yellow-700',  bgColor: 'bg-yellow-100' },
  'B':  { grade: 'B',  label: 'Average',     color: 'text-orange-700',  bgColor: 'bg-orange-100' },
}

export function getGradeInfo(grade: string | null): GradeInfo | null {
  if (!grade) return null
  return GRADE_MAP[grade] || null
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '-'
  if (minutes < 1) return '< 1 min'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
