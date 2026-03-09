'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, ButtonProps } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionButtonProps extends ButtonProps {
    href?: string
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
}

export function ActionButton({
    href,
    onClick,
    children,
    className,
    disabled,
    ...props
}: ActionButtonProps) {
    const router = useRouter()
    const [isPending, startTransition] = React.useTransition()
    const [isLoading, setIsLoading] = React.useState(false)

    const loading = isPending || isLoading

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (loading) return

        // If it's just a normal click handler
        if (onClick) {
            setIsLoading(true)
            try {
                await onClick(e)
            } finally {
                setIsLoading(false)
            }
            return
        }

        // If it's a navigation link
        if (href) {
            e.preventDefault()

            // Handle hash links (anchors) without loading state
            if (href.startsWith('#')) {
                const element = document.querySelector(href)
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' })
                } else {
                    router.push(href)
                }
                return
            }

            // useTransition keeps isPending=true until the full page navigation
            // completes (including server data fetching), so the spinner stays
            // visible for exactly as long as navigation takes — no manual cleanup needed.
            startTransition(() => {
                router.push(href)
            })
        }
    }

    return (
        <Button
            className={cn("relative", className)}
            disabled={disabled || loading}
            onClick={handleClick}
            {...props}
        >
            {loading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {children}
        </Button>
    )
}
