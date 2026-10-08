import { Mic, MicOff, Phone, PhoneOff, PhoneIncoming, X, Headphones } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useVoiceCall from '../hooks/useVoiceCall'

const DIAL_IN = import.meta.env.VITE_PHONE_NUMBER || ''
const fmtPhone = (n) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1 ($1) $2-$3')

const STATUS_LABEL = {
    idle: 'Ready to call',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking…'
}

/**
 * Talk to the AgriBot agent from the browser/PWA. Audio goes straight to Cloudflare
 * (Workers AI speech-to-text + Llama + text-to-speech); no phone carrier or tunnel involved.
 */
function VoiceCall({ isOpen, onClose, agentUrl, sessionId, accessCode, onContext, onCallEnded, onShowToast }) {
    const call = useVoiceCall({
        agentUrl,
        sessionId,
        accessCode,
        onContext,
        onNotice: (n) => onShowToast?.({ message: n.text, type: 'warning' })
    })

    const close = () => {
        if (call.inCall) {
            onCallEnded?.(call.transcript)
            call.endCall()
        }
        onClose()
    }

    const hangUp = () => {
        onCallEnded?.(call.transcript)
        call.endCall()
    }

    const last = [...call.transcript].reverse()
    const lastAssistant = last.find((m) => m.role === 'assistant')
    const lastUser = last.find((m) => m.role === 'user')
    const label = call.inCall && call.status === 'idle' ? 'Connecting…' : (STATUS_LABEL[call.status] || call.status)
    const ring = call.status === 'listening' ? Math.min(1, call.level * 8) : call.status === 'speaking' ? 0.6 : 0

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black-forest/30 backdrop-blur-md"
                        onClick={close}
                        aria-hidden="true"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        className="relative clay-card-static w-full max-w-sm p-6 bg-[#f8f4e8]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="voice-call-title"
                    >
                        <button
                            onClick={close}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-black-forest/40 hover:text-black-forest hover:bg-black-forest/5 transition-colors"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex flex-col items-center text-center space-y-4">
                            <h3 id="voice-call-title" className="text-lg font-bold text-black-forest">Talk to AgriBot</h3>

                            {!agentUrl ? (
                                <p className="text-sm text-black-forest/70 leading-relaxed">
                                    Voice isn’t connected yet. Open this page from your AgriBot Cloudflare URL
                                    (or add <code>?agent_url=https://your-worker.workers.dev</code> once).
                                </p>
                            ) : (
                                <>
                                    <div className="relative w-28 h-28 flex items-center justify-center">
                                        <motion.div
                                            className="absolute inset-0 rounded-full bg-copperwood/20"
                                            animate={{ scale: 1 + ring * 0.45, opacity: call.inCall ? 0.9 : 0.4 }}
                                            transition={{ type: 'spring', damping: 14, stiffness: 180 }}
                                        />
                                        <div className="relative w-20 h-20 rounded-full bg-copperwood/15 flex items-center justify-center shadow-clay-sm">
                                            <Phone size={30} className="text-copperwood" />
                                        </div>
                                    </div>

                                    <div className="text-sm font-semibold text-black-forest" aria-live="polite">{label}</div>

                                    <div className="w-full min-h-[84px] text-left text-sm space-y-2">
                                        {call.interim && <p className="italic text-black-forest/60">“{call.interim}”</p>}
                                        {!call.interim && lastUser && <p className="text-black-forest/60">You: {lastUser.text}</p>}
                                        {lastAssistant && <p className="text-black-forest">{lastAssistant.text}</p>}
                                        {!call.inCall && !lastAssistant && (
                                            <p className="text-black-forest/60 text-center">
                                                Tap Start Call and ask about weather, irrigation, pests or your field.
                                            </p>
                                        )}
                                    </div>

                                    {call.notice && <p className="text-xs text-amber-700 bg-amber-100/60 rounded-lg px-3 py-2">{call.notice}</p>}
                                    {call.error && <p className="text-xs text-red-700 bg-red-100/60 rounded-lg px-3 py-2">{call.error}</p>}

                                    <div className="grid grid-cols-2 gap-3 w-full pt-1">
                                        {!call.inCall ? (
                                            <motion.button
                                                whileTap={{ scale: 0.95 }}
                                                onClick={call.startCall}
                                                className="col-span-2 px-4 py-3 rounded-xl clay-primary text-sm font-bold flex items-center justify-center gap-2"
                                            >
                                                <Phone size={16} /> Start Call
                                            </motion.button>
                                        ) : (
                                            <>
                                                <motion.button
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={call.toggleMute}
                                                    className="px-4 py-3 rounded-xl clay-button text-black-forest/80 text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
                                                    {call.muted ? 'Unmute' : 'Mute'}
                                                </motion.button>
                                                <motion.button
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={hangUp}
                                                    className="px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                                                >
                                                    <PhoneOff size={16} /> End
                                                </motion.button>
                                            </>
                                        )}
                                    </div>

                                    {DIAL_IN && (
                                        <a
                                            href={`tel:${DIAL_IN}`}
                                            className="w-full px-4 py-2.5 rounded-xl clay-button text-black-forest/80 text-sm font-medium flex items-center justify-center gap-2"
                                        >
                                            <PhoneIncoming size={16} /> No internet? Dial {fmtPhone(DIAL_IN)}
                                        </a>
                                    )}

                                    <p className="text-[11px] text-black-forest/50 flex items-center gap-1.5 justify-center">
                                        <Headphones size={12} /> Earbuds work best in noisy fields. Just talk over it to interrupt.
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default VoiceCall
