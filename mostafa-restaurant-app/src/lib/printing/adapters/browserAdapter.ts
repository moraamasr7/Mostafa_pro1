/**
 * ======================================================================================
 * BROWSER PRINT ADAPTER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Standard browser printing fallback (window.print / hidden iframe).
 * Uses CSS 80mm thermal styles from templates layer.
 * ======================================================================================
 */

import {
  PrintAdapter,
  AdapterType,
  PrintPayload,
  PrinterConnection,
  PrintResult,
} from './types'
import { createUnsupportedError, createFatalError } from './errors'

export class BrowserPrintAdapter implements PrintAdapter {
  public readonly type: AdapterType = 'browser'
  public readonly name: string = 'Browser Print (Thermal 80mm CSS)'

  public isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.print === 'function'
  }

  public async print(
    payload: PrintPayload,
    connection: PrinterConnection
  ): Promise<PrintResult> {
    if (!this.isSupported()) {
      const err = createUnsupportedError(
        'browser',
        'Browser printing is not available in non-browser / server-side environment.'
      )
      return {
        success: false,
        adapter_type: 'browser',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    if (!payload.html && !payload.raw_text) {
      const err = createFatalError('browser', 'Payload must contain HTML or raw text to print.')
      return {
        success: false,
        adapter_type: 'browser',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }

    try {
      // In browser runtime, renders into a hidden print iframe to prevent UI interruption
      const printIframe = window.document.createElement('iframe')
      printIframe.style.position = 'fixed'
      printIframe.style.right = '0'
      printIframe.style.bottom = '0'
      printIframe.style.width = '0'
      printIframe.style.height = '0'
      printIframe.style.border = '0'
      window.document.body.appendChild(printIframe)

      const doc = printIframe.contentWindow?.document
      if (!doc) {
        throw new Error('Could not access print iframe document.')
      }

      const content = payload.html || `<pre>${payload.raw_text}</pre>`
      doc.open()
      doc.write(content)
      doc.close()

      // Give browser time to render stylesheets before opening print dialog
      await new Promise((resolve) => setTimeout(resolve, 100))

      printIframe.contentWindow?.focus()
      printIframe.contentWindow?.print()

      // Cleanup iframe after print
      setTimeout(() => {
        if (printIframe.parentNode) {
          printIframe.parentNode.removeChild(printIframe)
        }
      }, 1000)

      return {
        success: true,
        adapter_type: 'browser',
        device_ack_received: false, // Browser does not return physical hardware ack
        completed_at: new Date().toISOString(),
        message: 'Dispatched to browser print dialog.',
        error: null,
      }
    } catch (error: any) {
      const err = createFatalError('browser', error?.message || 'Failed to dispatch browser print.')
      return {
        success: false,
        adapter_type: 'browser',
        device_ack_received: false,
        completed_at: new Date().toISOString(),
        message: err.message,
        error: err.toJSON(),
      }
    }
  }
}
