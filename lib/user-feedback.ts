/**
 * Standardized User Feedback Utilities
 * Ensures consistent, high-quality user experience across the entire platform
 */

import { toast } from 'sonner'

interface FeedbackOptions {
    description?: string
    duration?: number
}

/**
 * User Feedback Manager
 * Provides consistent, emoji-enhanced feedback with proper timing
 */
export const feedback = {
    // ===== SUCCESS MESSAGES =====

    success: (message: string, options?: FeedbackOptions) => {
        toast.success(`✅ ${message}`, {
            duration: options?.duration || 4000,
            description: options?.description
        })
    },

    created: (itemType: string, itemName: string, additionalInfo?: string) => {
        toast.success(`✅ ${itemType} "${itemName}" created successfully!`, {
            duration: 5000,
            description: additionalInfo
        })
    },

    updated: (itemType: string, itemName: string) => {
        toast.success(`✅ ${itemType} "${itemName}" updated successfully!`, {
            duration: 4000
        })
    },

    deleted: (itemType: string, itemName: string) => {
        toast.success(`🗑️ ${itemType} "${itemName}" deleted successfully`, {
            duration: 4000
        })
    },

    restored: (itemType: string, itemName: string, additionalInfo?: string) => {
        toast.success(`✨ ${itemType} "${itemName}" has been restored!`, {
            duration: 5000,
            description: additionalInfo
        })
    },

    assigned: (itemType: string, itemName: string, target: string) => {
        toast.success(`✅ ${itemType} "${itemName}" assigned to ${target} successfully!`, {
            duration: 4000
        })
    },

    unassigned: (itemType: string, itemName: string) => {
        toast.success(`✅ ${itemType} "${itemName}" unassigned successfully`, {
            duration: 4000
        })
    },

    enabled: (itemType: string, itemName?: string) => {
        const name = itemName ? `"${itemName}" ` : ''
        toast.success(`✅ ${itemType} ${name}enabled successfully`, {
            duration: 3000
        })
    },

    disabled: (itemType: string, itemName?: string) => {
        const name = itemName ? `"${itemName}" ` : ''
        toast.success(`⏸️ ${itemType} ${name}disabled successfully`, {
            duration: 3000
        })
    },

    published: (itemType: string, itemName: string) => {
        toast.success(`🚀 ${itemType} "${itemName}" published successfully!`, {
            duration: 4000
        })
    },

    unpublished: (itemType: string, itemName: string) => {
        toast.success(`📦 ${itemType} "${itemName}" unpublished successfully`, {
            duration: 4000
        })
    },

    passwordReset: (password: string = 'CLAP@123') => {
        toast.success(`🔑 Password reset successfully`, {
            duration: 5000,
            description: `New password: ${password}`
        })
    },

    saved: (itemType?: string) => {
        const item = itemType ? `${itemType} ` : ''
        toast.success(`💾 ${item}saved successfully!`, {
            duration: 3000
        })
    },

    // ===== ERROR MESSAGES =====

    error: (message: string, options?: FeedbackOptions) => {
        toast.error(`❌ ${message}`, {
            duration: options?.duration || 5000,
            description: options?.description
        })
    },

    alreadyExists: (itemType: string, itemName: string) => {
        toast.error(`❌ ${itemType} "${itemName}" already exists`, {
            duration: 5000,
            description: 'Please use a different name or ID'
        })
    },

    notFound: (itemType: string, itemName?: string) => {
        const name = itemName ? `"${itemName}" ` : ''
        toast.error(`❌ ${itemType} ${name}not found`, {
            duration: 4000
        })
    },

    validationError: (message: string) => {
        toast.error(`⚠️ ${message}`, {
            duration: 5000,
            description: 'Please check your input and try again'
        })
    },

    networkError: () => {
        toast.error('❌ Network error - Please check your connection', {
            duration: 6000,
            description: 'Make sure the backend server is running'
        })
    },

    serverError: (details?: string) => {
        toast.error('❌ Server error occurred', {
            duration: 6000,
            description: details || 'Please try again or contact support'
        })
    },

    unauthorized: () => {
        toast.error('🔒 Unauthorized access', {
            duration: 5000,
            description: 'Please log in to continue'
        })
    },

    forbidden: () => {
        toast.error('🚫 Access denied', {
            duration: 5000,
            description: 'You do not have permission to perform this action'
        })
    },

    requiredFields: () => {
        toast.error('⚠️ Please fill in all required fields', {
            duration: 4000
        })
    },

    // ===== WARNING MESSAGES =====

    warning: (message: string, options?: FeedbackOptions) => {
        toast.warning(`⚠️ ${message}`, {
            duration: options?.duration || 4000,
            description: options?.description
        })
    },

    // ===== INFO MESSAGES =====

    info: (message: string, options?: FeedbackOptions) => {
        toast.info(`ℹ️ ${message}`, {
            duration: options?.duration || 3000,
            description: options?.description
        })
    },

    // ===== LOADING MESSAGES =====

    loading: (message: string = 'Loading...') => {
        return toast.loading(`⏳ ${message}`)
    },

    loadingData: (itemType: string = 'data') => {
        return toast.loading(`⏳ Loading ${itemType}...`)
    },

    creating: (itemType: string) => {
        return toast.loading(`⏳ Creating ${itemType}...`)
    },

    updating: (itemType: string) => {
        return toast.loading(`⏳ Updating ${itemType}...`)
    },

    deleting: (itemType: string) => {
        return toast.loading(`⏳ Deleting ${itemType}...`)
    },

    saving: () => {
        return toast.loading(`⏳ Saving changes...`)
    },

    processing: (action: string = 'request') => {
        return toast.loading(`⏳ Processing ${action}...`)
    },

    // ===== PROMISE HANDLING =====

    promise: <T>(
        promise: Promise<T>,
        messages: {
            loading: string
            success: string
            error: string
        }
    ) => {
        return toast.promise(promise, {
            loading: `⏳ ${messages.loading}`,
            success: `✅ ${messages.success}`,
            error: `❌ ${messages.error}`
        })
    }
}

/**
 * Handle API Response with automatic feedback
 */
export const handleApiResponse = async (
    response: Response,
    successMessage: string,
    errorPrefix: string = 'Operation failed'
) => {
    const data = await response.json()

    if (response.ok) {
        feedback.success(successMessage)
        return { success: true, data }
    } else {
        const errorMessage = data.error || data.message || errorPrefix
        feedback.error(errorMessage)
        return { success: false, error: errorMessage }
    }
}

/**
 * Wrap async operations with automatic error handling
 */
export const withFeedback = async <T>(
    operation: () => Promise<T>,
    errorMessage: string = 'An error occurred'
): Promise<T | null> => {
    try {
        return await operation()
    } catch (error: any) {
        if (!error.message || error.message === 'Failed to fetch') {
            feedback.networkError()
        } else {
            feedback.error(error.message || errorMessage)
        }
        return null
    }
}
