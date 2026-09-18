'use client'

import React, { forwardRef, InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="w-full space-y-1 text-right">
        {label && (
          <label className="block text-xs font-bold text-zinc-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full bg-zinc-800 border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500 transition-colors disabled:opacity-50 ${
            error ? 'border-red-500 focus:border-red-500' : 'border-zinc-700'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        {hint && !error && <p className="text-[11px] text-zinc-400">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
