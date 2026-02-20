import { Phone, X, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

function CallModal({ isOpen, onClose, onShowToast }) {
    const [copied, setCopied] = useState(false)
    const phoneNumber = '+1 (530) 508 3120'
    const phoneRaw = '+15305083120'

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(phoneRaw)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            onShowToast?.({ message: 'Failed to copy number', type: 'error' })
        }
    }

    const handleCall = () => {
        const isDesktopScreen = window.innerWidth > 768
        if (isDesktopScreen) {
            onShowToast?.({
                message: "Desktop Calling Unavailable. Please dial manually.",
                type: "warning"
            })
            return
        }
        window.location.href = `tel:${phoneRaw}`
        onClose()
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop blur-in */}
                    <motion.div
                        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                        animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-black-forest/25"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        className="relative clay-card-static w-full max-w-sm p-6 bg-[#f8f4e8]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="call-modal-title"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-black-forest/40 hover:text-black-forest hover:bg-black-forest/5 transition-colors"
                            aria-label="Close modal"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex flex-col items-center text-center space-y-4">
                            <motion.div
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
                                className="w-16 h-16 rounded-full bg-copperwood/10 flex items-center justify-center shadow-clay-sm"
                            >
                                <Phone size={28} className="text-copperwood" />
                            </motion.div>

                            <div>
                                <h3 id="call-modal-title" className="text-lg font-bold text-black-forest mb-2 text-shadow-subtle">
                                    Connect with Agent
                                </h3>
                                <p className="text-sm text-black-forest/60 leading-relaxed">
                                    <span className="md:hidden">Tap below to call our AI Agent securely.</span>
                                    <span className="hidden md:block text-sunlit-clay text-xs mb-2">
                                        Desktop calling limited. Please dial manually:
                                    </span>
                                </p>
                            </div>

                            {/* Phone number with copy */}
                            <button
                                onClick={handleCopy}
                                className="group flex items-center gap-2 px-4 py-2 rounded-xl clay-input cursor-pointer transition-all hover:shadow-clay-sm"
                                aria-label={copied ? 'Phone number copied' : 'Copy phone number'}
                            >
                                <span className={`font-mono font-bold text-xl transition-colors ${copied ? 'text-olive-leaf' : 'text-copperwood'}`}>
                                    {phoneNumber}
                                </span>
                                {copied ? (
                                    <Check size={16} className="text-olive-leaf" />
                                ) : (
                                    <Copy size={16} className="text-black-forest/30 group-hover:text-copperwood transition-colors" />
                                )}
                            </button>
                            {copied && (
                                <motion.span
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-xs text-olive-leaf font-medium"
                                >
                                    Copied to clipboard!
                                </motion.span>
                            )}

                            <div className="grid grid-cols-2 gap-3 w-full pt-2">
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onClose}
                                    className="px-4 py-2.5 rounded-xl clay-button text-black-forest/70 transition-colors text-sm font-medium"
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleCall}
                                    className="px-4 py-2.5 rounded-xl clay-primary text-sm font-bold flex items-center justify-center gap-2"
                                >
                                    <Phone size={16} />
                                    <span>Start Call</span>
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default CallModal
