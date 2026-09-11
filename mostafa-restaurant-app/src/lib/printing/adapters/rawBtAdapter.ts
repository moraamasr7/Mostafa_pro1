/**
 * ======================================================================================
 * RAWBT INTENT ADAPTER (ANDROID MOBILE POS)
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Generates and triggers RawBT print intents for handheld Android POS terminals
 * and Bluetooth thermal receipt printers.
 * ======================================================================================
 */

import {
  PrintAdapter,
  AdapterType,
  PrintPayload,
  PrinterConnection,
  PrintResult,
} from './types'
import {
  createUnsupportedError,
  createFatalError,
} from './errors'

export class RawBtIntentAdapter implements PrintAdapter {
  public readonly type: AdapterType = 'rawbt'
  public readonly name: string = 'RawBT Android Intent Adapter'

  public isSupported(): boolean {
    if (typeof navigator === 'undefined') return false
    const userAgent = navigator.userAgent || ''
    return /Android/i.test(userAgent)
  }

  public buildIntentUrl(payload: PrintPayload, connection?: PrinterConnection): string {
    const base64Data = Buffer.from(payload.raw_text, 'utf-8').toString('base64')
    const macParam = connection?.bluetooth_mac ? `&mac=${encodeURIComponent(connection.bluetooth_mac)}` : ''
    return `rawbt:data:text/plain;base64,${base64Data}${macParam}`
  }

  public async print(
    payload: PrintPayload,
    connection: PrinterConnection
  ): Promise<PrintResult> {
    if (!this.isSupported()) {
      const err = createUnsupportedError(
        'rawbt',
        'RawBT Intent printing is supported exclusively on Android mobile devices.'
      )
      return {
        success: false,
        adapter_type: 'rawbt',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    try {
      const intentUrl = this.buildIntentUrl(payload, connection)

      if (typeof window !== 'undefined') {
        window.location.href = intentUrl
      }

      return {
        success: true,
        adapter_type: 'rawbt',
        bytes_sent: Buffer.byteLength(payload.raw_text, 'utf-8'),
        device_ack_received: false, // Intent handoff cannot confirm physical print completion
        completed_at: new Date().toISOString(),
        message: 'Dispatched print job to RawBT Android intent service.',
        error: null,
      }
    } catch (err: any) {
      const errorPayload = createFatalError(
        'rawbt',
        `Failed triggering RawBT intent: ${err?.message || 'Unknown intent error'}`
      )
      return {
        success: false,
        adapter_type: 'rawbt',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: errorPayload.message,
        error: errorPayload.toJSON(),
      }
    }
  }
}
