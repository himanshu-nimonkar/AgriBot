import { useRef, useEffect, useState } from 'react'

function ConversationStream({ messages, isThinking }) {
    const bottomRef = useRef(null)
    const [feedback, setFeedback] = useState({})

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

    const handleFeedback = (messageIndex, type) => {
        // UI-only, mutually exclusive (toggle off if clicked again)
        setFeedback(prev => ({
            ...prev,
            [messageIndex]: prev[messageIndex] === type ? null : type
        }))
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
                        <div className="w-full max-w-[85%]">
                            <div
                                className={`rounded-2xl px-4 py-3 ${message.role === 'user'
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

                                {/* Feedback buttons for assistant/agent messages (UI-only) */}
                                {message.role !== 'user' && (
                                    <div className="flex items-center gap-3 mt-3 pt-2 border-t border-white/10 text-[11px] text-slate-300">
                                        <span className="text-[10px] text-gray-400">Rate reply:</span>
                                        <button
                                            onClick={() => handleFeedback(index, 'up')}
                                            className={`p-1.5 rounded-md border transition-colors ${
                                                feedback[index] === 'up'
                                                    ? 'text-green-300 border-green-400 bg-green-500/10'
                                                    : 'text-gray-300 border-white/10 hover:border-green-400 hover:text-green-300'
                                            }`}
                                            title="Good response"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleFeedback(index, 'down')}
                                            className={`p-1.5 rounded-md border transition-colors ${
                                                feedback[index] === 'down'
                                                    ? 'text-red-300 border-red-400 bg-red-500/10'
                                                    : 'text-gray-300 border-white/10 hover:border-red-400 hover:text-red-300'
                                            }`}
                                            title="Bad response"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                                            </svg>
                                        </button>
                                    </div>
                                )}

                                <p className={`text-[10px] mt-2 ${message.role === 'user' ? 'text-agri-200' : 'text-gray-500'
                                    }`}>
                                    {formatTime(message.timestamp)}
                                </p>
                            </div>
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
