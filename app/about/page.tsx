'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Users,
  Brain,
  Target,
  Zap,
  Shield,
  BarChart3,
  Clock,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  ArrowRight,
  CheckCircle,
  Star
} from 'lucide-react'

export default function AboutPage() {
  const features = [
    {
      icon: Zap,
      title: 'AI-Powered Scoring',
      description: 'Advanced LLM technology evaluates speaking and writing with human-like accuracy'
    },
    {
      icon: Clock,
      title: 'Flexible Timing',
      description: 'Complete tests at your own pace with automatic time management'
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

  const teamMembers = [
    {
      name: 'Dr. Sarah Johnson',
      role: 'Chief Language Officer',
      qualification: 'PhD in Applied Linguistics'
    },
    {
      name: 'Prof. Michael Chen',
      role: 'AI Research Lead',
      qualification: 'Former Google AI Researcher'
    },
    {
      name: 'Emma Rodriguez',
      role: 'Education Specialist',
      qualification: 'MA in TESOL, 15+ years teaching'
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/images/clap-logo.png" alt="CLAP Logo" width={40} height={40} className="rounded-xl" />
              <span className="text-xl font-bold gradient-text">CLAP</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
              <Link href="/#tests" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Tests</Link>
              <Link href="/about" className="text-sm font-medium text-foreground">About</Link>
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
      <section className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5">
              About CLAP
            </Badge>
            
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

      {/* Mission Section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-display-sm mb-6">Our Mission</h2>
                <p className="text-lg text-muted-foreground mb-6">
                  We believe every language learner deserves access to high-quality, affordable assessment 
                  that provides meaningful feedback for improvement.
                </p>
                <p className="text-muted-foreground mb-6">
                  Traditional language testing is expensive, time-consuming, and often inaccessible. 
                  CLAP changes this by leveraging AI to deliver instant, accurate evaluations at scale.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>Democratize access to quality language assessment</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>Provide immediate, actionable feedback</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>Support continuous learning and improvement</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card rounded-2xl p-8 border border-border">
                <div className="text-center">
                  <Star className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Trusted by 10,000+ Learners</h3>
                  <p className="text-muted-foreground">
                    Join our growing community of language enthusiasts who trust CLAP for accurate assessment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-display-sm mb-4">What Makes CLAP Different</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our unique approach combines advanced technology with educational expertise
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

      {/* Team Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Our Team</Badge>
            <h2 className="text-display-sm mb-4">Meet the Experts</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our team combines decades of language education experience with cutting-edge AI research
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {teamMembers.map((member) => (
              <Card key={member.name} className="text-center">
                <CardHeader>
                  <div className="w-20 h-20 rounded-full bg-gradient-primary mx-auto mb-4 flex items-center justify-center">
                    <Users className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <CardTitle>{member.name}</CardTitle>
                  <CardDescription>{member.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{member.qualification}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-display-sm mb-6">Ready to Transform Your Learning?</h2>
            <p className="text-lg text-muted-foreground mb-10">
              Join thousands of learners who trust CLAP for accurate, affordable language assessment
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?role=student">
                <Button variant="hero" size="xl" className="group">
                  <Users className="mr-2 w-5 h-5" />
                  Start Assessment
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/#tests">
                <Button variant="outline" size="xl">
                  Learn More
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