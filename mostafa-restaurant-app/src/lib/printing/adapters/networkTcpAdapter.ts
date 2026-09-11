/**
 * ======================================================================================
 * NETWORK TCP ESC/POS ADAPTER (RAW PORT 9100)
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Communicates with LAN Thermal Printers (Kitchen / Cashier 80mm) over port 9100.
 * Operates in Node.js server environments or Edge print bridges.
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
  createConnectionError,
  createTimeoutError,
  createUnsupportedError,
  createFatalError,
} from './errors'

export class NetworkTcpAdapter implements PrintAdapter {
  public readonly type: AdapterType = 'network_tcp'
  public readonly name: string = 'Network TCP 9100 ESC/POS Adapter'

  public isSupported(): boolean {
    // Requires Node.js environment with net module
    return typeof process !== 'undefined' && process.versions != null && process.versions.node != null
  }

  public async print(
    payload: PrintPayload,
    connection: PrinterConnection
  ): Promise<PrintResult> {
    if (!this.isSupported()) {
      const err = createUnsupportedError(
        'network_tcp',
        'Direct TCP socket printing requires a Node.js runtime environment.'
      )
      return {
        success: false,
        adapter_type: 'network_tcp',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    const host = connection.host
    const port = connection.port || 9100
    const timeoutMs = connection.timeout_ms || 5000

    if (!host) {
      const err = createFatalError('network_tcp', 'Network printer IP/host must be specified in connection.')
      return {
        success: false,
        adapter_type: 'network_tcp',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    try {
      // Dynamic import of net to keep bundle isomorphic
      const net = await import('net')

      return await new Promise<PrintResult>((resolve) => {
        let socket: any = null
        let isResolved = false

        const cleanup = () => {
          if (socket) {
            socket.removeAllListeners()
            socket.destroy()
            socket = null
          }
        }

        const safeResolve = (result: PrintResult) => {
          if (!isResolved) {
            isResolved = true
            cleanup()
            resolve(result)
          }
        }

        socket = new net.Socket()
        socket.setTimeout(timeoutMs)

        socket.on('timeout', () => {
          const err = createTimeoutError('network_tcp', timeoutMs, { host, port })
          safeResolve({
            success: false,
            adapter_type: 'network_tcp',
            device_ack_received: false,
            completed_at: new Date().toISOString(),
            message: err.message,
            error: err.toJSON(),
          })
        })

        socket.on('error', (socketErr: any) => {
          const err = createConnectionError(
            'network_tcp',
            `TCP socket error connecting to ${host}:${port}: ${socketErr?.message || 'Connection refused'}`,
            { host, port, original_error: socketErr?.message }
          )
          safeResolve({
            success: false,
            adapter_type: 'network_tcp',
            device_ack_received: false,
            completed_at: new Date().toISOString(),
            message: err.message,
            error: err.toJSON(),
          })
        })

        socket.connect(port, host, () => {
          // Prepare bytes: prefer pre-encoded ESC/POS bytes if present, otherwise raw utf-8 text
          const dataBuffer = payload.escpos_bytes
            ? Buffer.from(payload.escpos_bytes)
            : Buffer.from(payload.raw_text, 'utf-8')

          socket.write(dataBuffer, (writeErr: any) => {
            if (writeErr) {
              const err = createConnectionError(
                'network_tcp',
                `Failed writing ESC/POS stream to ${host}:${port}: ${writeErr.message}`,
                { host, port }
              )
              safeResolve({
                success: false,
                adapter_type: 'network_tcp',
                device_ack_received: false,
                completed_at: new Date().toISOString(),
                message: err.message,
                error: err.toJSON(),
              })
              return
            }

            // Successfully pushed to printer buffer
            safeResolve({
              success: true,
              adapter_type: 'network_tcp',
              bytes_sent: dataBuffer.length,
              device_ack_received: true,
              completed_at: new Date().toISOString(),
              message: `Successfully transmitted ${dataBuffer.length} bytes to ${host}:${port}`,
              error: null,
            })
          })
        })
      })
    } catch (importErr: any) {
      const err = createFatalError('network_tcp', `Unable to initialize TCP socket: ${importErr?.message}`)
      return {
        success: false,
        adapter_type: 'network_tcp',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }
  }
}
