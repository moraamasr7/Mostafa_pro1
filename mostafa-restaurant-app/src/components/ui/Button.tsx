'use client'

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'touch'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      icon,
      loading = false,
      fullWidth = false,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]'

    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'bg-amber-600 hover:bg-amber-500 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500',
      secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/80 shadow-xs focus-visible:ring-2 focus-visible:ring-zinc-600',
      success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500',
      danger: 'bg-red-600 hover:bg-red-500 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-red-500',
      warning: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs focus-visible:ring-2 focus-visible:ring-amber-400',
      ghost: 'bg-transparent hover:bg-zinc-800/60 text-zinc-300 hover:text-white',
      outline: 'bg-transparent border border-zinc-700 hover:bg-zinc-800 text-zinc-200 hover:text-white',
    }

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'px-2.5 py-1.5 text-xs gap-1.5 min-h-[36px]',
      md: 'px-3.5 py-2 text-xs sm:text-sm gap-2 min-h-[42px]',
      lg: 'px-4.5 py-2.5 text-sm sm:text-base gap-2.5 min-h-[48px]',
      touch: 'px-5 py-3 text-base font-black gap-2.5 min-h-[52px]', // Dedicated for Touch/Tablet
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
        {...props}
      >
        {loading ? (
          <span className="inline-block animate-spin text-sm">⏳</span>
        ) : icon ? (
          <span className="shrink-0 text-base">{icon}</span>
        ) : null}
        <span>{children}</span>
      </button>
    )
  }
)

Button.displayName = 'Button'
