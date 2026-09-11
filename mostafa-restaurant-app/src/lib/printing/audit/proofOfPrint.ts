/**
 * ======================================================================================
 * HONEST PROOF OF PRINT EVALUATOR
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Axiom:
 * TRANSPORT_DELIVERED ≠ HARDWARE_ACK ≠ PHYSICAL_PAPER_CONFIRMED
 * 
 * Never records physical_paper_confirmed = true without explicit optical sensor proof.
 * Never records hardware_ack = true without device ACK confirmation.
 * ======================================================================================
 */

import { PrintResult, PrintPayload } from '../adapters/types'
import { ProofOfPrint, ProofOfPrintLevel } from './types'

export function evaluateProofOfPrint(
  result: PrintResult,
  payload: PrintPayload,
  sensorOptions?: { sensorPaperEjectionConfirmed?: boolean }
): ProofOfPrint {
  const now = new Date().toISOString()
  const bytesSent = result.bytes_sent || (result.success ? Buffer.byteLength(payload.raw_text, 'utf-8') : 0)

  if (!result.success) {
    return {
      level: 'TRANSPORT_DELIVERED',
      transport_delivered: false,
      hardware_ack: false,
      physical_paper_confirmed: false,
      bytes_transmitted: 0,
      timestamp: now,
      adapter_type: result.adapter_type,
      station: payload.station,
    }
  }

  const transportDelivered = true
  const hardwareAck = result.device_ack_received === true
  const physicalPaperConfirmed = hardwareAck && Boolean(sensorOptions?.sensorPaperEjectionConfirmed)

  let level: ProofOfPrintLevel = 'TRANSPORT_DELIVERED'
  if (physicalPaperConfirmed) {
    level = 'PHYSICAL_PAPER_CONFIRMED'
  } else if (hardwareAck) {
    level = 'HARDWARE_ACK'
  }

  return {
    level,
    transport_delivered: transportDelivered,
    hardware_ack: hardwareAck,
    physical_paper_confirmed: physicalPaperConfirmed,
    bytes_transmitted: bytesSent,
    timestamp: now,
    adapter_type: result.adapter_type,
    station: payload.station,
  }
}
