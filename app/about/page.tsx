'use client'

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
    title: 'Detailed Reports',
    description: 'Comprehensive score breakdowns delivered automatically via email',
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
    department:  'ANIL NEERUKONDA INSTITUTE OF TECHNOLOGY & SCIENCES',
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
  1: { bar: 'bg-violet-500', chip: 'bg-violet-50', text: 'text-violet-700' },
  2: { bar: 'bg-blue-500',   chip: 'bg-blue-50',   text: 'text-blue-700'   },
  3: { bar: 'bg-indigo-500', chip: 'bg-indigo-50', text: 'text-indigo-700' },
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
      <p className={`text-xs font-semibold ${accent.text} mb-3 leading-snug`}>
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
  return (
    <div className="min-h-screen bg-background">

      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <ActionButton href="/" variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={128} height={52} className="w-auto h-12 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
              </ActionButton>
              <div className="hidden md:flex items-center gap-8">
                <ActionButton href="/#features" variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors h-auto p-0">Features</ActionButton>
                <ActionButton href="/#tests"    variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors h-auto p-0">Tests</ActionButton>
                <span className="text-sm font-medium text-foreground">About</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ActionButton href="/login" variant="ghost" size="sm">Sign In</ActionButton>
              <ActionButton href="/login" size="sm">Get Started</ActionButton>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5">About CLAP</Badge>
            <h1 className="text-display-lg md:text-display-xl mb-6">
              Empowering Language Learners with{' '}
              <span className="gradient-text">AI Technology</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
              CLAP (Continuing Language Assessment Program) is revolutionizing English language assessment
              through cutting-edge artificial intelligence, making quality evaluation accessible to learners worldwide.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-display-sm mb-6 text-center">Our Mission</h2>
            <div className="max-w-3xl mx-auto space-y-6">
              <p className="text-lg text-muted-foreground">
                We believe every language learner deserves access to high-quality, affordable assessment
                that provides meaningful feedback for improvement.
              </p>
              <p className="text-muted-foreground">
                Traditional language testing is expensive, time-consuming, and often inaccessible.
                CLAP changes this by leveraging AI to deliver instant, accurate evaluations at scale.
              </p>
              <div className="bg-card rounded-2xl p-6 border border-border mt-8">
                <ul className="space-y-4">
                  {[
                    'Democratize access to quality language assessment',
                    'Provide immediate, actionable feedback',
                    'Support continuous learning and improvement',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-display-sm mb-4">What Makes CLAP Different</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our unique approach combines advanced technology with educational expertise
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <section className="pt-24 pb-14 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Our People</Badge>
            <h2 className="text-display-sm mb-4">The Team Behind CLAP</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
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
      <section className="pt-10 pb-24">
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
                <CardHeader className="pb-3">
                  <div className="mx-auto mb-4 relative">
                    {member.photo ? (
                      <div className="w-32 h-32 rounded-full overflow-hidden mx-auto ring-2 ring-border relative">
                        <Image
                          src={member.photo}
                          alt={member.name}
                          fill
                          className="object-cover object-center"
                        />
                      </div>
                    ) : (
                      <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${techAvatarGradients[index % techAvatarGradients.length]} mx-auto flex items-center justify-center ring-2 ring-border`}>
                        <span className="text-xl font-bold text-white select-none">
                          {getInitials(member.name)}
                        </span>
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-base leading-snug">{member.name}</CardTitle>
                  {member.founder && (
                    <div className="mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                        {member.founderRole ?? (member.founder === 'SANJIVO' ? 'Co-Founder' : 'Founder')} / {member.founder}
                      </Badge>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs font-medium text-gray-600">{member.batch}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{member.department}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-display-sm mb-6">Ready to Transform Your Learning?</h2>
            <p className="text-lg text-muted-foreground mb-10">
              Join thousands of learners who trust CLAP for accurate, affordable language assessment
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <ActionButton href="/login" variant="hero" size="xl" className="group">
                <Users className="mr-2 w-5 h-5" />
                Start Assessment
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </ActionButton>
              <ActionButton href="/#tests" variant="outline" size="xl">
                Learn More
              </ActionButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/images/clap-logo.png" alt="CLAP Logo" width={32} height={32} className="rounded-lg" style={{ width: 'auto', height: 'auto' }} />
              <span className="font-semibold">CLAP</span>
              <span className="text-sm text-muted-foreground ml-2">A SANJIVO Product</span>
            </div>
            <p className="text-sm text-muted-foreground">© 2026 CLAP. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
