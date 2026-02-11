/**
 * AgriBot - Deep-Ag Copilot
 * Frontend Dashboard
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { parse } from 'marked'
import { MapPin, Send, Trash2, Loader2, Phone } from 'lucide-react'
import LiveMap from './components/LiveMap'
import ErrorBoundary from './components/ErrorBoundary'
import WeatherTelemetry from './components/WeatherTelemetry'
import WhyBox from './components/WhyBox'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import Navbar from './components/Navbar'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import { v4 as uuidv4 } from 'uuid'
import SessionModal from './components/SessionModal'
import CallModal from './components/CallModal'
import Skeleton from './components/Skeleton'
import Toast from './components/Toast'
import throttle from 'lodash.throttle'

// Allow runtime override via query param (e.g., ?api_url=https://tunnel.url)
const getApiBaseUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('api_url');
    
    if (override) {
        try {
            const parsed = new URL(override, window.location.origin);
            // Only allow http/https to avoid javascript: and other unsafe schemes
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                // Use the origin + pathname (no query/fragment) as the base URL
                return parsed.origin + parsed.pathname.replace(/\/+$/, '');
            }
        } catch (e) {
            // If parsing fails, ignore the override and fall back to default
            console.warn('Invalid api_url parameter, using default');
        }
    }
    
    // Default to the Cloudflare Tunnel if in prod/preview, or localhost for dev if not set
    return import.meta.env.VITE_API_URL || 'https://waterproof-hand-andrew-segments.trycloudflare.com';
}

const API_BASE_URL = getApiBaseUrl();

// Dynamically derive WS_URL from API_BASE_URL
const getWsUrl = () => {
    // Env Var Logic Only
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

    let baseUrl = API_BASE_URL;
    if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
    } else if (!baseUrl.startsWith('http')) {
        baseUrl = `http://${baseUrl}`;
    }

    if (baseUrl.startsWith('https')) {
        return baseUrl.replace('https://', 'wss://') + '/ws/dashboard';
    } else {
        return baseUrl.replace('http://', 'ws://') + '/ws/dashboard';
    }
};

const WS_URL = getWsUrl();
window.USER_WS_URL = WS_URL; // Expose for debug probe
const RENDER_API_URL = API_BASE_URL;


// Custom UUID generator using cryptographically secure random
const generateUUID = () => {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
    // Fallback to cryptographically secure random bytes
    if (window.crypto && window.crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    }
    // Last resort fallback (should never happen in modern browsers)
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function App() {
    // Session State
    const [sessionId, setSessionId] = useState(() => {
        const stored = localStorage.getItem('ag_session_id')
        if (stored) return stored
        const newId = generateUUID()
        localStorage.setItem('ag_session_id', newId)
        return newId
    })

    // Animation Variants
    const messageVariants = {
        hidden: { opacity: 0, y: 10, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } }
    }

    const modalVariants = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 300 } },
        exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
    }

    // Persist Session ID
    useEffect(() => {
        localStorage.setItem('ag_session_id', sessionId)
    }, [sessionId])

    const [weatherData, setWeatherData] = useState(null)
    const [satelliteData, setSatelliteData] = useState(null) // Start null for skeleton state
    const [ragResults, setRagResults] = useState([])
    const [marketData, setMarketData] = useState(null)
    const [chemicalData, setChemicalData] = useState([])
    const [sources, setSources] = useState([]) // Explicit sources list
    const [messages, setMessages] = useState([])
    const [isThinking, setIsThinking] = useState(false)
    const [query, setQuery] = useState('')
    const [location, setLocation] = useState({
        lat: 38.7646,
        lon: -121.9018,
        label: 'Yolo County Center'
    })

    // Responsive State (avoid rendering hidden maps which crashes Leaflet)
    const [isDesktop, setIsDesktop] = useState(true) // Default true for SSR/init

    useEffect(() => {
        const checkDesktop = () => setIsDesktop(window.matchMedia('(min-width: 1024px)').matches)
        checkDesktop() // init
        window.addEventListener('resize', throttle(checkDesktop, 200))
        return () => window.removeEventListener('resize', checkDesktop)
    }, [])

    // UI State
    const [isCallModalOpen, setIsCallModalOpen] = useState(false)
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [toast, setToast] = useState({ message: '', type: 'info' })

    const showToast = (toastParams) => {
        setToast(toastParams)
        // Auto clear is handled by Toast component
        setTimeout(() => setToast({ message: '', type: '' }), 3000)
    }

    const chatEndRef = useRef(null)

    // Scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Auto-locate on mount
    useEffect(() => {
        // slight delay to ensure map is ready
        setTimeout(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setLocation({
                            lat: position.coords.latitude,
                            lon: position.coords.longitude,
                            label: 'Your Location'
                        })
                    },
                    (err) => console.log("Location access denied or error:", err)
                )
            }
        }, 1000)
    }, [])

    // WebSocket connection
    const { readyState, lastMessage } = useWebSocket(WS_URL, {
        shouldReconnect: () => true,
        reconnectAttempts: 10,
        reconnectInterval: 3000,
    })

    const isConnected = readyState === ReadyState.OPEN;

    // Update Title
    useEffect(() => {
        document.title = "AgriBot | Yolo County";
    }, []);

    // Handle incoming WebSocket messages
    useEffect(() => {
        if (!lastMessage) return
        try {
            const data = JSON.parse(lastMessage.data)

            // Handle different message structures
            // If direct payload
            const payload = data.payload || data

            // If Type is present
            if (data.type) {
                switch (data.type) {
                    case 'thinking':
                        setIsThinking(true)
                        break
                    case 'weather':
                        setWeatherData(payload)
                        break
                    case 'satellite':
                        if (payload && payload.ndvi_current !== undefined) {
                            setSatelliteData(payload)
                        }
                        break
                    case 'response':
                        setIsThinking(false)
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: payload.full || payload.voice,
                            sources: payload.sources,
                            timestamp: data.timestamp
                        }])

                        // Update Map if location is in payload
                        if (payload.lat && payload.lon) {
                            setLocation({
                                lat: payload.lat,
                                lon: payload.lon,
                                label: payload.location_address || 'Voice Query Location'
                            })
                            // Also update satellite data if available in voice response
                            if (payload.satellite_data) {
                                setSatelliteData(payload.satellite_data)
                            }
                        }
                        break
                }
            }
        } catch (e) {
            console.error("WS Parse Error", e)
        }
    }, [lastMessage])



    const handleResetConfirm = async () => {
        try {
            await fetch(`${RENDER_API_URL}/api/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            })

            // Generate new session
            const newId = generateUUID()
            setSessionId(newId)
            localStorage.setItem('ag_session_id', newId)

            // Clear Dashboard State
            setMessages([])
            setQuery('')
            setRagResults([])
            setSources([])
            setMarketData(null)
            setChemicalData([])

            // Reset Location to Default
            setLocation({
                lat: 38.7646,
                lon: -121.9018,
                label: 'Yolo County Center'
            })

            // Clear Weather & Satellite Data
            setWeatherData(null)
            setSatelliteData(null)

            // Trigger auto-locate to find user again
            handleLocateMe()

            setIsResetModalOpen(false)

        } catch (e) {
            console.error(e)
        }
    }

    // Locate Me
    const handleLocateMe = () => {
        if (!navigator.geolocation) {
            showToast({ message: 'Geolocation is not supported by your browser', type: 'error' })
            return
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    label: 'Current Location'
                })
            },
            (err) => showToast({ message: 'Unable to retrieve your location', type: 'error' })
        )
    }

    // Submit query
    const handleSubmit = throttle(useCallback(async (e) => {
        e.preventDefault()
        if (!query.trim()) return

        setIsThinking(true)
        const userMsg = {
            role: 'user',
            content: query,
            timestamp: new Date().toISOString()
        }
        setMessages(prev => [...prev, userMsg])
        const currentQuery = query
        setQuery('') // Clear input immediately

        try {
            const response = await fetch(`${RENDER_API_URL}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: currentQuery,
                    lat: location.lat,
                    lon: location.lon,
                    session_id: sessionId
                })
            })

            const data = await response.json()

            // Update dashboard state
            if (data.weather_data) setWeatherData(data.weather_data)
            if (data.satellite_data) setSatelliteData(data.satellite_data)
            setRagResults(data.rag_results || [])
            setSources(data.sources || [])
            setMarketData(data.market_data)
            setChemicalData(data.chemical_data || [])

            // Update map location if backend returned coordinates
            if (data.lat && data.lon) {
                setLocation({
                    lat: data.lat,
                    lon: data.lon,
                    label: data.location_address || 'New Location'
                })
            }

            setIsThinking(false)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.full_response,
                sources: data.sources,
                timestamp: data.timestamp
            }])
        } catch (error) {
            console.error(error)
            setIsThinking(false)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request.',
                timestamp: new Date().toISOString()
            }])
        }
    }, [query, location, sessionId]), 1000); // Throttle 1s

    return (
        <div className="h-[100dvh] w-screen bg-transparent text-slate-200 font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col">
            {/* Background Texture & Ambient Effects */}
            {/* Background Texture & Ambient Effects */}
            <div className="noise-bg fixed inset-0 z-0"></div>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none animate-pulse duration-[10s] fixed"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[150px] pointer-events-none animate-pulse duration-[15s] fixed"></div>
            
            {/* Toast Notification */}
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

            {/* Footer */}
            <footer className="fixed bottom-0 left-0 w-full bg-black/90 backdrop-blur-md border-t border-white/5 py-1 px-4 z-40 flex justify-between items-center text-[10px] text-slate-500">
                <span>&copy; 2024 AgriBot &bull; Yolo County</span>
                <span className="font-mono">v1.2.0</span>
            </footer>


            {/* Navbar Region - Rigid Block */}
            <div className="w-full flex-none z-50 p-4 pb-0">
                <Navbar
                    connectionStatus={isConnected ? 'connected' : 'disconnected'}
                    onCallClick={() => setIsCallModalOpen(true)}
                    onShowToast={showToast}
                />
            </div>

            {/* Main Content Area - Flexible Region */}
            <main className="relative z-10 flex-1 min-h-0 w-full max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden pb-12">

                {/* Left Column */}
                <div className="hidden lg:flex lg:col-span-7 flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-2">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex flex-col gap-6"
                    >
                        {/* Live Map */}
                        <div className="glass-card p-1.5 overflow-hidden h-[340px] shrink-0 border-emerald-500/10 relative group hover:border-emerald-500/30 transition-colors duration-500">
                            <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-slate-400">Map Unavailable (Error)</div>}>
                                {isDesktop && (
                                    <LiveMap
                                        location={location}
                                        setLocation={setLocation}
                                        satelliteData={satelliteData}
                                    />
                                )}
                            </ErrorBoundary>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                type="button"
                                onClick={handleLocateMe}
                                className="absolute bottom-5 right-5 z-[500] p-3 bg-slate-900/90 text-emerald-400 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-xl shadow-black/50 border border-white/5"
                                title="Locate Me"
                            >
                                <MapPin size={22} />
                            </motion.button>
                        </div>

                        {/* Weather Data */}
                        <div className="shrink-0">
                            <WeatherTelemetry data={weatherData} />
                        </div>
                    </motion.div>
                </div>

                {/* Mobile View - Chat First, Then Dropdowns */}
                <div className="lg:hidden flex flex-col gap-3 pb-0">

                    {/* 1. Chat (Main Priority) - Taken from Right Column logic above but simplified for mobile */}
                    <div className="flex-1 glass-card flex flex-col border-emerald-500/10 relative h-[50vh] rounded-2xl overflow-hidden">
                        {/* Header */}
                        <div className="pt-8 pb-4 px-3 border-b border-white/5 bg-gradient-to-r from-slate-900/50 to-transparent flex justify-between items-center shrink-0">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2 glow-text">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"></span>
                                Agri-Brain
                            </span>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsResetModalOpen(true)}
                                className="text-[10px] text-red-400/80 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-full border border-white/5"
                            >
                                <Trash2 size={10} />
                                RESET
                            </motion.button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar bg-slate-900/20">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                                    <p className="font-medium text-slate-300 text-sm">Ask AgriBot</p>
                                    <p className="text-[10px] mt-1 text-slate-500">Weather, Pests, Market...</p>
                                </div>
                            )}
                            <AnimatePresence mode="popLayout">
                                {messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                    >
                                        <div
                                            className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                                ? 'bg-emerald-600/20 border border-emerald-500/20 text-emerald-50'
                                                : 'bg-[#1A1A1A]/90 border border-white/10 text-slate-200'
                                                }`}
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {isThinking && (
                                <div className="flex items-center gap-1 pl-2">
                                    <div className="typing-dot w-1 h-1"></div>
                                    <div className="typing-dot w-1 h-1"></div>
                                    <div className="typing-dot w-1 h-1"></div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 bg-slate-900/80 border-t border-white/5 shrink-0">
                            <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                                <input
                                    type="text"
                                    name="mobile-chat-query"
                                    id="mobile-chat-input"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Ask a question..."
                                    className="flex-1 bg-black/40 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                <button
                                    type="submit"
                                    disabled={isThinking || !query.trim()}
                                    className="p-2.5 bg-emerald-600 text-white rounded-full shadow-lg disabled:opacity-50"
                                >
                                    {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* 2. Map Dropdown */}
                    <div className="shrink-0">
                        <details className="group glass-card overflow-hidden">
                            <summary className="list-none flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors select-none">
                                <span className="text-lg">🗺️</span>
                                <span className="text-sm font-semibold text-slate-200">Live Field Map</span>
                                <span className="ml-auto text-xs text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                            </summary>
                            <div className="h-[250px] w-full p-1 border-t border-white/5">
                                <ErrorBoundary>
                                    {!isDesktop && (
                                        <LiveMap location={location} setLocation={setLocation} satelliteData={satelliteData} />
                                    )}
                                </ErrorBoundary>
                            </div>
                        </details>
                    </div>

                    {/* 3. Weather Dropdown */}
                    <div className="shrink-0">
                        <details className="group glass-card overflow-hidden">
                            <summary className="list-none flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors select-none">
                                <span className="text-lg">🌤️</span>
                                <span className="text-sm font-semibold text-slate-200">Weather Conditions</span>
                                <span className="ml-auto text-xs text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                            </summary>
                            <div className="p-3 border-t border-white/5">
                                <WeatherTelemetry data={weatherData} />
                            </div>
                        </details>
                    </div>

                    {/* 4. Knowledge/Data Dropdown */}
                    <div className="shrink-0">
                        <details className="group glass-card overflow-hidden">
                            <summary className="list-none flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors select-none">
                                <span className="text-lg">📊</span>
                                <span className="text-sm font-semibold text-slate-200">Knowledge & Data</span>
                                <span className="ml-auto text-xs text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                            </summary>
                            <div className="h-[200px] overflow-y-auto p-1 border-t border-white/5">
                                <WhyBox
                                    results={ragResults}
                                    sources={sources}
                                    marketData={marketData}
                                    chemicalData={chemicalData}
                                    apiUrl={RENDER_API_URL}
                                />
                            </div>
                        </details>
                    </div>

                </div>

                {/* Right Column: Chat & Context (Desktop Only) */}
                <div className="hidden lg:flex lg:col-span-5 flex-col gap-4 overflow-hidden" style={{height: 'calc(100vh - 140px)'}}>
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="flex flex-col h-full gap-4 overflow-hidden"
                    >
                        {/* Chat Area */}
                        <div className="flex-1 glass-card flex flex-col border-emerald-500/10 relative min-h-[500px] md:min-h-0 rounded-2xl overflow-hidden">
                            {/* Header */}
                            <div className="pt-8 pb-6 px-4 border-b border-white/5 bg-gradient-to-r from-slate-900/50 to-transparent flex justify-between items-center shrink-0">
                                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2 glow-text">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"></span>
                                    Agri-Brain Active
                                </span>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsResetModalOpen(true)}
                                    className="text-[10px] text-red-400/80 hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                                >
                                    <Trash2 size={12} />
                                    RESET
                                </motion.button>
                            </div>

                            {/* Messages List - Premium */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-slate-900/20">
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 space-y-4">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 flex items-center justify-center border border-white/5 overflow-hidden p-2">
                                            <img src="/AgriBot.png" alt="AgriBot" className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-300">Agri-Brain Ready</p>
                                            <p className="text-xs mt-1 text-slate-500 max-w-[200px] mx-auto">Ask about weather, pests, or market prices in Yolo County.</p>
                                        </div>
                                    </div>
                                )}

                                <AnimatePresence mode="popLayout">
                                    {messages.map((msg, i) => (
                                        <motion.div
                                            key={i}
                                            variants={messageVariants}
                                            initial="hidden"
                                            animate="visible"
                                            layout
                                            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[0.92rem] leading-relaxed shadow-lg backdrop-blur-sm prose prose-invert prose-p:my-1 prose-headings:my-2 prose-strong:text-emerald-400 prose-ul:my-1 prose-li:my-0 ${msg.role === 'user'
                                                    ? 'bg-emerald-600/20 border border-emerald-500/20 text-emerald-50'
                                                    : 'bg-[#1A1A1A]/90 border border-white/10 text-slate-200'
                                                    }`}
                                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parse(msg.content)) }}
                                            />
                                            <span className="text-[10px] text-slate-500/60 mt-1.5 px-1 font-mono uppercase tracking-wide">
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                {isThinking && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-start pl-2"
                                    >
                                        <div className="bg-[#1A1A1A]/80 rounded-2xl rounded-bl-none px-4 py-4 border border-white/5 flex gap-1 items-center">
                                            <div className="typing-dot"></div>
                                            <div className="typing-dot"></div>
                                            <div className="typing-dot"></div>
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 bg-slate-900/60 backdrop-blur-md shrink-0 rounded-b-2xl border-t-0 border-white/5">
                                <form onSubmit={handleSubmit} className="relative flex items-center gap-3">
                                    <input
                                        type="text"
                                        id="chat-input"
                                        name="chat-query"
                                        autoComplete="off"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Ask your agricultural assistant..."
                                        className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-inner"
                                        autoFocus
                                    />
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}
                                        whileTap={{ scale: 0.95 }}
                                        type="submit"
                                        disabled={isThinking || !query.trim()}
                                        className="p-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                    >
                                        {isThinking ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                    </motion.button>
                                </form>
                            </div>
                        </div>

                        {/* WhyBox (Context) */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 }}
                            className="h-[220px] shrink-0"
                        >
                            <WhyBox
                                results={ragResults}
                                sources={sources}
                                marketData={marketData}
                                chemicalData={chemicalData}
                                apiUrl={RENDER_API_URL}
                            />
                        </motion.div>
                    </motion.div>
                </div>
            </main>

            <AnimatePresence>
                {isResetModalOpen && (
                    <SessionModal
                        isOpen={isResetModalOpen}
                        onClose={() => setIsResetModalOpen(false)}
                        onConfirm={handleResetConfirm}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isCallModalOpen && (
                    <CallModal
                        isOpen={isCallModalOpen}
                        onClose={() => setIsCallModalOpen(false)}
                        onShowToast={showToast}
                    />
                )}
            </AnimatePresence>

        </div>
    )
}
export default App
