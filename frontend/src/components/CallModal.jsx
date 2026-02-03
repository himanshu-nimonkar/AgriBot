import { Phone, X } from 'lucide-react'

function CallModal({ isOpen, onClose, onShowToast }) {
    if (!isOpen) return null

    const handleCall = () => {
        // Simple check for desktop/laptop screen width
        const isDesktop = window.innerWidth > 768

        if (isDesktop) {
            if (onShowToast) {
                onShowToast({ 
                    message: "Desktop Calling Unavailable. Please dial manually.", 
                    type: "warning" 
                })
            } else {
                 alert("⚠️ Desktop Calling Unavailable\n\nPlease dial +1 530-508-3120 manually.")
            }
            return
        }

        window.location.href = 'tel:+15305083120'
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-card w-full max-w-sm p-6 relative animate-in fade-in zoom-in duration-200 border-emerald-500/30 shadow-2xl shadow-emerald-900/40">

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
                        <Phone size={32} className="text-emerald-400" />
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">Connect with Agent</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            <span className="md:hidden">Tap below to call our AI Agent securely.</span>
                            <span className="hidden md:block text-amber-400/90 text-xs mb-2">
                                Desktop calling limited. Please dial manually:
                            </span>
                            <br /><span className="text-emerald-300 font-mono font-bold text-xl">+1 (530) 508 3120</span>
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full pt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCall}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 transition-colors text-sm font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                            <Phone size={16} />
                            <span>Start Call</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CallModal
