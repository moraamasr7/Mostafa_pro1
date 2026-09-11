/**
 * ======================================================================================
 * PRINTER STATION CONFIGURATION
 * Mostafa Elgazar Restaurant Operations System
 * 
 * Maps logical physical stations (KITCHEN_80MM, CASHIER_80MM)
 * to physical adapter connection configurations.
 * ======================================================================================
 */

import { PrintStation } from '../../../types/printing'
import { PrinterConnection } from '../adapters/types'
import { StationConnectionConfig } from './types'

/**
 * Default station configuration:
 * Defaults to 'mock' in non-browser/test environments,
 * or 'browser' / 'network_tcp' when configured.
 */
export const DEFAULT_STATION_CONFIG: StationConnectionConfig = {
  KITCHEN_80MM: {
    adapter_type: 'mock',
    station: 'KITCHEN_80MM',
    host: '192.168.1.201',
    port: 9100,
    timeout_ms: 4000,
  },
  CASHIER_80MM: {
    adapter_type: 'mock',
    station: 'CASHIER_80MM',
    host: '192.168.1.200',
    port: 9100,
    timeout_ms: 4000,
  },
}

export class StationConfigManager {
  private config: StationConnectionConfig

  constructor(initialConfig: StationConnectionConfig = DEFAULT_STATION_CONFIG) {
    this.config = { ...initialConfig }
  }

  public getConnection(
    station: PrintStation,
    override?: Partial<StationConnectionConfig>
  ): PrinterConnection {
    if (override && override[station]) {
      return override[station]!
    }
    return this.config[station]
  }

  public setStationConnection(station: PrintStation, connection: PrinterConnection): void {
    this.config = {
      ...this.config,
      [station]: connection,
    }
  }

  public reset(): void {
    this.config = { ...DEFAULT_STATION_CONFIG }
  }
}

export const globalStationConfig = new StationConfigManager()
