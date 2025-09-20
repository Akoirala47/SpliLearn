import { motion } from 'framer-motion'

type Props = {
  children: React.ReactNode
  label?: string
  className?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function PrimaryButton({ children, label, className = '', onClick, disabled, type = 'button' }: Props) {
  return (
    <motion.button
      whileHover={{ y: -3, boxShadow: '0 12px 40px rgba(78,154,241,0.08)' }}
      whileTap={{ scale: 0.98 }}
      className={`relative overflow-hidden rounded-2xl px-5 py-2.5 bg-white/5 backdrop-blur-md ${className}`}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      type={type}
    >
      <span className="absolute -inset-px rounded-2xl opacity-70 blur-sm" style={{ backgroundImage: 'var(--gradient)' }} />
      <span className="relative text-sm font-semibold text-[#0F1724] dark:text-white mix-blend-normal">{children}</span>
    </motion.button>
  )
}


