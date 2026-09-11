/**
 * ======================================================================================
 * APPEND-ONLY PRINT AUDIT LOGGER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Immutability & Traceability:
 * - Append-Only in-memory audit store.
 * - Every record is deeply frozen (Object.freeze).
 * - No editing or silent mutation of historical entries.
 * - Answers the complete audit inquiry:
 *   What was printed? Why? For whom? By whom? When? How many times?
 *   Was transport delivered? Did Hardware ACK arrive? What occurred on each attempt?
 * ======================================================================================
 */

import { randomUUID } from 'crypto'
import {
  PrintAuditEntry,
  AppendAuditEntryInput,
  OrderAuditSummary,
  ProofOfPrintLevel,
} from './types'
import { PrintDocumentType } from '../../../types/printing'
import { PrintJobStatus } from '../jobs/types'

export class PrintAuditLogger {
  // Append-only internal array
  private readonly entries: PrintAuditEntry[] = []

  /**
   * Appends a new immutable audit record to the log
   */
  public record(input: AppendAuditEntryInput): PrintAuditEntry {
    const entryId = randomUUID()
    const now = new Date().toISOString()

    const entry: PrintAuditEntry = Object.freeze({
      entry_id: entryId,
      timestamp: now,
      action: input.action,
      order_id: input.order_id,
      order_number: input.order_number,
      document_type: input.document_type,
      target_station: input.target_station,
      job_id: input.job_id,
      parent_job_id: input.parent_job_id ?? null,
      job_kind: input.job_kind,
      attempt_number: input.attempt_number,
      reprint_meta: input.reprint_meta ? Object.freeze({ ...input.reprint_meta }) : undefined,
      proof_of_print: input.proof_of_print ? Object.freeze({ ...input.proof_of_print }) : null,
      error: input.error ? Object.freeze({ ...input.error }) : null,
      staff: input.staff ? Object.freeze({ ...input.staff }) : undefined,
      details: input.details ? Object.freeze({ ...input.details }) : undefined,
    })

    this.entries.push(entry)
    return entry
  }

  /**
   * Retrieves all chronological audit entries for a specific order
   */
  public getEntriesForOrder(orderId: string): readonly PrintAuditEntry[] {
    return this.entries.filter((e) => e.order_id === orderId)
  }

  /**
   * Retrieves all chronological audit entries for a specific job
   */
  public getEntriesForJob(jobId: string): readonly PrintAuditEntry[] {
    return this.entries.filter((e) => e.job_id === jobId)
  }

  /**
   * Retrieves reprint history for an order and document type
   */
  public getReprintHistory(
    orderId: string,
    documentType?: PrintDocumentType
  ): readonly PrintAuditEntry[] {
    return this.entries.filter(
      (e) =>
        e.order_id === orderId &&
        e.job_kind === 'REPRINT' &&
        (!documentType || e.document_type === documentType)
    )
  }

  /**
   * Returns a comprehensive operational summary answering all audit questions
   */
  public getOrderAuditSummary(orderId: string): OrderAuditSummary {
    const list = this.getEntriesForOrder(orderId)
    const orderNumber = list[0]?.order_number || 0

    let totalAttempts = 0
    let successfulDispatches = 0
    let failedDispatches = 0
    let hardwareAcks = 0
    let originalPrints = 0
    let reprints = 0

    const docMap: Record<
      PrintDocumentType,
      {
        original_completed: boolean
        original_job_id?: string
        reprints_issued: number
        latest_status: PrintJobStatus | 'NOT_STARTED'
        proof_level: ProofOfPrintLevel | 'NONE'
      }
    > = {
      KITCHEN_TICKET: { original_completed: false, reprints_issued: 0, latest_status: 'NOT_STARTED', proof_level: 'NONE' },
      CUSTOMER_RECEIPT: { original_completed: false, reprints_issued: 0, latest_status: 'NOT_STARTED', proof_level: 'NONE' },
      DRIVER_CONTROL_COPY: { original_completed: false, reprints_issued: 0, latest_status: 'NOT_STARTED', proof_level: 'NONE' },
      DINE_IN_CUSTOMER_TICKET: { original_completed: false, reprints_issued: 0, latest_status: 'NOT_STARTED', proof_level: 'NONE' },
      DIFFERENTIAL_CHANGE_TICKET: { original_completed: false, reprints_issued: 0, latest_status: 'NOT_STARTED', proof_level: 'NONE' },
    }

    for (const entry of list) {
      if (entry.action === 'JOB_DISPATCH_ATTEMPT') {
        totalAttempts++
      }

      if (entry.action === 'JOB_COMPLETED') {
        successfulDispatches++
        if (entry.proof_of_print?.hardware_ack) {
          hardwareAcks++
        }
        if (entry.job_kind === 'ORIGINAL') {
          originalPrints++
          docMap[entry.document_type].original_completed = true
          docMap[entry.document_type].original_job_id = entry.job_id
        } else if (entry.job_kind === 'REPRINT') {
          reprints++
          docMap[entry.document_type].reprints_issued++
        }
        docMap[entry.document_type].latest_status = 'COMPLETED'
        docMap[entry.document_type].proof_level = entry.proof_of_print?.level || 'TRANSPORT_DELIVERED'
      }

      if (entry.action === 'JOB_FAILED') {
        failedDispatches++
        docMap[entry.document_type].latest_status = 'PRINT_FAILED'
      }
    }

    return {
      order_id: orderId,
      order_number: orderNumber,
      total_entries: list.length,
      original_prints_count: originalPrints,
      reprints_count: reprints,
      total_attempts: totalAttempts,
      successful_dispatches: successfulDispatches,
      failed_dispatches: failedDispatches,
      hardware_acks_received: hardwareAcks,
      documents_summary: docMap,
      chronology: list,
    }
  }

  /**
   * Resets the in-memory log (for testing)
   */
  public clear(): void {
    this.entries.length = 0
  }
}

export const globalPrintAuditLogger = new PrintAuditLogger()
