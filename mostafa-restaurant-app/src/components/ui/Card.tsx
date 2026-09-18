'use client'

import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: 'default' | 'highlight' | 'danger' | 'flat'
  noPadding?: boolean
}

export function Card({
  children,
  variant = 'default',
  noPadding = false,
  className = '',
  ...props
}: CardProps) {
  const variantClasses = {
    default: 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-sm',
    highlight: 'bg-zinc-900 border-amber-500/40 text-zinc-100 shadow-md',
    danger: 'bg-red-950/30 border-red-800/50 text-red-100',
    flat: 'bg-zinc-900/40 border-zinc-800/60 text-zinc-200',
  }

  return (
    <div
      className={`rounded-2xl border transition-all ${variantClasses[variant]} ${
        noPadding ? '' : 'p-4 sm:p-5'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
