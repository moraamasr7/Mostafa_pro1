/**
 * ======================================================================================
 * PRINT ADAPTER REGISTRY & RESOLVER
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Provides centralized resolution of PrintAdapters by type.
 * Decouples caller code from concrete adapter classes.
 * ======================================================================================
 */

import { AdapterType, PrintAdapter, PrinterConnection } from './types'
import { MockPrintAdapter } from './mockAdapter'
import { BrowserPrintAdapter } from './browserAdapter'
import { NetworkTcpAdapter } from './networkTcpAdapter'
import { WebSerialAdapter } from './webSerialAdapter'
import { RawBtIntentAdapter } from './rawBtAdapter'

export class PrintAdapterRegistry {
  private adapters = new Map<AdapterType, PrintAdapter>()

  constructor() {
    // Register standard default adapters
    this.register(new MockPrintAdapter())
    this.register(new BrowserPrintAdapter())
    this.register(new NetworkTcpAdapter())
    this.register(new WebSerialAdapter())
    this.register(new RawBtIntentAdapter())
  }

  public register(adapter: PrintAdapter): void {
    this.adapters.set(adapter.type, adapter)
  }

  public get(type: AdapterType): PrintAdapter | undefined {
    return this.adapters.get(type)
  }

  public resolve(connection: PrinterConnection): PrintAdapter {
    const adapter = this.adapters.get(connection.adapter_type)
    if (!adapter) {
      throw new Error(`No PrintAdapter registered for adapter type '${connection.adapter_type}'.`)
    }
    return adapter
  }
}

/**
 * Global singleton adapter registry
 */
export const globalPrintAdapterRegistry = new PrintAdapterRegistry()
