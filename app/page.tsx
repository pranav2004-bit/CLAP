'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ActionButton } from '@/components/ui/action-button'
import {
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  CheckCircle2,
  Clock,
  Shield,
  BarChart3,
  Users,
  ArrowRight,
  Sparkles,
  Target,
  Zap,
  Menu,
  X
} from 'lucide-react'

const testTypes = [
  {
    name: 'Listening',
    icon: Headphones,
    color: 'listening',
    description: '1 audio clip with MCQ questions',
    marks: 10
  },
  {
    name: 'Speaking',
    icon: Mic,
    color: 'speaking',
    description: 'Voice recording with AI evaluation',
    marks: 10
  },
  {
    name: 'Reading',
    icon: BookOpen,
    color: 'reading',
    description: '1 passage with comprehension MCQs',
    marks: 10
  },
  {
    name: 'Writing',
    icon: PenTool,
    color: 'writing',
    description: 'Essay writing with AI scoring',
    marks: 10
  },
  {
    name: 'Verbal Ability',
    icon: Brain,
    color: 'vocabulary',
    description: '10 MCQs on language skills',
    marks: 10
  }
]

const features = [
  {
    icon: Zap,
    title: 'AI-Powered Scoring',
    description: 'Advanced LLM technology evaluates speaking and writing with human-like accuracy'
  },
  {
    icon: Clock,
    title: 'Time-Bounded Tests',
    description: 'Strict time limits ensure fair assessment with automatic submission'
  },
  {
    icon: Shield,
    title: 'Secure Testing',
    description: 'Anti-cheating measures including tab-switch detection and session monitoring'
  },
  {
    icon: BarChart3,
    title: 'Detailed Score Card',
    description: 'Comprehensive score breakdowns delivered automatically via email'
  }
]

export default function LandingPage() {
  const [hoveredTest, setHoveredTest] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Co-brand: Institution + Product */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Image src="/images/anits-logo.png" alt="ANITS" width={44} height={44} className="h-9 sm:h-11 w-auto object-contain flex-shrink-0" />
              <div className="w-px h-7 sm:h-8 bg-border" />
              <Image src="/images/clap-logo.png?v=new" alt="CLAP" width={100} height={40} className="h-8 sm:h-10 w-auto object-contain" />
            </div>

            {/* Nav links — desktop */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#tests" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Tests</a>
              <ActionButton href="/about" variant="ghost" size="sm" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors h-auto p-0">About</ActionButton>
            </div>

            <div className="flex items-center gap-2">
              <ActionButton href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign In</ActionButton>
              <ActionButton href="/login" size="sm">Get Started</ActionButton>
              {/* Hamburger — mobile only */}
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
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-foreground py-2.5 px-3 rounded-lg hover:bg-secondary transition-colors">Features</a>
              <a href="#tests" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-foreground py-2.5 px-3 rounded-lg hover:bg-secondary transition-colors">Tests</a>
              <ActionButton href="/about" variant="ghost" size="sm" className="justify-start text-sm font-medium text-muted-foreground py-2.5 px-3 h-auto hover:bg-secondary">About</ActionButton>
              <div className="pt-2 pb-1 border-t border-border mt-1">
                <ActionButton href="/login" variant="ghost" size="sm" className="w-full justify-center">Sign In</ActionButton>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative flex items-center min-h-[calc(100svh-3rem)] overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-background" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10">
          <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
            {/* Institutional identity */}
            <div className="mb-5 sm:mb-8 text-center space-y-1.5 px-2">
              {/* Institution — dominant over program */}
              <p className="text-[11px] sm:text-base lg:text-xl font-black tracking-[0.08em] sm:tracking-[0.12em] uppercase text-gray-900 leading-snug lg:whitespace-nowrap">
                Anil Neerukonda Institute of Technology &amp; Sciences (Autonomous)
              </p>
              {/* Program — label under institution */}
              <p className="text-[10px] sm:text-sm font-semibold tracking-[0.06em] sm:tracking-[0.1em] uppercase text-primary leading-tight">
                Continuing Language Assessment Program
              </p>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-display-2xl mb-4 sm:mb-5 md:mb-6 text-balance font-extrabold tracking-tight leading-tight">
              Master English with{' '}
              <span className="text-primary">Confidence</span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground mb-6 max-w-3xl text-balance leading-relaxed px-2 sm:px-0">
              Assess 5 core language skills with AI-powered evaluation
              and a detailed score card to accelerate your learning journey.
            </p>

            <Badge variant="secondary" className="mb-5 sm:mb-6 px-4 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full shadow-sm border border-border/50 backdrop-blur-sm whitespace-normal text-center leading-snug">
              <Sparkles className="inline-block w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-primary -translate-y-0.5" />
              <span>AI-Powered Assessment Platform</span>
            </Badge>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 sm:gap-5 w-full max-w-sm sm:max-w-none">
              <ActionButton href="/login" variant="hero" size="xl" className="group w-full sm:w-auto shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 flex justify-center">
                Start Assessment
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </ActionButton>
              <ActionButton href="#tests" variant="outline" size="xl" className="group w-full sm:w-auto flex justify-center border-2 border-border bg-white shadow-sm hover:bg-secondary/50">
                View Test Structure
              </ActionButton>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-border/50 w-full max-w-2xl">
              <div className="flex flex-col items-center justify-center py-5 px-4 rounded-xl bg-white border border-border shadow-sm">
                <div className="text-3xl sm:text-4xl font-bold text-foreground mb-1">5</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Skills</div>
              </div>
              <div className="flex flex-col items-center justify-center py-5 px-4 rounded-xl bg-white border border-border shadow-sm">
                <div className="text-3xl sm:text-4xl font-bold text-foreground mb-1">50</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Marks</div>
              </div>
              <div className="flex flex-col items-center justify-center py-5 px-4 rounded-xl bg-white border border-border shadow-sm">
                <div className="text-3xl sm:text-4xl font-bold text-foreground mb-1">45m</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Duration</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-12 sm:py-14 md:py-16 bg-secondary/30 scroll-mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10 md:mb-10">
            <Badge variant="outline" className="mb-3 sm:mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl md:text-display-sm mb-3 sm:mb-4 font-bold tracking-tight text-balance px-2 sm:px-0">Why Choose CLAP?</h2>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2 md:px-0 text-balance leading-relaxed">
              Built with cutting-edge technology to provide the most accurate and fair assessment experience
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
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

      {/* Test Types Section */}
      <section id="tests" className="py-10 sm:py-12 md:py-16 scroll-mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10 md:mb-10">
            <Badge variant="outline" className="mb-3 sm:mb-4">Assessment Structure</Badge>
            <h2 className="text-3xl sm:text-4xl md:text-display-sm mb-3 sm:mb-4 font-bold tracking-tight text-balance px-2 sm:px-0">5 Comprehensive Tests</h2>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2 md:px-0 text-balance leading-relaxed">
              Each test is carefully designed to evaluate specific language competencies
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {testTypes.map((test, index) => (
              <Card
                key={test.name}
                className={`card-hover cursor-pointer border-2 transition-all duration-300 ${hoveredTest === test.name ? 'border-primary shadow-glow' : 'border-transparent'
                  }`}
                onMouseEnter={() => setHoveredTest(test.name)}
                onMouseLeave={() => setHoveredTest(null)}
              >
                <CardHeader className="p-4 sm:p-5 lg:pb-3">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-${test.color}/10 flex items-center justify-center mb-3`}>
                    <test.icon className={`w-5 h-5 sm:w-6 sm:h-6 text-${test.color}`} style={{ color: `hsl(var(--${test.color}))` }} />
                  </div>
                  <Badge variant={test.color as any} className="w-fit mb-2 text-[10px] sm:text-xs">
                    {test.marks} marks
                  </Badge>
                  <CardTitle className="text-lg sm:text-base">{test.name}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 lg:px-6 lg:pb-6">
                  <p className="text-xs sm:text-sm text-muted-foreground">{test.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Test Flexibility */}
          <div className="mt-12 md:mt-16 p-6 md:p-8 rounded-2xl bg-secondary/50 border border-border mx-4 md:mx-0">
            <h3 className="text-xl font-semibold mb-6 text-center">Flexible Test Access</h3>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
              {testTypes.map((test, index) => (
                <div key={test.name} className="flex items-center">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border">
                    <test.icon className="w-4 h-4" style={{ color: `hsl(var(--${test.color}))` }} />
                    <span className="text-sm font-medium">{test.name}</span>
                  </div>
                  {index < testTypes.length - 1 && (
                    <span className="mx-2 text-muted-foreground">•</span>
                  )}
                </div>
              ))}
            </div>
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>Choose Your Path:</strong> Take tests in any order that suits your preference.
              </p>
              <p className="text-sm text-muted-foreground">
                A single global timer governs the entire assessment. Complete all 5 tests before time expires to receive your comprehensive score card.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                <Badge variant="outline" className="text-xs">Flexible Ordering</Badge>
                <Badge variant="outline" className="text-xs">Global Timer</Badge>
                <Badge variant="outline" className="text-xs">Progress Tracking</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-12 md:py-16 border-t border-border bg-gray-100 px-4 sm:px-0">
        <div className="container mx-auto px-0 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl md:text-display-sm mb-4 sm:mb-6 font-bold tracking-tight text-balance leading-tight">Ready to Assess Your English Skills?</h2>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground mb-8 md:mb-10 text-balance px-1 sm:px-4 md:px-0 leading-relaxed">
              Join thousands of learners who have improved their English proficiency with CLAP
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 w-full max-w-sm sm:max-w-none mx-auto">
              <ActionButton href="/login" variant="hero" size="xl" className="group w-full sm:w-auto flex justify-center">
                <Users className="mr-2 w-5 h-5" />
                Student Login
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </ActionButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={120} height={48} className="h-10 w-auto object-contain" />
            <p className="text-sm text-muted-foreground">
              © 2026 CLAP. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
