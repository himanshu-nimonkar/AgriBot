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
        setFeedback(prev => ({
            ...prev,
            [messageIndex]: feedback[messageIndex] === type ? null : type
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

                            {/* Feedback buttons for assistant messages */}
                            {message.role === 'assistant' && (
                                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-white/10">
                                    <span className="text-[10px] text-gray-500">Was this helpful?</span>
                                    <button
                                        onClick={() => handleFeedback(index, 'up')}
                                        className={`p-1.5 rounded-lg hover:bg-white/10 transition-all ${
                                            feedback[index] === 'up' ? 'text-green-400 bg-green-400/10' : 'text-gray-400 hover:text-green-400'
                                        }`}
                                        title="Helpful"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleFeedback(index, 'down')}
                                        className={`p-1.5 rounded-lg hover:bg-white/10 transition-all ${
                                            feedback[index] === 'down' ? 'text-red-400 bg-red-400/10' : 'text-gray-400 hover:text-red-400'
                                        }`}
                                        title="Not helpful"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                                        </svg>
                                    </button>
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
