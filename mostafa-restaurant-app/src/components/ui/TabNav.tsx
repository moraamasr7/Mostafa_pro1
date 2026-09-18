'use client'

import React from 'react'

export interface TabItem {
  id: string
  label: string
  count?: number
  icon?: string
}

interface TabNavProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export function TabNav({ tabs, activeTab, onChange, className = '' }: TabNavProps) {
  return (
    <div
      className={`flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800 overflow-x-auto select-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-amber-600 text-white shadow-xs font-black'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[11px] font-mono ${
                  isActive
                    ? 'bg-amber-800 text-white'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
