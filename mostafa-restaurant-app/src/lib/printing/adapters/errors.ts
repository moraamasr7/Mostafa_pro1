/**
 * ======================================================================================
 * PRINT ADAPTER TYPED ERRORS
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Provides typed, categorized, and structured error helpers.
 * Distinguishes retryable failures (connection drop, timeout, paper out)
 * from non-retryable fatal failures (unsupported API, corrupt payload).
 * ======================================================================================
 */

import {
  AdapterType,
  PrintErrorCategory,
  PrintAdapterErrorCode,
  PrintAdapterErrorPayload,
} from './types'

export class PrintAdapterError extends Error implements PrintAdapterErrorPayload {
  public readonly code: PrintAdapterErrorCode
  public readonly category: PrintErrorCategory
  public readonly retryable: boolean
  public readonly adapter_type: AdapterType
  public readonly details?: Record<string, unknown> | null

  constructor(payload: PrintAdapterErrorPayload) {
    super(payload.message)
    this.name = 'PrintAdapterError'
    this.code = payload.code
    this.category = payload.category
    this.retryable = payload.retryable
    this.adapter_type = payload.adapter_type
    this.details = payload.details || null
  }

  public toJSON(): PrintAdapterErrorPayload {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      adapter_type: this.adapter_type,
      details: this.details,
    }
  }
}

/**
 * Factory for Connection Errors (Retryable)
 */
export function createConnectionError(
  adapterType: AdapterType,
  message: string,
  details?: Record<string, unknown>,
  code: PrintAdapterErrorCode = 'CONNECTION_REFUSED'
): PrintAdapterError {
  return new PrintAdapterError({
    code,
    category: 'connection',
    message,
    retryable: true,
    adapter_type: adapterType,
    details,
  })
}

/**
 * Factory for Timeout Errors (Retryable)
 */
export function createTimeoutError(
  adapterType: AdapterType,
  timeoutMs: number,
  details?: Record<string, unknown>
): PrintAdapterError {
  return new PrintAdapterError({
    code: 'TIMEOUT',
    category: 'timeout',
    message: `Print operation timed out after ${timeoutMs}ms.`,
    retryable: true,
    adapter_type: adapterType,
    details: { ...details, timeout_ms: timeoutMs },
  })
}

/**
 * Factory for Hardware Device Errors (e.g. Paper Out, Cover Open - Retryable after operator fix)
 */
export function createDeviceError(
  adapterType: AdapterType,
  code: 'PAPER_OUT' | 'COVER_OPEN' | 'CUTTER_JAM' | 'DEVICE_OFFLINE',
  message: string,
  details?: Record<string, unknown>
): PrintAdapterError {
  return new PrintAdapterError({
    code,
    category: 'device',
    message,
    retryable: true,
    adapter_type: adapterType,
    details,
  })
}

/**
 * Factory for Unsupported Adapter / Capability Errors (Non-retryable)
 */
export function createUnsupportedError(
  adapterType: AdapterType,
  message: string,
  details?: Record<string, unknown>
): PrintAdapterError {
  return new PrintAdapterError({
    code: 'API_NOT_SUPPORTED',
    category: 'unsupported',
    message,
    retryable: false,
    adapter_type: adapterType,
    details,
  })
}

/**
 * Factory for Fatal / Configuration Errors (Non-retryable)
 */
export function createFatalError(
  adapterType: AdapterType,
  message: string,
  code: PrintAdapterErrorCode = 'INVALID_PAYLOAD',
  details?: Record<string, unknown>
): PrintAdapterError {
  return new PrintAdapterError({
    code,
    category: 'fatal',
    message,
    retryable: false,
    adapter_type: adapterType,
    details,
  })
}
