/**
 * ======================================================================================
 * PRINT EXECUTION RUNTIME & DISPATCHER CONTRACTS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Single Chain of Responsibility:
 * CanonicalPrintDocument -> Document Renderer -> PrintPayload -> PrintJob ->
 * Station Router -> Adapter Registry -> Concrete Adapter -> PrintResult -> State Machine
 * 
 * Guarantees:
 * - NO database mutations or Supabase calls.
 * - NO recalculation of financial amounts.
 * - Concurrency control preventing duplicate in-flight dispatch.
 * - Accurate Hardware ACK vs Transport Delivery distinction.
 * ======================================================================================
 */

import {
  PrintStation,
  PrintWorkflow,
  CanonicalDocumentPayload,
  ReprintReason,
} from '../../../types/printing'
import { PrintJob, PrintJobKind } from '../jobs/types'
import {
  PrinterConnection,
  PrintResult,
  PrintPayload,
} from '../adapters/types'

/**
 * 1. Station to Connection Mapping Configuration
 */
export interface StationConnectionConfig {
  readonly KITCHEN_80MM: PrinterConnection
  readonly CASHIER_80MM: PrinterConnection
}

/**
 * 2. Dispatch Request Options
 */
export interface DispatchOptions {
  /** Override station configuration if needed */
  customStationConfig?: Partial<StationConnectionConfig>
  /** Timeout in ms for the overall dispatch operation */
  timeoutMs?: number
  /** Whether to automatically retry on retryable errors */
  autoRetry?: boolean
  /** Delay in ms between retries */
  retryDelayMs?: number
  /** Maximum allowable attempts before fatal failure (default 3) */
  maxAttempts?: number
}

/**
 * 3. Input Specification for Dispatching an Original Print Request
 */
export interface DispatchOriginalRequest {
  readonly kind: 'ORIGINAL'
  readonly document: CanonicalDocumentPayload
  readonly workflow: PrintWorkflow
  readonly options?: DispatchOptions
}

/**
 * 4. Input Specification for Dispatching a Reprint Request
 */
export interface DispatchReprintRequest {
  readonly kind: 'REPRINT'
  readonly document: CanonicalDocumentPayload
  readonly original_job: PrintJob
  readonly reason: ReprintReason
  readonly custom_reason_text?: string
  readonly requested_by: string
  readonly options?: DispatchOptions
}

/**
 * 5. Input Specification for Dispatching a Differential Change Ticket
 */
export interface DispatchDifferentialRequest {
  readonly kind: 'DIFFERENTIAL'
  readonly document: CanonicalDocumentPayload
  readonly workflow: PrintWorkflow
  readonly modification_number: number
  readonly options?: DispatchOptions
}

export type DispatchRequest =
  | DispatchOriginalRequest
  | DispatchReprintRequest
  | DispatchDifferentialRequest

/**
 * 6. Unified Dispatch Execution Result
 */
export interface DispatchExecutionResult {
  /** Final state of the PrintJob */
  readonly job: PrintJob
  /** Pre-rendered transport payload sent to adapter */
  readonly payload: PrintPayload
  /** Execution result returned by adapter */
  readonly result: PrintResult
  /** True strictly if hardware ACK was confirmed by the adapter */
  readonly hardware_ack_verified: boolean
  /** Duration of total dispatch in milliseconds */
  readonly duration_ms: number
}
