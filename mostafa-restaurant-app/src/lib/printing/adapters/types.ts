/**
 * ======================================================================================
 * PRINT ADAPTER CONTRACTS & ABSTRACTIONS V1.0
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Strict Decoupling Principles:
 * - Orchestration Layer (PrintJob) knows NOTHING about Web Serial, Network, RawBT, or Browser Print.
 * - Adapters receive pre-rendered payloads (text/html/bytes) and target connection parameters.
 * - Adapters NEVER calculate prices or modify CanonicalPrintDocument.
 * - SENT = Payload delivered to adapter transport.
 * - COMPLETED = Adapter confirmed physical/driver execution success.
 * - Typed errors clearly distinguish retryable from non-retryable failures.
 * ======================================================================================
 */

import { PrintStation, PrintDocumentType, PrintNature } from '../../../types/printing'

/**
 * 1. Supported Physical Adapter Types
 */
export type AdapterType =
  | 'mock'           // For testing & simulation
  | 'browser'        // window.print / iframe thermal rendering
  | 'network_tcp'    // Raw TCP socket (port 9100) ESC/POS
  | 'web_serial'     // Web Serial API (USB-to-Serial thermal printers)
  | 'rawbt'          // Android RawBT intent URL protocol

/**
 * 2. Typed Error Categories
 */
export type PrintErrorCategory =
  | 'connection'     // Network down, port unavailable, Bluetooth unbonded
  | 'timeout'        // Socket timed out, device unresponsive
  | 'device'         // Paper out, cover open, cutter jam, hardware error
  | 'unsupported'    // Feature/media/station unsupported or API not available
  | 'fatal'          // Payload corrupt, invalid configuration

/**
 * 3. Specific Error Codes
 */
export type PrintAdapterErrorCode =
  | 'CONNECTION_REFUSED'
  | 'HOST_UNREACHABLE'
  | 'PORT_NOT_OPEN'
  | 'TIMEOUT'
  | 'DEVICE_OFFLINE'
  | 'PAPER_OUT'
  | 'COVER_OPEN'
  | 'CUTTER_JAM'
  | 'API_NOT_SUPPORTED'
  | 'INVALID_PAYLOAD'
  | 'TRANSPORT_WRITE_FAILED'
  | 'UNKNOWN_ERROR'

/**
 * 4. Structured Print Adapter Error
 */
export interface PrintAdapterErrorPayload {
  readonly code: PrintAdapterErrorCode
  readonly category: PrintErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly adapter_type: AdapterType
  readonly details?: Record<string, unknown> | null
}

/**
 * 5. Printer Connection Specification
 */
export interface PrinterConnection {
  readonly adapter_type: AdapterType
  readonly station: PrintStation
  /** Target host (IP or hostname) for Network TCP */
  readonly host?: string
  /** Target port for Network TCP (default 9100) */
  readonly port?: number
  /** Serial port path or USB vendor/product identifier */
  readonly serial_port_id?: string
  /** Baud rate for serial connections (default 9600 or 115200) */
  readonly baud_rate?: number
  /** Bluetooth MAC address or device name for RawBT */
  readonly bluetooth_mac?: string
  /** Timeout in milliseconds for connection and write operations */
  readonly timeout_ms?: number
}

/**
 * 6. Prepared Print Transport Payload (Output of Rendering Layer)
 */
export interface PrintPayload {
  readonly job_id: string
  readonly order_id: string
  readonly order_number: number
  readonly document_type: PrintDocumentType
  readonly station: PrintStation
  readonly print_nature: PrintNature
  /** Thermal Monospace Text (48 columns) */
  readonly raw_text: string
  /** Semantic 80mm CSS Thermal HTML */
  readonly html?: string
  /** Optional pre-encoded ESC/POS binary buffer */
  readonly escpos_bytes?: Uint8Array
  /** Metadata timestamp */
  readonly prepared_at: string
}

/**
 * 7. Trusted Result of Print Execution
 */
export interface PrintResult {
  /** True strictly when transport/driver confirmed execution */
  readonly success: boolean
  /** Adapter that executed the job */
  readonly adapter_type: AdapterType
  /** Number of bytes successfully transmitted to device/spooler */
  readonly bytes_sent?: number
  /** Whether low-level hardware ACK was received from the printer (if supported) */
  readonly device_ack_received: boolean
  /** ISO timestamp of completion */
  readonly completed_at: string
  /** Diagnostic message */
  readonly message?: string
  /** Error detail if success === false */
  readonly error?: PrintAdapterErrorPayload | null
}

/**
 * 8. Unified Print Adapter Interface
 */
export interface PrintAdapter {
  readonly type: AdapterType
  readonly name: string

  /**
   * Checks whether the runtime environment supports this adapter
   * (e.g. window.print in browser, navigator.serial in Chrome, net.Socket in Node)
   */
  isSupported(): Promise<boolean> | boolean

  /**
   * Sends the prepared payload to the target device via this adapter.
   * - Must NEVER throw uncaught exceptions; errors are packaged in PrintResult.error.
   * - Must NEVER modify the payload or recalculate financials.
   */
  print(payload: PrintPayload, connection: PrinterConnection): Promise<PrintResult>
}
