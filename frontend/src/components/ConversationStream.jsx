import { useRef, useEffect, useState } from 'react'
import { ThumbsUp, ThumbsDown, MessageCircle, Wheat, BookOpen, Phone } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const bubbleVariant = {
    initial: { opacity: 0, scale: 0.92, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 20, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95 }
}

function ConversationStream({ messages, isThinking }) {
    const bottomRef = useRef(null)
    const [feedback, setFeedback] = useState({})

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isThinking])

    const formatTime = (timestamp) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
    }

    const handleFeedback = (messageIndex, type) => {
        setFeedback(prev => ({
            ...prev,
            [messageIndex]: prev[messageIndex] === type ? null : type
        }))
    }

    return (
        <div className="clay-card-static p-5 md:p-6 flex flex-col h-[400px]" role="log" aria-label="Conversation history">
            <h2 className="text-base md:text-lg font-semibold text-black-forest flex items-center gap-2 mb-4 text-shadow-subtle">
                <MessageCircle size={18} className="text-olive-leaf" strokeWidth={1.5} />
                Conversation Stream
                {isThinking && (
                    <span className="text-xs font-normal text-olive-leaf ml-2" style={{ animation: 'breathe 2s ease-in-out infinite' }}>
                        AI is analyzing...
                    </span>
                )}
            </h2>

            <div className="flex-1 overflow-y-auto space-y-4 scrollbar-fade" aria-live="polite">
                <AnimatePresence mode="popLayout">
                    {messages.length === 0 && !isThinking && (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-black-forest/40 text-center py-12"
                        >
                            <Wheat size={36} className="text-olive-leaf/40 mb-4" strokeWidth={1.5} />
                            <p className="font-medium">Ask a question about your crops</p>
                            <p className="text-sm mt-2 text-black-forest/30">
                                Try: "Should I irrigate my almonds today?"
                            </p>
                        </motion.div>
                    )}

                    {messages.map((message, index) => (
                        <motion.div
                            key={`msg-${index}`}
                            variants={bubbleVariant}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            layout
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className="w-full max-w-[85%]">
                                <div
                                    className={`rounded-2xl px-4 py-3 ${message.role === 'user'
                                        ? 'msg-bubble-user'
                                        : 'msg-bubble-ai text-black-forest/80'
                                    }`}
                                >
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                        {message.content}
                                    </p>

                                    {message.sources && message.sources.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-black-forest/10">
                                            <p className="text-[10px] text-black-forest/40">
                                                <BookOpen size={10} className="inline mr-1" strokeWidth={1.5} /> Sources: {message.sources.join(', ')}
                                            </p>
                                        </div>
                                    )}

                                    {message.role !== 'user' && (
                                        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-black-forest/10 text-[11px] text-black-forest/40">
                                            <span className="text-[10px] text-black-forest/30">Rate reply:</span>
                                            <motion.button
                                                whileTap={{ scale: 0.85 }}
                                                onClick={() => handleFeedback(index, 'up')}
                                                className={`p-1.5 rounded-md border transition-colors ${
                                                    feedback[index] === 'up'
                                                        ? 'text-olive-leaf border-olive-leaf/40 bg-olive-leaf/10'
                                                        : 'text-black-forest/30 border-black-forest/10 hover:border-olive-leaf/30 hover:text-olive-leaf'
                                                }`}
                                                title="Good response"
                                                aria-label="Rate as good response"
                                                aria-pressed={feedback[index] === 'up'}
                                            >
                                                <ThumbsUp size={14} />
                                            </motion.button>
                                            <motion.button
                                                whileTap={{ scale: 0.85 }}
                                                onClick={() => handleFeedback(index, 'down')}
                                                className={`p-1.5 rounded-md border transition-colors ${
                                                    feedback[index] === 'down'
                                                        ? 'text-copperwood border-copperwood/40 bg-copperwood/10'
                                                        : 'text-black-forest/30 border-black-forest/10 hover:border-copperwood/30 hover:text-copperwood'
                                                }`}
                                                title="Bad response"
                                                aria-label="Rate as bad response"
                                                aria-pressed={feedback[index] === 'down'}
                                            >
                                                <ThumbsDown size={14} />
                                            </motion.button>
                                        </div>
                                    )}

                                    <p className={`text-[10px] mt-2 ${message.role === 'user' ? 'text-white/60' : 'text-black-forest/30'}`}>
                                        {formatTime(message.timestamp)}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* Thinking indicator */}
                    {isThinking && (
                        <motion.div
                            key="thinking"
                            variants={bubbleVariant}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex justify-start"
                        >
                            <div className="msg-bubble-ai rounded-2xl px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-1" aria-hidden="true">
                                        <span className="typing-dot"></span>
                                        <span className="typing-dot"></span>
                                        <span className="typing-dot"></span>
                                    </div>
                                    <span className="text-sm text-black-forest/40">
                                        Analyzing weather, satellite, and research data...
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={bottomRef} />
            </div>

            {/* Voice Call Info */}
            <div className="mt-4 pt-4 border-t border-black-forest/10">
                <div className="flex items-center justify-between text-xs text-black-forest/40">
                    <span className="flex items-center gap-1.5"><Phone size={12} strokeWidth={1.5} /> Voice: +1 (530) 508-3120</span>
                    <span>Powered by Vapi.ai</span>
                </div>
            </div>
        </div>
    )
}

export default ConversationStream
