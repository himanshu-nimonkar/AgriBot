import { useRef, useEffect } from 'react'

function ConversationStream({ messages, isThinking }) {
    const bottomRef = useRef(null)

    // Auto-scroll to bottom when new messages arrive
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

    return (
        <div className="glass-card p-6 flex flex-col h-[400px]">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <span>💬</span>
                Conversation Stream
                {isThinking && (
                    <span className="text-xs font-normal text-agri-400 animate-pulse ml-2">
                        AI is analyzing...
                    </span>
                )}
            </h2>

            <div className="flex-1 overflow-y-auto space-y-4">
                {messages.length === 0 && !isThinking && (
                    <div className="text-gray-400 text-center py-12">
                        <p className="text-4xl mb-4">🌾</p>
                        <p>Ask a question about your crops</p>
                        <p className="text-sm mt-2 text-gray-500">
                            Try: "Should I irrigate my almonds today?"
                        </p>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === 'user'
                                    ? 'bg-agri-600 text-white'
                                    : 'bg-gray-700/50 text-gray-100'
                                }`}
                        >
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {message.content}
                            </p>

                            {/* Show sources if available */}
                            {message.sources && message.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/20">
                                    <p className="text-[10px] text-gray-300">
                                        📚 Sources: {message.sources.join(', ')}
                                    </p>
                                </div>
                            )}

                            <p className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-agri-200' : 'text-gray-500'
                                }`}>
                                {formatTime(message.timestamp)}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Thinking indicator */}
                {isThinking && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-gray-700/50 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="typing-indicator">
                                    <span className="inline-block w-2 h-2 bg-agri-400 rounded-full"></span>
                                    <span className="inline-block w-2 h-2 bg-agri-400 rounded-full"></span>
                                    <span className="inline-block w-2 h-2 bg-agri-400 rounded-full"></span>
                                </div>
                                <span className="text-sm text-gray-400">
                                    Analyzing weather, satellite, and research data...
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Voice Call Info */}
            <div className="mt-4 pt-4 border-t border-gray-700/50">
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>📞 Voice: +1 (530) 508-3120</span>
                    <span>Powered by Vapi.ai</span>
                </div>
            </div>
        </div>
    )
}

export default ConversationStream
