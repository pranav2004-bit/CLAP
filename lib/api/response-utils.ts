// Utility functions for API responses
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Success response
export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message
  }
}

// Error response
export function errorResponse(error: string, message?: string): ApiResponse<null> {
  return {
    success: false,
    error,
    message
  }
}

// Validation error response
export function validationErrorResponse(errors: Record<string, string>): ApiResponse<null> {
  return {
    success: false,
    error: 'VALIDATION_ERROR',
    message: 'Validation failed',
    data: errors as any
  }
}

// Not found response
export function notFoundResponse(resource: string): ApiResponse<null> {
  return {
    success: false,
    error: 'NOT_FOUND',
    message: `${resource} not found`
  }
}

// Unauthorized response
export function unauthorizedResponse(): ApiResponse<null> {
  return {
    success: false,
    error: 'UNAUTHORIZED',
    message: 'Unauthorized access'
  }
}

// Bad request response
export function badRequestResponse(message: string): ApiResponse<null> {
  return {
    success: false,
    error: 'BAD_REQUEST',
    message
  }
}