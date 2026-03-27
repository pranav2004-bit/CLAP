'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ActionButton } from '@/components/ui/action-button'
import {
  Users,
  Zap,
  Shield,
  BarChart3,
  Clock,
  ArrowRight,
  CheckCircle,
  Code2,
  GraduationCap,
  ClipboardCheck,
  Building2,
  Menu,
  X,
} from 'lucide-react'

// ── Features ───────────────────────────────────────────────────────────────

const features = [
  {
    icon: Zap,
    title: 'AI-Powered Scoring',
    description: 'Advanced LLM technology evaluates speaking and writing with human-like accuracy',
  },
  {
    icon: Clock,
    title: 'Flexible Timing',
    description: 'Complete tests at your own pace with automatic time management',
  },
  {
    icon: Shield,
    title: 'Secure Testing',
    description: 'Anti-cheating measures including tab-switch detection and session monitoring',
  },
  {
    icon: BarChart3,
    title: 'Detailed Score Card',
    description: 'Comprehensive score card delivered automatically via email',
  },
]

// ── Team data ──────────────────────────────────────────────────────────────

interface ProfileMember {
  id:           string
  name:         string        // empty string = placeholder/coming-soon
  initials:     string
  role:         string
  photo?:       string        // /images/<filename>.jpg — optional until uploaded
  title?:       string
  department?:  string
  institution?: string
}

/** Row 1 — apex */
const row1: ProfileMember[] = [
  {
    id:          'r1-1',
    name:        'Dr. V. Rajya Lakshmi',
    initials:    'VR',
    photo:       '/images/profile_r1_1.jpg',
    role:        'Principal',
    department:  'ANIL NEERUKONDA INSTITUTE OF TECHNOLOGY & SCIENCES (Autonomous)',
  },
]

/** Row 2 — Academic Leadership */
const row2: ProfileMember[] = [
  {
    id:          'r2-1',
    name:        'Prof. Poosapati. Padmaja',
    initials:    'PP',
    photo:       '/images/profile_r2_1.jpg',
    role:        'Dean - Training',
  },
  {
    id:          'r2-2',
    name:        'Prof. Adinarayana Salina',
    initials:    'AS',
    photo:       '/images/profile_r2_2.jpg',
    role:        'HOD - CSE (Data Science)',
  },
]

/** Row 3 — Assessment Panel */
const row3: ProfileMember[] = [
  {
    id:          'r3-1',
    name:        'Mr. Yogesh Bavana',
    initials:    'YB',
    photo:       '/images/profile_r3_1.jpg',
    role:        'Chief Coordinator - CLAP',
    title:       'Asst. Professor',
    department:  'Department of Training',
  },
  {
    id:          'r3-2',
    name:        'Mr. N. Sampath Kumar',
    initials:    'SK',
    photo:       '/images/profile_r3_2.jpg',
    role:        'Content Development',
    title:       'Asst. Professor',
    department:  'Department of Training',
  },
  {
    id:          'r3-3',
    name:        'Mr. Ch. Durga Mahesh',
    initials:    'DM',
    photo:       '/images/profile_r3_3.jpg',
    role:        'Evaluation & Reporting',
    title:       'Asst. Professor',
    department:  'Department of Training',
  },
  {
    id:          'r3-4',
    name:        'Mr. M.V. Kishore',
    initials:    'MK',
    photo:       '/images/profile_r3_4.jpg',
    role:        'Technical Support',
    title:       'Asst. Professor',
    department:  'Department of IT',
  },
]

// Row 4 — Tech / Build Team (existing, with photos)
const techTeam = [
  {
    id: 1,
    name: 'Pranavnath Kosuru',
    batch: '2023–2027',
    department: 'CSE (Data Science)',
    founder: 'SANJIVO',
    photo: '/images/tech_team_4.jpg',
  },
  {
    id: 2,
    name: 'Managala Gyana Saisri Abhinay',
    batch: '2023–2027',
    department: 'CSE (Data Science)',
    founder: 'AURATECH-VISION',
    photo: '/images/tech_team_3.jpg',
  },
  {
    id: 3,
    name: 'Padala Lohit Reddy',
    batch: '2023–2027',
    department: 'CSE (Data Science)',
    founder: 'SANJIVO',
    founderRole: 'PR',
    photo: '/images/tech_team_1.jpg',
  },
  {
    id: 4,
    name: 'Thumu Anoop',
    batch: '2023–2027',
    department: 'CSE (Data Science)',
    founder: 'SANJIVO',
    founderRole: 'CTO',
    photo: '/images/tech_team_2.jpg',
  },
]

// ── Accent palette (one per pyramid row) ───────────────────────────────────
const ROW_ACCENTS: Record<number, { bar: string; chip: string; text: string }> = {
  1: { bar: 'bg-primary',    chip: 'bg-primary/10', text: 'text-primary'   },
  2: { bar: 'bg-primary',    chip: 'bg-primary/10', text: 'text-primary'   },
  3: { bar: 'bg-primary',    chip: 'bg-primary/10', text: 'text-primary'   },
}

/** Deterministic avatar gradient for tech-team fallback */
const techAvatarGradients = [
  'from-blue-500    to-indigo-600',
  'from-violet-500  to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500  to-rose-600',
]

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

// ── Sub-components ─────────────────────────────────────────────────────────

/**
 * Profile card — rows 1–3.
 * Circular monogram avatar (mirrors tech-team photo circles).
 * Details rendered as clean plain text — no badge pills around role/title/dept.
 */
function ProfileCard({ member, rowIndex }: { member: ProfileMember; rowIndex: number }) {
  const accent = ROW_ACCENTS[rowIndex] ?? ROW_ACCENTS[3]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 p-6 flex flex-col items-center text-center">

      {/* Photo or monogram — w-32 h-32 matches tech-team circles exactly */}
      {member.photo ? (
        <div className="w-32 h-32 rounded-full overflow-hidden mx-auto mb-5 ring-2 ring-border relative">
          <Image
            src={member.photo}
            alt={member.name}
            fill
            sizes="128px"
            className="object-cover object-center"
          />
        </div>
      ) : (
        <div className={`w-32 h-32 rounded-full ${accent.chip} flex items-center justify-center mx-auto mb-5 ring-2 ring-border`}>
          <span className={`text-2xl font-bold ${accent.text} select-none tracking-wide`}>
            {member.initials}
          </span>
        </div>
      )}

      {/* Name */}
      <h3 className="font-semibold text-gray-900 text-base leading-snug mb-1">
        {member.name}
      </h3>

      {/* Role — single accent-coloured line, no pill wrapper */}
      <p className={`${rowIndex === 1 ? 'text-sm' : 'text-xs'} font-semibold ${accent.text} mb-3 leading-snug`}>
        {member.role}
      </p>

      {/* Academic details — plain stacked text, clearly readable */}
      <div className="space-y-0.5">
        {member.title && (
          <p className="text-xs text-gray-600 font-medium leading-snug">{member.title}</p>
        )}
        {member.department && (
          <p className="text-xs text-gray-600 leading-snug">{member.department}</p>
        )}
        {member.institution && (
          <p className="text-xs text-gray-500 leading-snug">{member.institution}</p>
        )}
      </div>
    </div>
  )
}

/** Placeholder card — mirrors ProfileCard proportions */
function PlaceholderCard() {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm p-6 flex flex-col items-center text-center">
      <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5 ring-2 ring-border">
        <Users className="w-10 h-10 text-gray-300" />
      </div>
      <div className="space-y-2 mb-1">
        <div className="h-3 bg-gray-100 rounded-md w-28 mx-auto" />
        <div className="h-2.5 bg-gray-100 rounded-md w-20 mx-auto" />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 mt-3 select-none">
        Coming Soon
      </p>
    </div>
  )
}

interface PyramidRowProps {
  label?:   string
  members:  ProfileMember[]
  rowIndex: number
  maxCols:  number
}

/** One centred horizontal row of profile cards */
function PyramidRow({ label, members, rowIndex, maxCols }: PyramidRowProps) {
  const gridClass =
    maxCols === 1 ? 'grid-cols-1' :
    maxCols === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    maxCols === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                   'grid-cols-2 lg:grid-cols-4'

  const maxWClass =
    maxCols === 1 ? 'max-w-xs' :
    maxCols === 2 ? 'max-w-xl' :
    maxCols === 3 ? 'max-w-3xl' :
                   'max-w-5xl'

  return (
    <div className="w-full">
      {label && (
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-5">
          {label}
        </p>
      )}
      <div className={`grid ${gridClass} gap-4 sm:gap-5 mx-auto ${maxWClass}`}>
        {members.map(member =>
          member.name ? (
            <ProfileCard key={member.id} member={member} rowIndex={rowIndex} />
          ) : (
            <PlaceholderCard key={member.id} />
          )
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Co-brand: Institution + Product */}
            <ActionButton href="/" variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
              <div className="flex items-center gap-2 sm:gap-3">
                <Image src="/images/anits-logo.png" alt="ANITS" width={44} height={44} className="h-9 sm:h-11 w-auto object-contain flex-shrink-0" />
                <div className="w-px h-7 sm:h-8 bg-border" />
                <Image src="/images/clap-logo.png?v=new" alt="CLAP" width={100} height={40} className="h-8 sm:h-10 w-auto object-contain" priority />
              </div>
            </ActionButton>

            {/* Nav links — desktop */}
            <div className="hidden md:flex items-center gap-8">
              <ActionButton href="/#features" variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors h-auto p-0">Features</ActionButton>
              <ActionButton href="/#tests" variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors h-auto p-0">Tests</ActionButton>
              <span className="text-sm font-medium text-foreground">About</span>
            </div>

            <div className="flex items-center gap-2">
              <ActionButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign In</ActionButton>
              <ActionButton href="/login" size="sm">Get Started</ActionButton>
              <button
                className="md:hidden p-2 rounded-md hover:bg-secondary transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-white">
            <div className="container mx-auto px-4 py-2 flex flex-col gap-1">
              <ActionButton href="/#features" variant="ghost" size="sm" className="justify-start text-sm font-medium text-muted-foreground py-2.5 px-3 h-auto hover:bg-secondary">Features</ActionButton>
              <ActionButton href="/#tests" variant="ghost" size="sm" className="justify-start text-sm font-medium text-muted-foreground py-2.5 px-3 h-auto hover:bg-secondary">Tests</ActionButton>
              <span className="text-sm font-medium text-foreground py-2.5 px-3">About</span>
              <div className="pt-2 pb-1 border-t border-border mt-1">
                <ActionButton href="/login" variant="ghost" size="sm" className="w-full justify-center">Sign In</ActionButton>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-8 sm:pb-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block mb-4 sm:mb-5 px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-primary/15 text-primary text-xs sm:text-sm font-semibold border border-primary/25">About CLAP</span>
            <h1 className="text-2xl sm:text-3xl lg:text-display-sm mb-3 sm:mb-4 font-bold tracking-tight text-balance">
              Empowering Language Learners with{' '}
              <span className="text-primary">AI Technology</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-0 max-w-2xl mx-auto leading-relaxed px-2 sm:px-0">
              Structured English language assessment across 5 core skills – evaluated instantly with AI precision.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
            {/* Grey header with left accent — inset with white frame */}
            <div className="p-2 sm:p-3">
              <div className="bg-secondary/40 px-4 sm:px-8 py-4 sm:py-5 rounded-xl relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />
                <h2 className="text-xl sm:text-2xl lg:text-display-sm text-center font-bold tracking-tight">Our Mission</h2>
              </div>
            </div>
            {/* White body */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4">
              <p className="text-base text-muted-foreground leading-relaxed">
                We believe every language learner deserves access to high-quality, affordable assessment
                that provides meaningful feedback for improvement.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed">
                Traditional language testing is expensive, time-consuming, and often inaccessible.
                CLAP changes this by leveraging AI to deliver instant, accurate evaluations at scale.
              </p>
              {/* Grey checklist */}
              <div className="bg-secondary/40 rounded-xl p-5 border border-border">
                <ul className="space-y-3">
                  {[
                    'Democratize access to quality language assessment',
                    'Provide immediate, actionable feedback',
                    'Support continuous learning and improvement',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-foreground font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <h2 className="text-2xl sm:text-3xl lg:text-display-sm mb-3 sm:mb-4 font-bold tracking-tight">What Makes CLAP Different</h2>
            <p className="text-sm sm:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto px-2 sm:px-0">
              Our unique approach combines advanced technology with educational expertise
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {features.map(feature => (
              <Card key={feature.title} className="card-hover border-0 bg-card">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our People — pyramid rows 1, 2, 3 ─────────────────────────────── */}
      <section className="pt-12 pb-10 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-8 sm:mb-10">
            <Badge variant="outline" className="mb-3 sm:mb-4">Our People</Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-display-sm mb-3 sm:mb-4 font-bold tracking-tight">The Team Behind CLAP</h2>
            <p className="text-sm sm:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto px-2 sm:px-0">
              A multidisciplinary group of educators, assessors and engineers
              committed to excellence in language assessment
            </p>
          </div>

          <div className="flex flex-col items-center gap-10 sm:gap-12">

            {/* Row 1 — Head of Institution */}
            <div className="w-full flex flex-col items-center gap-5">
              <Badge variant="outline" className="mb-1">
                <Building2 className="w-3.5 h-3.5 mr-1.5 inline-block -translate-y-px" />
                Head of Institution
              </Badge>
              <PyramidRow members={row1} rowIndex={1} maxCols={1} />
            </div>

            {/* Connector */}
            <div className="w-px h-5 bg-gray-200 -my-3" aria-hidden="true" />

            {/* Row 2 — Academic Leadership */}
            <div className="w-full flex flex-col items-center gap-5">
              <Badge variant="outline" className="mb-1">
                <GraduationCap className="w-3.5 h-3.5 mr-1.5 inline-block -translate-y-px" />
                Academic Leadership
              </Badge>
              <PyramidRow members={row2} rowIndex={2} maxCols={2} />
            </div>

            {/* Connector */}
            <div className="w-px h-5 bg-gray-200 -my-3" aria-hidden="true" />

            {/* Row 3 — Assessment Panel */}
            <div className="w-full flex flex-col items-center gap-5">
              <Badge variant="outline" className="mb-1">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5 inline-block -translate-y-px" />
                Assessment Panel
              </Badge>
              <PyramidRow members={row3} rowIndex={3} maxCols={4} />
            </div>

          </div>
        </div>
      </section>

      {/* ── Row 4 — Build Team (tech team with photos) ─────────────────────── */}
      <section className="pt-6 pb-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-4">
              <Code2 className="w-3.5 h-3.5 mr-1.5 inline-block -translate-y-px" />
              Development Team
            </Badge>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {techTeam.map((member, index) => (
              <Card key={member.id} className="text-center group hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-2">
                  <div className="mx-auto mb-3 relative">
                    {member.photo ? (
                      <div className="w-28 h-28 rounded-full overflow-hidden mx-auto ring-2 ring-primary/30 relative">
                        <Image src={member.photo} alt={member.name} fill sizes="112px" className="object-cover object-center" />
                      </div>
                    ) : (
                      <div className={`w-28 h-28 rounded-full bg-gradient-to-br ${techAvatarGradients[index % techAvatarGradients.length]} mx-auto flex items-center justify-center ring-2 ring-primary/30`}>
                        <span className="text-xl font-bold text-white select-none">{getInitials(member.name)}</span>
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-sm font-semibold leading-tight">{member.name}</CardTitle>
                  {member.founder && (
                    <div className="mt-2">
                      <span className="inline-block px-2.5 py-1 text-[10px] font-semibold rounded-md bg-primary/10 text-primary border border-primary/20">
                        {member.founderRole ?? (member.founder === 'SANJIVO' ? 'Co-Founder' : 'Founder')} / {member.founder}
                      </span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <p className="text-xs font-medium text-gray-600">{member.batch}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{member.department}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-display-sm mb-4 sm:mb-6 font-bold tracking-tight text-balance">Ready to Transform Your Learning?</h2>
            <p className="text-sm sm:text-base lg:text-lg text-muted-foreground mb-8 sm:mb-10 px-2 sm:px-0">
              Join thousands of learners who trust CLAP for accurate, affordable language assessment
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 max-w-sm sm:max-w-none mx-auto">
              <ActionButton href="/login" variant="hero" size="xl" className="group">
                <Users className="mr-2 w-5 h-5" />
                Start Assessment
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </ActionButton>
              <ActionButton href="/#tests" variant="outline" size="xl" className="border-2 border-border bg-white shadow-sm font-semibold">
                Learn More
              </ActionButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs sm:text-sm font-bold tracking-wide text-foreground uppercase leading-snug">Anil Neerukonda Institute of Technology &amp; Sciences (Autonomous)</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Continuing Language Assessment Program</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">© 2026 CLAP. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
