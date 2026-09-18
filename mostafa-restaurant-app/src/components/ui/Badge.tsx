'use client'

import React from 'react'

export type BadgeVariant =
  | 'ready'
  | 'processing'
  | 'delivery'
  | 'completed'
  | 'cancelled'
  | 'danger'
  | 'neutral'
  | 'open'
  | 'closed'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  icon?: React.ReactNode
  size?: 'sm' | 'md'
  dot?: boolean
}

export function Badge({
  children,
  variant = 'neutral',
  icon,
  size = 'md',
  dot = false,
}: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    ready: 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50',
    processing: 'bg-amber-950/80 text-amber-300 border-amber-600/50',
    delivery: 'bg-blue-950/80 text-blue-300 border-blue-600/50',
    completed: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    cancelled: 'bg-red-950/80 text-red-300 border-red-700/50',
    danger: 'bg-red-950/80 text-red-200 border-red-600/60',
    neutral: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60',
    open: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/70',
    closed: 'bg-zinc-900 text-zinc-400 border-zinc-800',
  }

  const dotClasses: Record<BadgeVariant, string> = {
    ready: 'bg-emerald-400',
    processing: 'bg-amber-400 animate-pulse',
    delivery: 'bg-blue-400 animate-pulse',
    completed: 'bg-zinc-400',
    cancelled: 'bg-red-400',
    danger: 'bg-red-400 animate-pulse',
    neutral: 'bg-zinc-400',
    open: 'bg-emerald-400 animate-pulse',
    closed: 'bg-zinc-500',
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-lg border ${variantClasses[variant]} ${sizeClasses}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClasses[variant]}`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  )
}
