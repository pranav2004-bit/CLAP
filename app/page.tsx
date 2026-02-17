'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Zap
} from 'lucide-react'

const testTypes = [
  {
    name: 'Listening',
    icon: Headphones,
    color: 'listening',
    description: '2 audio clips with MCQ questions',
    marks: 10,
    duration: '20 min'
  },
  {
    name: 'Speaking',
    icon: Mic,
    color: 'speaking',
    description: 'Voice recording with AI evaluation',
    marks: 10,
    duration: '5 min'
  },
  {
    name: 'Reading',
    icon: BookOpen,
    color: 'reading',
    description: '2 passages with comprehension MCQs',
    marks: 10,
    duration: '25 min'
  },
  {
    name: 'Writing',
    icon: PenTool,
    color: 'writing',
    description: 'Essay writing with AI scoring',
    marks: 10,
    duration: '30 min'
  },
  {
    name: 'Vocabulary & Grammar',
    icon: Brain,
    color: 'vocabulary',
    description: '10 MCQs on language skills',
    marks: 10,
    duration: '15 min'
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
    title: 'Detailed Reports',
    description: 'Comprehensive score breakdowns delivered automatically via email'
  }
]

export default function LandingPage() {
  const [hoveredTest, setHoveredTest] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/images/clap-logo.png" alt="CLAP Logo" width={40} height={40} className="rounded-xl" />
              <span className="text-xl font-bold gradient-text">CLAP</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#tests" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Tests</a>
              <Link href="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5">
              <Sparkles className="w-3 h-3 mr-1.5" />
              AI-Powered Assessment Platform
            </Badge>
            
            <h1 className="text-display-lg md:text-display-xl mb-6 text-balance">
              Master English with{' '}
              <span className="gradient-text">Confidence</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto text-balance">
              Comprehensive language assessment across 5 core skills. Get accurate, 
              AI-powered evaluation and detailed feedback to accelerate your learning journey.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login">
                <Button variant="hero" size="xl" className="group">
                  Start Assessment
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="#tests">
                <Button variant="outline" size="xl">
                  View Test Structure
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-16 pt-16 border-t border-border/50">
              <div>
                <div className="text-3xl font-bold text-foreground">5</div>
                <div className="text-sm text-muted-foreground">Core Skills</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">50</div>
                <div className="text-sm text-muted-foreground">Total Marks</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">95 min</div>
                <div className="text-sm text-muted-foreground">Default Duration</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-display-sm mb-4">Why Choose CLAP?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
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
      <section id="tests" className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Assessment Structure</Badge>
            <h2 className="text-display-sm mb-4">5 Comprehensive Tests</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Each test is carefully designed to evaluate specific language competencies
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
            {testTypes.map((test, index) => (
              <Card 
                key={test.name}
                className={`card-hover cursor-pointer border-2 transition-all duration-300 ${
                  hoveredTest === test.name ? 'border-primary shadow-glow' : 'border-transparent'
                }`}
                onMouseEnter={() => setHoveredTest(test.name)}
                onMouseLeave={() => setHoveredTest(null)}
              >
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 rounded-xl bg-${test.color}/10 flex items-center justify-center mb-3`}>
                    <test.icon className={`w-6 h-6 text-${test.color}`} style={{ color: `hsl(var(--${test.color}))` }} />
                  </div>
                  <Badge variant={test.color as any} className="w-fit mb-2">
                    {test.marks} marks
                  </Badge>
                  <CardTitle className="text-base">{test.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-3">{test.description}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    {test.duration}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Test Flexibility */}
          <div className="mt-16 p-8 rounded-2xl bg-secondary/50 border border-border">
            <h3 className="text-lg font-semibold mb-6 text-center">Flexible Test Access</h3>
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
                Each test auto-submits when time expires. Complete all 5 tests to receive your comprehensive report.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                <Badge variant="outline" className="text-xs">Flexible Ordering</Badge>
                <Badge variant="outline" className="text-xs">Individual Time Limits</Badge>
                <Badge variant="outline" className="text-xs">Progress Tracking</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-display-sm mb-6">Ready to Assess Your English Skills?</h2>
            <p className="text-lg text-muted-foreground mb-10">
              Join thousands of learners who have improved their English proficiency with CLAP
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?role=student">
                <Button variant="hero" size="xl" className="group">
                  <Users className="mr-2 w-5 h-5" />
                  Student Login
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/login?role=admin">
                <Button variant="outline" size="xl">
                  <Shield className="mr-2 w-5 h-5" />
                  Admin Portal
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/images/clap-logo.png" alt="CLAP Logo" width={32} height={32} className="rounded-lg" />
              <span className="font-semibold">CLAP</span>
              <span className="text-sm text-muted-foreground">by SANJIVO</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 CLAP. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
