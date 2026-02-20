import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const Toast = ({ message, type = 'info', onClose, duration = 3000, action }) => {
    const [progress, setProgress] = useState(100)

    useEffect(() => {
        if (!message) return
        setProgress(100)
        const start = Date.now()
        const timer = setInterval(() => {
            const elapsed = Date.now() - start
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
            setProgress(remaining)
            if (remaining <= 0) {
                clearInterval(timer)
                onClose && onClose()
            }
        }, 30)
        return () => clearInterval(timer)
    }, [message, duration, onClose])

    if (!message) return null

    const styles = {
        info: { bg: 'bg-[#f8f4e8] border-[#d4cdb8] text-black-forest', bar: 'bg-olive-leaf' },
        error: { bg: 'bg-red-50 border-red-200 text-red-800', bar: 'bg-red-500' },
        success: { bg: 'bg-[#f4f6ef] border-olive-leaf/30 text-olive-leaf', bar: 'bg-olive-leaf' },
        warning: { bg: 'bg-[#fef9ee] border-sunlit-clay/40 text-copperwood', bar: 'bg-sunlit-clay' },
    }

    const icons = {
        info: <Info size={16} className="text-olive-leaf" />,
        error: <AlertCircle size={16} className="text-red-500" />,
        success: <CheckCircle size={16} className="text-olive-leaf" />,
        warning: <AlertCircle size={16} className="text-sunlit-clay" />,
    }

    const s = styles[type] || styles.info

    return (
        <AnimatePresence>
            <div className="fixed top-4 right-4 z-[20000]" role="alert" aria-live="polite">
                <motion.div
                    initial={{ x: 100, opacity: 0, scale: 0.9 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    exit={{ x: 100, opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className={`flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl border shadow-clay-sm relative overflow-hidden min-w-[260px] ${s.bg}`}
                >
                    {icons[type]}
                    <span className="text-sm font-medium flex-1">{message}</span>
                    {/* Action button */}
                    {action && (
                        <motion.button
                            whileTap={{ scale: 0.92 }}
                            onClick={() => {
                                action.onClick?.()
                                onClose?.()
                            }}
                            className="text-xs font-bold underline underline-offset-2 shrink-0 hover:opacity-80 transition-opacity"
                        >
                            {action.label}
                        </motion.button>
                    )}
                    <button
                        onClick={() => onClose && onClose()}
                        className="p-1 rounded-lg hover:bg-black-forest/5 transition-colors"
                        aria-label="Dismiss notification"
                    >
                        <X size={14} className="opacity-40" />
                    </button>
                    {/* Auto-dismiss progress bar */}
                    <div className="absolute bottom-0 left-0 w-full h-[2px] bg-black-forest/5">
                        <div
                            className={`h-full ${s.bar} transition-none rounded-full`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

export default Toast
