import { useState, useRef, useEffect, useCallback, Suspense, lazy, useMemo } from 'react'
import { parse } from 'marked'
import {
    Send,
    Trash2,
    Loader2,
    ThumbsUp,
    ThumbsDown,
    Mic,
    MicOff,
    Download,
    Wheat
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import throttle from 'lodash.throttle'
import useWebSocket, { ReadyState } from 'react-use-websocket'

import LiveMap from './components/LiveMap'
import ErrorBoundary from './components/ErrorBoundary'
import WhyBox from './components/WhyBox'
import Navbar from './components/Navbar'
import SessionModal from './components/SessionModal'
import CallModal from './components/CallModal'
import Toast from './components/Toast'
import QuickActions from './components/QuickActions'
import WeatherAlerts from './components/WeatherAlerts'
import IrrigationCalc from './components/IrrigationCalc'
import BottomNav from './components/BottomNav'
import AnomalyBadge from './components/AnomalyBadge'
import WeatherDashboard from './components/WeatherDashboard'
import FieldVision from './components/FieldVision'

const DegreeDays = lazy(() => import('./components/DegreeDays'))

const ChartSkeleton = () => (
    <div className="clay-card-static p-4">
        <div className="skeleton h-3 w-24 rounded mb-3" />
        <div className="skeleton h-28 w-full rounded-xl" />
    </div>
)

const getApiBaseUrl = () => {
    const params = new URLSearchParams(window.location.search)
    const override = params.get('api_url')

    if (override) {
        try {
            const parsed = new URL(override, window.location.origin)
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.origin + parsed.pathname.replace(/\/+$/, '')
            }
        } catch {
            console.warn('Invalid api_url parameter, using default')
        }
    }

    return import.meta.env.VITE_API_URL || 'https://waterproof-hand-andrew-segments.trycloudflare.com'
}

const API_BASE_URL = getApiBaseUrl()

const getWsUrl = () => {
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL

    let baseUrl = API_BASE_URL
    if (baseUrl.startsWith('/')) baseUrl = window.location.origin + baseUrl
    else if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`

    return baseUrl.startsWith('https')
        ? baseUrl.replace('https://', 'wss://') + '/ws/dashboard'
        : baseUrl.replace('http://', 'ws://') + '/ws/dashboard'
}

const WS_URL = getWsUrl()
window.USER_WS_URL = WS_URL

const generateUUID = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()

    if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16)
        window.crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    }

    return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const cardStagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
}

const cardItem = {
    hidden: { opacity: 0, y: 14, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }
}

const messageVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 300 } }
}

function App() {
    const [sessionId, setSessionId] = useState(() => {
        const stored = localStorage.getItem('ag_session_id')
        if (stored) return stored

        const newId = generateUUID()
        localStorage.setItem('ag_session_id', newId)
        return newId
    })

    useEffect(() => {
        localStorage.setItem('ag_session_id', sessionId)
    }, [sessionId])

    const [toast, setToast] = useState({ message: '', type: 'info' })
    const showToast = useCallback((payload) => {
        setToast(payload)
        setTimeout(() => setToast({ message: '', type: '' }), 3500)
    }, [])

    const [weatherData, setWeatherData] = useState(null)
    const [satelliteData, setSatelliteData] = useState(null)
    const [isLoadingWeather, setIsLoadingWeather] = useState(true)

    const [ragResults, setRagResults] = useState([])
    const [marketData, setMarketData] = useState(null)
    const [chemicalData, setChemicalData] = useState([])
    const [sources, setSources] = useState([])

    const [messages, setMessages] = useState([])
    const [feedbackByMessage, setFeedbackByMessage] = useState({})
    const [isThinking, setIsThinking] = useState(false)
    const [query, setQuery] = useState('')

    const [location, setLocation] = useState({ lat: 38.7646, lon: -121.9018, label: 'Yolo County (County View)', zoom: 9 })
    const [unitPreference, setUnitPreference] = useState(() => localStorage.getItem('ag_unit') || 'metric')
    const [mobileTab, setMobileTab] = useState('chat')

    const [activeMapLayer, setActiveMapLayer] = useState('ndvi')
    const [selectedNdviPoint, setSelectedNdviPoint] = useState(null)

    const [isCallModalOpen, setIsCallModalOpen] = useState(false)
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const recognitionRef = useRef(null)

    const chatEndRef = useRef(null)
    const mobileChatEndRef = useRef(null)

    useEffect(() => {
        localStorage.setItem('ag_unit', unitPreference)
    }, [unitPreference])

    const fetchLocationData = useCallback(async (lat, lon) => {
        setIsLoadingWeather(true)

        try {
            const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
            const response = await fetch(`${API_BASE_URL}/api/location/telemetry?${params.toString()}`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const payload = await response.json()

            setWeatherData(payload.weather_data || null)
            setSatelliteData(payload.satellite_data || null)
        } catch (error) {
            console.error('Failed to fetch location telemetry:', error)
            setWeatherData(null)
            setSatelliteData(null)
            showToast({
                message: 'Unable to load live telemetry for this location. Check backend/API status.',
                type: 'error'
            })
        } finally {
            setIsLoadingWeather(false)
        }
    }, [showToast])

    useEffect(() => {
        fetchLocationData(location.lat, location.lon)
    }, [location.lat, location.lon, fetchLocationData])

    useEffect(() => {
        setTimeout(() => {
            navigator.geolocation?.getCurrentPosition(
                (pos) => {
                    setLocation({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        label: 'Your Location',
                        zoom: 13
                    })
                },
                () => { }
            )
        }, 600)
    }, [])

    const { readyState, lastMessage } = useWebSocket(WS_URL, {
        shouldReconnect: () => true,
        reconnectAttempts: 10,
        reconnectInterval: 3000
    })

    const isConnected = readyState === ReadyState.OPEN

    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024)

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        document.title = 'AgriBot | Yolo County'
    }, [])

    useEffect(() => {
        if (!lastMessage) return

        try {
            const data = JSON.parse(lastMessage.data)
            const payload = data.payload || data

            if (!data.type) return

            switch (data.type) {
                case 'thinking':
                    setIsThinking(true)
                    break
                case 'weather':
                    setWeatherData(payload)
                    break
                case 'satellite':
                    if (payload?.ndvi_current !== undefined) setSatelliteData((prev) => ({ ...prev, ...payload }))
                    break
                case 'response':
                    setIsThinking(false)
                    setMessages((prev) => ([...prev, {
                        role: 'assistant',
                        content: payload.full || payload.voice,
                        sources: payload.sources,
                        timestamp: data.timestamp
                    }]))
                    if (payload.lat && payload.lon) {
                        setLocation({
                            lat: payload.lat,
                            lon: payload.lon,
                            label: payload.location_address || 'Voice Query Location',
                            zoom: 13
                        })
                    }
                    break
                default:
                    break
            }
        } catch (error) {
            console.error('WS parse error', error)
        }
    }, [lastMessage])

    const handleMessageFeedback = useCallback((index, type) => {
        setFeedbackByMessage((prev) => ({ ...prev, [index]: prev[index] === type ? null : type }))
    }, [])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
        mobileChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, isThinking])

    const handleLocateMe = useCallback(() => {
        if (!navigator.geolocation) {
            showToast({ message: 'Geolocation not supported', type: 'error' })
            return
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    label: 'Current Location',
                    zoom: 13
                })
            },
            () => showToast({ message: 'Unable to retrieve location', type: 'error' })
        )
    }, [showToast])

    const toggleVoiceInput = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

        if (!SpeechRecognition) {
            showToast({ message: 'Voice input not supported in this browser', type: 'warning' })
            return
        }

        if (!window.isSecureContext) {
            showToast({ message: 'Voice input requires HTTPS or localhost', type: 'warning' })
            return
        }

        if (isListening) {
            recognitionRef.current?.stop()
            setIsListening(false)
            return
        }

        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript
            setQuery((prev) => prev + (prev ? ' ' : '') + transcript)
            setIsListening(false)
            showToast({ message: `Heard: "${transcript.slice(0, 48)}"`, type: 'success' })
        }

        recognition.onerror = (event) => {
            setIsListening(false)
            const message = event.error === 'not-allowed'
                ? 'Microphone permission denied'
                : event.error === 'no-speech'
                    ? 'No speech detected'
                    : event.error === 'network'
                        ? 'Network error during voice input'
                        : 'Voice recognition error'
            showToast({ message, type: 'error' })
        }

        recognition.onend = () => setIsListening(false)

        recognitionRef.current = recognition
        recognition.start()
        setIsListening(true)
        showToast({ message: 'Listening...', type: 'info' })
    }, [isListening, showToast])

    const exportChat = useCallback(() => {
        if (!messages.length) {
            showToast({ message: 'No messages to export', type: 'info' })
            return
        }

        const lines = messages.map((msg) => (
            `[${msg.role === 'user' ? 'You' : 'AgriBot'}] ${new Date(msg.timestamp).toLocaleString()}\n${msg.content}\n`
        ))

        const blob = new Blob([
            `AgriBot Chat Export - ${new Date().toLocaleDateString()}\n${'='.repeat(40)}\n\n${lines.join('\n')}`
        ], { type: 'text/plain' })

        const anchor = document.createElement('a')
        anchor.href = URL.createObjectURL(blob)
        anchor.download = `agribot-chat-${Date.now()}.txt`
        anchor.click()
        URL.revokeObjectURL(anchor.href)

        showToast({ message: 'Chat exported', type: 'success' })
    }, [messages, showToast])

    const handleResetConfirm = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            })

            const newId = generateUUID()
            setSessionId(newId)
            localStorage.setItem('ag_session_id', newId)

            setMessages([])
            setQuery('')
            setRagResults([])
            setSources([])
            setMarketData(null)
            setChemicalData([])
            setLocation({ lat: 38.7646, lon: -121.9018, label: 'Yolo County Center', zoom: 9 })
            setWeatherData(null)
            setSatelliteData(null)
            setSelectedNdviPoint(null)
            setIsResetModalOpen(false)
        } catch (error) {
            console.error(error)
            showToast({ message: 'Failed to reset session', type: 'error' })
        }
    }

    const handleSubmit = throttle(useCallback(async (event) => {
        event.preventDefault()
        if (!query.trim()) return

        if (navigator.vibrate) navigator.vibrate(5)

        const userMessage = {
            role: 'user',
            content: query,
            timestamp: new Date().toISOString()
        }

        setIsThinking(true)
        setMessages((prev) => [...prev, userMessage])
        const currentQuery = query
        setQuery('')

        try {
            const response = await fetch(`${API_BASE_URL}/api/analyze`, {
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

            if (data.weather_data) setWeatherData(data.weather_data)
            if (data.satellite_data) setSatelliteData((prev) => ({ ...prev, ...data.satellite_data }))

            setRagResults(data.rag_results || [])
            setSources(data.sources || [])
            setMarketData(data.market_data)
            setChemicalData(data.chemical_data || [])

            if (data.lat && data.lon) {
                setLocation({ lat: data.lat, lon: data.lon, label: data.location_address || 'Selected Location', zoom: 13 })
            } else {
                fetchLocationData(location.lat, location.lon)
            }

            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: data.full_response,
                sources: data.sources,
                timestamp: data.timestamp
            }])
        } catch (error) {
            console.error(error)
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: 'I encountered an error while processing this request.',
                timestamp: new Date().toISOString()
            }])
        } finally {
            setIsThinking(false)
        }
    }, [query, location, sessionId, fetchLocationData]), 1000)

    const sectionVisible = useCallback(() => true, [])

    const layerSummary = useMemo(() => {
        switch (activeMapLayer) {
            case 'water':
                return `Water stress: ${satelliteData?.water_stress_level || 'Unavailable'}`
            case 'soil':
                return `Soil type: ${satelliteData?.soil_type || 'Unavailable'}`
            case 'elevation':
                return `Elevation: ${satelliteData?.elevation_m != null ? `${satelliteData.elevation_m.toFixed(1)} m` : 'Unavailable'}`
            default:
                if (selectedNdviPoint?.ndvi != null) {
                    return `Vegetation NDVI: ${selectedNdviPoint.ndvi.toFixed(2)} (${selectedNdviPoint.date})`
                }
                return `Vegetation NDVI: ${satelliteData?.ndvi_current != null ? satelliteData.ndvi_current.toFixed(2) : 'Unavailable'}`
        }
    }, [activeMapLayer, satelliteData, selectedNdviPoint])

    const locationLine = `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`
    const isSatelliteMock = Boolean(satelliteData?.is_mock)

    return (
        <div className="h-[100dvh] w-screen bg-[var(--clay-bg)] text-black-forest font-display selection:bg-olive-leaf/20 selection:text-black-forest overflow-hidden flex flex-col">
            <AnimatePresence>
                {isThinking && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="progress-bar"
                        role="progressbar"
                        aria-label="Generating response"
                    />
                )}
            </AnimatePresence>

            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

            <footer className="fixed bottom-0 left-0 w-full bg-[var(--clay-bg)]/96 backdrop-blur-md border-t border-white/30 py-1 px-4 z-40 flex justify-between items-center text-[10px] text-black-forest/40 hidden lg:flex" role="contentinfo">
                <span>&copy; 2026 AgriBot</span>
                <span className="font-mono">v2.1.0</span>
            </footer>

            <div className="w-full flex-none z-50 p-4 pb-0">
                <Navbar
                    connectionStatus={isConnected ? 'connected' : 'disconnected'}
                    onCallClick={() => setIsCallModalOpen(true)}
                    onShowToast={showToast}
                    extraButtons={(
                        <div className="flex items-center gap-2">
                            <WeatherAlerts weatherData={weatherData} forecast={weatherData?.forecast} />
                        </div>
                    )}
                />
            </div>

            <main className="relative z-10 flex-1 min-h-0 w-full max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 overflow-y-auto lg:overflow-hidden pb-12" role="main">
                <motion.div
                    variants={cardStagger}
                    initial="hidden"
                    animate="show"
                    className="hidden lg:flex lg:col-span-7 flex-col gap-4 h-full overflow-y-auto scrollbar-fade pr-2 pb-16"
                >
                    {sectionVisible('map') && isDesktop && (
                        <motion.div variants={cardItem} className="clay-card-static p-1.5 overflow-hidden h-[420px] shrink-0 relative">
                            <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-black-forest/40">Map Unavailable</div>}>
                                <LiveMap
                                    location={location}
                                    setLocation={setLocation}
                                    satelliteData={satelliteData}
                                    activeLayer={activeMapLayer}
                                    onActiveLayerChange={setActiveMapLayer}
                                    onNdviPointChange={setSelectedNdviPoint}
                                    onLocateMe={handleLocateMe}
                                    layerSummary={layerSummary}
                                />
                            </ErrorBoundary>
                        </motion.div>
                    )}

                    {isSatelliteMock && (
                        <motion.div variants={cardItem} className="clay-card-static p-3 shrink-0">
                            <p className="text-xs text-copperwood/90">
                                Satellite layer is in mock mode because Google Earth Engine credentials are not available on the backend.
                            </p>
                        </motion.div>
                    )}

                    {sectionVisible('localConditions') && (
                        <motion.div variants={cardItem} className="shrink-0">
                            <WeatherDashboard
                                weatherData={weatherData}
                                isLoading={isLoadingWeather}
                                lat={location.lat}
                                lon={location.lon}
                                unitPreference={unitPreference}
                                onUnitChange={setUnitPreference}
                            />
                        </motion.div>
                    )}

                    {sectionVisible('anomaly') && weatherData && (
                        <AnomalyBadge weatherData={weatherData} isDesktop />
                    )}

                    {sectionVisible('irrigation') && (
                        <motion.div variants={cardItem} className="shrink-0">
                            <IrrigationCalc weatherData={weatherData} unitPreference={unitPreference} />
                        </motion.div>
                    )}

                    <motion.div variants={cardItem} className="shrink-0 pb-2">
                        <FieldVision apiUrl={API_BASE_URL} />
                    </motion.div>

                    {sectionVisible('degreeDays') && (
                        <motion.div variants={cardItem} className="shrink-0 pb-16">
                            <Suspense fallback={<ChartSkeleton />}>
                                <DegreeDays weatherData={weatherData} />
                            </Suspense>
                        </motion.div>
                    )}
                </motion.div>

                <div className="lg:hidden flex flex-col gap-3 pb-20">
                    <div className={mobileTab === 'chat' ? 'contents' : 'hidden'}>
                        <div className="w-full clay-card-static flex flex-col relative h-[calc(100vh-200px)] min-h-[420px] shrink-0 overflow-hidden">
                            {/* ... same chat content ... */}
                            <div className="pt-3 pb-2.5 px-3 border-b border-black-forest/5 clay-header-gradient flex justify-between items-center shrink-0">
                                <span className="text-[10px] font-bold text-olive-leaf uppercase tracking-[0.15em]">Agri-Brain</span>
                                <div className="flex items-center gap-2">
                                    <motion.button
                                        whileTap={{ scale: 0.92 }}
                                        onClick={exportChat}
                                        className="text-[10px] text-olive-leaf/60 hover:text-olive-leaf flex items-center gap-1 px-2 py-1 rounded-full border border-olive-leaf/10"
                                        aria-label="Export chat"
                                    >
                                        <Download size={10} /> Export
                                    </motion.button>
                                    <motion.button
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => setIsResetModalOpen(true)}
                                        className="text-[10px] text-copperwood/80 hover:text-copperwood flex items-center gap-1 px-2 py-1 rounded-full border border-copperwood/10"
                                        aria-label="Reset session"
                                    >
                                        <Trash2 size={10} /> RESET
                                    </motion.button>
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 scrollbar-fade bg-cornsilk/20" aria-live="polite" role="log">
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-black-forest/40">
                                        <Wheat size={28} className="text-olive-leaf/50 mb-3" strokeWidth={1.5} />
                                        <p className="font-medium text-black-forest/60 text-sm">Ask about your field</p>
                                        <p className="text-[10px] mt-1 text-black-forest/35">{location?.label || 'Select a location on the map'}</p>
                                        <div className="mt-4 w-full max-w-[300px]">
                                            <QuickActions
                                                location={location}
                                                onAction={(nextQuery) => setQuery(nextQuery)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <AnimatePresence mode="popLayout">
                                    {messages.map((msg, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                                            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                        >
                                            <div
                                                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed prose prose-sm prose-p:my-1 prose-headings:my-2 ${msg.role === 'user'
                                                    ? 'msg-bubble-user'
                                                    : 'msg-bubble-ai text-black-forest/80 prose-headings:text-black-forest prose-strong:text-olive-leaf'
                                                    }`}
                                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parse(msg.content)) }}
                                            />
                                            {msg.role !== 'user' && (
                                                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-black-forest/30 px-1">
                                                    <span>Rate:</span>
                                                    <motion.button
                                                        whileTap={{ scale: 0.85 }}
                                                        onClick={() => handleMessageFeedback(i, 'up')}
                                                        className={`p-1 rounded-md border transition-colors ${feedbackByMessage[i] === 'up' ? 'text-olive-leaf border-olive-leaf/40 bg-olive-leaf/10' : 'text-black-forest/30 border-black-forest/10 hover:text-olive-leaf hover:border-olive-leaf/30'}`}
                                                        aria-label="Rate as helpful"
                                                        aria-pressed={feedbackByMessage[i] === 'up'}
                                                    >
                                                        <ThumbsUp size={12} />
                                                    </motion.button>
                                                    <motion.button
                                                        whileTap={{ scale: 0.85 }}
                                                        onClick={() => handleMessageFeedback(i, 'down')}
                                                        className={`p-1 rounded-md border transition-colors ${feedbackByMessage[i] === 'down' ? 'text-copperwood border-copperwood/40 bg-copperwood/10' : 'text-black-forest/30 border-black-forest/10 hover:text-copperwood hover:border-copperwood/30'}`}
                                                        aria-label="Rate as not helpful"
                                                        aria-pressed={feedbackByMessage[i] === 'down'}
                                                    >
                                                        <ThumbsDown size={12} />
                                                    </motion.button>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                {isThinking && (
                                    <div className="flex items-center gap-1 pl-2" aria-hidden="true">
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                    </div>
                                )}
                                <div ref={mobileChatEndRef} />
                            </div>

                            <div className="p-3 border-t border-black-forest/5 shrink-0">
                                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        id="mobile-chat-input"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Ask a question..."
                                        className="flex-1 min-w-0 clay-input px-4 py-2.5 text-sm text-black-forest focus:outline-none placeholder-black-forest/30 border-none"
                                        aria-label="Type your question"
                                    />
                                    <motion.button
                                        whileTap={{ scale: 0.9 }}
                                        type="button"
                                        onClick={toggleVoiceInput}
                                        className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${isListening ? 'clay-primary shadow-glow-olive' : 'clay-button text-olive-leaf/60'}`}
                                        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                                    >
                                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                    </motion.button>
                                    <motion.button
                                        whileTap={{ scale: 0.9 }}
                                        type="submit"
                                        disabled={isThinking || !query.trim()}
                                        className="shrink-0 w-10 h-10 flex items-center justify-center clay-primary text-white rounded-xl shadow-clay-sm disabled:opacity-50"
                                        aria-label="Send message"
                                    >
                                        {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    </motion.button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className={mobileTab === 'map' && !isDesktop ? 'contents' : 'hidden'}>
                        <div className="h-[calc(100vh-200px)] clay-card-static p-1 overflow-hidden">
                            <ErrorBoundary>
                                <LiveMap
                                    location={location}
                                    setLocation={setLocation}
                                    satelliteData={satelliteData}
                                    activeLayer={activeMapLayer}
                                    onActiveLayerChange={setActiveMapLayer}
                                    onNdviPointChange={setSelectedNdviPoint}
                                    onLocateMe={handleLocateMe}
                                    layerSummary={layerSummary}
                                />
                            </ErrorBoundary>
                        </div>
                    </div>

                    <div className={mobileTab === 'data' ? 'contents' : 'hidden'}>
                        <div className="h-[calc(100vh-200px)] overflow-y-auto pb-4 pr-1 space-y-3 scrollbar-fade">

                            {isSatelliteMock && (
                                <div className="clay-card-static p-3">
                                    <p className="text-xs text-copperwood/90">
                                        Satellite layer is in mock mode because Google Earth Engine credentials are missing on backend.
                                    </p>
                                </div>
                            )}

                            {sectionVisible('localConditions') && (
                                <WeatherDashboard
                                    weatherData={weatherData}
                                    isLoading={isLoadingWeather}
                                    lat={location.lat}
                                    lon={location.lon}
                                    unitPreference={unitPreference}
                                    onUnitChange={setUnitPreference}
                                />
                            )}

                            {sectionVisible('anomaly') && weatherData && (
                                <AnomalyBadge weatherData={weatherData} />
                            )}

                            {sectionVisible('irrigation') && (
                                <IrrigationCalc weatherData={weatherData} unitPreference={unitPreference} />
                            )}

                            {sectionVisible('degreeDays') && (
                                <Suspense fallback={<ChartSkeleton />}>
                                    <DegreeDays weatherData={weatherData} />
                                </Suspense>
                            )}

                            <WhyBox
                                results={ragResults}
                                sources={sources}
                                marketData={marketData}
                                chemicalData={chemicalData}
                                apiUrl={API_BASE_URL}
                            />
                        </div>
                    </div>

                    <div className={mobileTab === 'vision' ? 'contents' : 'hidden'}>
                        <div className="h-[calc(100vh-200px)] overflow-y-auto pb-4 pr-1 space-y-3 scrollbar-fade">
                            <FieldVision apiUrl={API_BASE_URL} />
                        </div>
                    </div>
                </div>

                <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[500]">
                    <BottomNav activeTab={mobileTab} onTabChange={setMobileTab} />
                </div>

                <motion.div
                    variants={cardStagger}
                    initial="hidden"
                    animate="show"
                    className="hidden lg:flex lg:col-span-5 flex-col gap-4 overflow-hidden"
                    style={{ height: 'calc(100vh - 150px)' }}
                >
                    <motion.div variants={cardItem} className="flex-1 clay-card-static flex flex-col relative min-h-0 overflow-hidden">
                        <div className="pt-3 pb-2.5 px-4 border-b border-black-forest/5 clay-header-gradient flex justify-between items-center shrink-0 z-20 relative">
                            <div>
                                <span className="text-xs font-bold text-olive-leaf uppercase tracking-[0.15em]">Agri-Brain Active</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    onClick={exportChat}
                                    className="text-[10px] text-olive-leaf/60 hover:text-olive-leaf flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-olive-leaf/5 transition-colors border border-transparent hover:border-olive-leaf/15"
                                    aria-label="Export chat as text file"
                                >
                                    <Download size={12} /> Export
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsResetModalOpen(true)}
                                    className="text-[10px] text-copperwood/70 hover:text-copperwood flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-copperwood/5 transition-colors border border-transparent hover:border-copperwood/15"
                                    aria-label="Reset session"
                                >
                                    <Trash2 size={12} /> RESET
                                </motion.button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 scrollbar-fade" aria-live="polite" role="log">
                            {messages.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="flex flex-col items-center justify-center h-full text-center text-black-forest/35 space-y-4"
                                >
                                    <div className="w-16 h-16 rounded-2xl clay-card-sm flex items-center justify-center overflow-hidden p-2">
                                        <img src="/AgriBot.png" alt="AgriBot" className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-black-forest/65">Agri-Brain Ready</p>
                                        <p className="text-xs mt-1 text-black-forest/35">Point-aware responses for this map location.</p>
                                    </div>
                                    <div className="w-full max-w-[360px] pb-10">
                                        <QuickActions
                                            location={location}
                                            onAction={(nextQuery) => {
                                                setQuery(nextQuery)
                                                setTimeout(() => document.getElementById('chat-input')?.focus(), 90)
                                            }}
                                        />
                                    </div>
                                </motion.div>
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
                                            className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[0.92rem] leading-relaxed prose prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 ${msg.role === 'user'
                                                ? 'msg-bubble-user'
                                                : 'msg-bubble-ai text-black-forest/80 prose-headings:text-black-forest prose-strong:text-olive-leaf'
                                                }`}
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parse(msg.content)) }}
                                        />
                                        {msg.role !== 'user' && (
                                            <div className="mt-2 flex items-center gap-2 text-[10px] text-black-forest/30 px-1">
                                                <span>Rate reply:</span>
                                                <motion.button
                                                    whileTap={{ scale: 0.85 }}
                                                    onClick={() => handleMessageFeedback(i, 'up')}
                                                    className={`p-1 rounded-md border transition-colors ${feedbackByMessage[i] === 'up' ? 'text-olive-leaf border-olive-leaf/40 bg-olive-leaf/10' : 'text-black-forest/30 border-black-forest/10 hover:text-olive-leaf hover:border-olive-leaf/30'}`}
                                                    aria-label="Rate as helpful"
                                                    aria-pressed={feedbackByMessage[i] === 'up'}
                                                >
                                                    <ThumbsUp size={13} />
                                                </motion.button>
                                                <motion.button
                                                    whileTap={{ scale: 0.85 }}
                                                    onClick={() => handleMessageFeedback(i, 'down')}
                                                    className={`p-1 rounded-md border transition-colors ${feedbackByMessage[i] === 'down' ? 'text-copperwood border-copperwood/40 bg-copperwood/10' : 'text-black-forest/30 border-black-forest/10 hover:text-copperwood hover:border-copperwood/30'}`}
                                                    aria-label="Rate as not helpful"
                                                    aria-pressed={feedbackByMessage[i] === 'down'}
                                                >
                                                    <ThumbsDown size={13} />
                                                </motion.button>
                                            </div>
                                        )}
                                        <span className="text-[10px] text-black-forest/25 mt-1.5 px-1 font-mono uppercase tracking-wide">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {isThinking && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start pl-2">
                                    <div className="msg-bubble-ai px-4 py-4 flex gap-1 items-center" aria-hidden="true">
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                    </div>
                                </motion.div>
                            )}

                            <div ref={chatEndRef} />
                        </div>

                        <div className="p-4 shrink-0 border-t border-black-forest/5">
                            <form onSubmit={handleSubmit} className="flex items-center gap-3">
                                <input
                                    type="text"
                                    id="chat-input"
                                    autoComplete="off"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Ask your agricultural assistant..."
                                    className="flex-1 min-w-0 clay-input px-5 py-3.5 text-sm text-black-forest placeholder-black-forest/30 focus:outline-none transition-all border-none"
                                    aria-label="Type your question"
                                />
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    type="button"
                                    onClick={toggleVoiceInput}
                                    className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all ${isListening ? 'clay-primary shadow-glow-olive' : 'clay-button text-olive-leaf/60 hover:text-olive-leaf'}`}
                                    aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                                >
                                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    type="submit"
                                    disabled={isThinking || !query.trim()}
                                    className="shrink-0 w-12 h-12 flex items-center justify-center clay-primary rounded-xl shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="Send message"
                                >
                                    {isThinking ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </motion.button>
                            </form>
                        </div>
                    </motion.div>

                    <motion.div variants={cardItem} className="h-[220px] shrink-0">
                        <WhyBox
                            results={ragResults}
                            sources={sources}
                            marketData={marketData}
                            chemicalData={chemicalData}
                            apiUrl={API_BASE_URL}
                        />
                    </motion.div>
                </motion.div>
            </main>

            <SessionModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={handleResetConfirm} />
            <CallModal isOpen={isCallModalOpen} onClose={() => setIsCallModalOpen(false)} onShowToast={showToast} />
        </div>
    )
}

export default App
