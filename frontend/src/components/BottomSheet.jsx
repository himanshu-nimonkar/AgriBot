import { useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function BottomSheet({ isOpen, onClose, title, children }) {
    const sheetRef = useRef(null)
    const dragStartY = useRef(0)

    const handleDragEnd = useCallback((_, info) => {
        if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose()
        }
    }, [onClose])

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black-forest/25 backdrop-blur-sm z-[999]"
                        onClick={onClose}
                    />
                    <motion.div
                        ref={sheetRef}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                        className="fixed bottom-0 left-0 right-0 z-[1000] bg-[var(--clay-surface)] rounded-t-3xl shadow-clay-heavy max-h-[85vh] overflow-hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                            <div className="w-10 h-1 bg-black-forest/15 rounded-full" />
                        </div>

                        {/* Header */}
                        {title && (
                            <div className="px-5 pb-3 border-b border-black-forest/5">
                                <h3 className="text-sm font-bold text-black-forest">{title}</h3>
                            </div>
                        )}

                        {/* Content */}
                        <div className="overflow-y-auto max-h-[calc(85vh-60px)] p-4">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

export default BottomSheet
