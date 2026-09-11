/**
 * ======================================================================================
 * MOCK PRINT ADAPTER (TESTING & SIMULATION)
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Provides deterministic simulation of:
 * - Successful printing with hardware ACK.
 * - Network timeouts and disconnections.
 * - Hardware failures (paper out, cover open).
 * - Latency and retry behavior.
 * ======================================================================================
 */

import {
  PrintAdapter,
  AdapterType,
  PrintPayload,
  PrinterConnection,
  PrintResult,
  PrintAdapterErrorPayload,
} from './types'
import {
  createConnectionError,
  createTimeoutError,
  createDeviceError,
  createUnsupportedError,
} from './errors'

export type MockAdapterMode =
  | 'success'
  | 'timeout'
  | 'disconnect'
  | 'paper_out'
  | 'unsupported'
  | 'custom_error'

export interface MockAdapterOptions {
  mode?: MockAdapterMode
  delayMs?: number
  simulateDeviceAck?: boolean
  customError?: PrintAdapterErrorPayload
  supported?: boolean
}

export class MockPrintAdapter implements PrintAdapter {
  public readonly type: AdapterType = 'mock'
  public readonly name: string = 'Mock Thermal Printer Adapter'

  private mode: MockAdapterMode
  private delayMs: number
  private simulateDeviceAck: boolean
  private customError?: PrintAdapterErrorPayload
  private supported: boolean

  public history: Array<{
    payload: PrintPayload
    connection: PrinterConnection
    dispatched_at: string
  }> = []

  constructor(options?: MockAdapterOptions) {
    this.mode = options?.mode || 'success'
    this.delayMs = options?.delayMs ?? 0
    this.simulateDeviceAck = options?.simulateDeviceAck ?? true
    this.customError = options?.customError
    this.supported = options?.supported ?? true
  }

  public setMode(mode: MockAdapterMode): void {
    this.mode = mode
  }

  public setDelay(delayMs: number): void {
    this.delayMs = delayMs
  }

  public setSupported(supported: boolean): void {
    this.supported = supported
  }

  public setCustomError(error: PrintAdapterErrorPayload): void {
    this.customError = error
  }

  public clearHistory(): void {
    this.history = []
  }

  public isSupported(): boolean {
    return this.supported
  }

  public async print(
    payload: PrintPayload,
    connection: PrinterConnection
  ): Promise<PrintResult> {
    const now = new Date().toISOString()
    this.history.push({
      payload,
      connection,
      dispatched_at: now,
    })

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    }

    if (!this.supported || this.mode === 'unsupported') {
      const err = createUnsupportedError(
        'mock',
        'Mock adapter configured as unsupported in current environment.'
      )
      return {
        success: false,
        adapter_type: 'mock',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    switch (this.mode) {
      case 'timeout': {
        const err = createTimeoutError('mock', connection.timeout_ms || 3000, {
          target_station: connection.station,
        })
        return {
          success: false,
          adapter_type: 'mock',
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: err.message,
          error: err.toJSON(),
        }
      }

      case 'disconnect': {
        const err = createConnectionError(
          'mock',
          `Connection refused or host unreachable at ${connection.host || 'unknown'}:${connection.port || 9100}`
        )
        return {
          success: false,
          adapter_type: 'mock',
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: err.message,
          error: err.toJSON(),
        }
      }

      case 'paper_out': {
        const err = createDeviceError(
          'mock',
          'PAPER_OUT',
          'Thermal paper roll depleted (Paper Out Sensor triggered).'
        )
        return {
          success: false,
          adapter_type: 'mock',
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: err.message,
          error: err.toJSON(),
        }
      }

      case 'custom_error': {
        return {
          success: false,
          adapter_type: 'mock',
          device_ack_received: false,
          completed_at: new Date().toISOString(),
          message: this.customError?.message || 'Custom mock error occurred.',
          error: this.customError,
        }
      }

      case 'success':
      default: {
        const bytesSent = Buffer.byteLength(payload.raw_text, 'utf-8')
        return {
          success: true,
          adapter_type: 'mock',
          bytes_sent: bytesSent,
          device_ack_received: this.simulateDeviceAck,
          completed_at: new Date().toISOString(),
          message: `Mock thermal print executed successfully (${bytesSent} bytes).`,
          error: null,
        }
      }
    }
  }
}
