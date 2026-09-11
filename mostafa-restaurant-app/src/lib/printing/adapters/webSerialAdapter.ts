/**
 * ======================================================================================
 * WEB SERIAL USB/SERIAL ESC/POS ADAPTER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Supports direct USB and RS232 thermal printer communication from modern browsers
 * via the Web Serial API (navigator.serial).
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
  createConnectionError,
} from './errors'

export class WebSerialAdapter implements PrintAdapter {
  public readonly type: AdapterType = 'web_serial'
  public readonly name: string = 'Web Serial USB ESC/POS Adapter'

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  public async print(
    payload: PrintPayload,
    connection: PrinterConnection
  ): Promise<PrintResult> {
    if (!this.isSupported()) {
      const err = createUnsupportedError(
        'web_serial',
        'Web Serial API is not supported in this browser or runtime environment.'
      )
      return {
        success: false,
        adapter_type: 'web_serial',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    try {
      const serial = (navigator as any).serial
      const ports = await serial.getPorts()

      if (!ports || ports.length === 0) {
        const err = createConnectionError(
          'web_serial',
          'No authorized Web Serial ports found. Device must be paired via requestPort first.'
        )
        return {
          success: false,
          adapter_type: 'web_serial',
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: err.message,
          error: err.toJSON(),
        }
      }

      const port = ports[0]
      const baudRate = connection.baud_rate || 9600

      await port.open({ baudRate })
      const writer = port.writable.getWriter()

      const dataBuffer = payload.escpos_bytes || new TextEncoder().encode(payload.raw_text)
      await writer.write(dataBuffer)

      writer.releaseLock()
      await port.close()

      return {
        success: true,
        adapter_type: 'web_serial',
        bytes_sent: dataBuffer.length,
        device_ack_received: true,
        completed_at: new Date().toISOString(),
        message: `Wrote ${dataBuffer.length} bytes to serial thermal printer.`,
        error: null,
      }
    } catch (err: any) {
      const errorPayload = createConnectionError(
        'web_serial',
        `Serial communication failure: ${err?.message || 'Unknown serial error'}`
      )
      return {
        success: false,
        adapter_type: 'web_serial',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: errorPayload.message,
        error: errorPayload.toJSON(),
      }
    }
  }
}
