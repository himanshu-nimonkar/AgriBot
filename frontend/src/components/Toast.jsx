import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { useEffect } from 'react'

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                onClose && onClose()
            }, duration)
            return () => clearTimeout(timer)
        }
    }, [message, duration, onClose])

    if (!message) return null

    const bgColors = {
        info: 'bg-slate-800 border-slate-700',
        error: 'bg-red-900/80 border-red-700',
        success: 'bg-emerald-900/80 border-emerald-700',
        warning: 'bg-amber-900/80 border-amber-700'
    }

    const icons = {
        info: <Info size={16} className="text-blue-400" />,
        error: <AlertCircle size={16} className="text-red-400" />,
        success: <CheckCircle size={16} className="text-emerald-400" />,
        warning: <AlertCircle size={16} className="text-amber-400" />
    }

    return (
        <AnimatePresence>
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[20000] pointer-events-none">
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md ${bgColors[type]}`}
                >
                    {icons[type]}
                    <span className="text-sm font-medium text-slate-200">{message}</span>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

export default Toast
