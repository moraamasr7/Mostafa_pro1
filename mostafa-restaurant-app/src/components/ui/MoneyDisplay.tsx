'use client'

import React from 'react'

interface MoneyDisplayProps {
  amount: number
  currency?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'emerald' | 'amber' | 'red' | 'white' | 'zinc'
  className?: string
  showSign?: boolean
}

export function MoneyDisplay({
  amount = 0,
  currency = 'ج.م',
  size = 'md',
  variant = 'white',
  className = '',
  showSign = false,
}: MoneyDisplayProps) {
  const formattedAmount = (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-bold',
    lg: 'text-base sm:text-lg font-black',
    xl: 'text-xl sm:text-2xl font-black',
  }

  const variantClasses = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    white: 'text-white',
    zinc: 'text-zinc-400',
  }

  const sign = showSign && amount > 0 ? '+' : ''

  return (
    <span
      className={`font-mono inline-flex items-center gap-1 leading-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      dir="ltr"
    >
      <span>{sign}{formattedAmount}</span>
      <span className="text-[11px] font-sans font-medium text-zinc-400">{currency}</span>
    </span>
  )
}
