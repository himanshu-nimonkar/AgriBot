import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Upload, Loader2, Play, Leaf, Droplets, DollarSign,
    AlertTriangle, Sprout, X, CheckCircle2, Film, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────

const riskColor = (score) => {
    if (score <= 30) return 'text-olive-leaf bg-olive-leaf/10'
    if (score <= 60) return 'text-sunlit-clay bg-sunlit-clay/10'
    if (score <= 80) return 'text-copperwood bg-copperwood/10'
    return 'text-red-600 bg-red-50'
}

const sustainColor = (score) => {
    if (score >= 70) return '#606c38'
    if (score >= 40) return '#dda15e'
    return '#bc6c25'
}

function SustainArc({ score }) {
    const r = 28
    const circ = 2 * Math.PI * r
    const dash = (score / 100) * circ
    const color = sustainColor(score)
    return (
        <svg width="72" height="72" viewBox="0 0 72 72" className="block mx-auto">
            <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(40,54,24,0.08)" strokeWidth="7" />
            <circle
                cx="36" cy="36" r={r}
                fill="none"
                stroke={color}
                strokeWidth="7"
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ transition: 'stroke-dasharray 1.2s ease-out' }}
            />
            <text x="36" y="40" textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
                {score}
            </text>
        </svg>
    )
}

// ── Analytic card ─────────────────────────────────────────────────

function AnalyticCard({ icon: Icon, label, value, unit, color = 'text-olive-leaf', index }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07, duration: 0.35 }}
            className="clay-tile p-3"
        >
            <div className="flex items-center gap-1.5 mb-1.5">
                <Icon size={13} className={color} strokeWidth={1.8} />
                <span className="text-[10px] text-black-forest/50 font-medium uppercase tracking-wide">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
                {unit && <span className="text-[10px] text-black-forest/35">{unit}</span>}
            </div>
        </motion.div>
    )
}

// ── Main component ────────────────────────────────────────────────

export default function FieldVision({ apiUrl = 'http://127.0.0.1:8000' }) {
    const [dragOver, setDragOver] = useState(false)
    const [preview, setPreview] = useState(null)   // data URL
    const [file, setFile] = useState(null)
    const [crop, setCrop] = useState('')

    const [phase, setPhase] = useState('idle')     // idle | analyzing | generating | ready | error
    const [analytics, setAnalytics] = useState(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [jobId, setJobId] = useState(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [elapsed, setElapsed] = useState(0)
    const [expanded, setExpanded] = useState(true)

    const fileRef = useRef(null)
    const pollRef = useRef(null)
    const timerRef = useRef(null)

    // ── File selection ─────────────────────────────────────────

    const handleFiles = useCallback((files) => {
        const f = files[0]
        if (!f) return
        if (!f.type.startsWith('image/')) {
            setErrorMsg('Please upload an image file (JPG, PNG, WebP, etc.)')
            return
        }
        setFile(f)
        setPreview(URL.createObjectURL(f))
        setPhase('idle')
        setAnalytics(null)
        setVideoUrl(null)
        setJobId(null)
        setErrorMsg('')
    }, [])

    const onDrop = useCallback((e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
    }, [handleFiles])

    const onFileInput = (e) => handleFiles(e.target.files)

    // ── Submission ─────────────────────────────────────────────

    const handleGenerate = async () => {
        if (!file) return
        setPhase('analyzing')
        setErrorMsg('')
        setElapsed(0)

        // Start elapsed timer
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

        try {
            const form = new FormData()
            form.append('image', file)
            if (crop.trim()) form.append('crop', crop.trim())

            const res = await fetch(`${apiUrl}/api/field-vision`, {
                method: 'POST',
                body: form,
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || `HTTP ${res.status}`)
            }
            const data = await res.json()

            setAnalytics(data.analytics)
            setJobId(data.job_id)

            if (data.status === 'ready' && data.video_url) {
                // Instant (mock) result
                clearInterval(timerRef.current)
                setVideoUrl(resolveVideoUrl(data.video_url, apiUrl))
                setPhase('ready')
            } else {
                // Start polling
                setPhase('generating')
                startPolling(data.job_id)
            }
        } catch (err) {
            clearInterval(timerRef.current)
            setPhase('error')
            setErrorMsg(err.message)
        }
    }

    const startPolling = (id) => {
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${apiUrl}/api/field-vision/${id}`)
                const data = await res.json()
                if (data.status === 'ready') {
                    clearInterval(pollRef.current)
                    clearInterval(timerRef.current)
                    if (data.analytics) setAnalytics(data.analytics)
                    setVideoUrl(resolveVideoUrl(data.video_url, apiUrl))
                    setPhase('ready')
                } else if (data.status === 'error') {
                    clearInterval(pollRef.current)
                    clearInterval(timerRef.current)
                    setPhase('error')
                    setErrorMsg(data.error || 'Video generation failed')
                }
            } catch (_) { /* ignore transient errors */ }
        }, 10000)
    }

    const resolveVideoUrl = (url, base) => {
        if (!url) return null
        if (url.startsWith('http')) return url  // external CDN
        return `${base}${url}`                  // local server
    }

    // Cleanup on unmount
    useEffect(() => () => {
        clearInterval(pollRef.current)
        clearInterval(timerRef.current)
    }, [])

    const reset = () => {
        clearInterval(pollRef.current)
        clearInterval(timerRef.current)
        setPhase('idle')
        setFile(null)
        setPreview(null)
        setAnalytics(null)
        setVideoUrl(null)
        setJobId(null)
        setErrorMsg('')
        setElapsed(0)
    }

    // ── Format elapsed ─────────────────────────────────────────

    const fmtElapsed = (s) => {
        if (s < 60) return `${s}s`
        return `${Math.floor(s / 60)}m ${s % 60}s`
    }

    // ── Render ─────────────────────────────────────────────────

    const isWorking = phase === 'analyzing' || phase === 'generating'

    return (
        <div className="clay-card-static overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-black-forest/5 clay-header-gradient flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 clay-primary rounded-lg flex items-center justify-center shadow-clay-sm">
                        <Film size={14} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em]">
                            Field Vision
                        </h3>
                        <p className="text-[9px] text-black-forest/40 font-medium">Powered by Veo 3.1 + Gemini</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {phase !== 'idle' && (
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={reset}
                            className="clay-button w-7 h-7 flex items-center justify-center text-copperwood/60 hover:text-copperwood"
                            aria-label="Reset"
                        >
                            <RefreshCw size={12} />
                        </motion.button>
                    )}
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setExpanded(v => !v)}
                        className="clay-button w-7 h-7 flex items-center justify-center text-black-forest/30"
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </motion.button>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 space-y-3 overflow-hidden"
                    >
                        {/* ── Drop Zone ── */}
                        {!preview && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all ${dragOver
                                    ? 'border-olive-leaf/60 bg-olive-leaf/5'
                                    : 'border-black-forest/15 hover:border-olive-leaf/30 hover:bg-olive-leaf/3'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                                onClick={() => fileRef.current?.click()}
                                role="button"
                                aria-label="Upload aerial field image"
                            >
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={onFileInput}
                                    id="field-vision-upload"
                                />
                                <div className="w-10 h-10 clay-tile rounded-xl flex items-center justify-center">
                                    <Upload size={18} className="text-olive-leaf/60" />
                                </div>
                                <p className="text-xs font-semibold text-black-forest/60">
                                    Drop aerial image here
                                </p>
                                <p className="text-[10px] text-black-forest/35">
                                    JPG, PNG, WebP — max 20 MB
                                </p>
                            </motion.div>
                        )}

                        {/* ── Preview + Controls ── */}
                        {preview && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                {/* Thumbnail */}
                                <div className="relative rounded-xl overflow-hidden h-40 bg-black/5">
                                    <img
                                        src={preview}
                                        alt="Uploaded field"
                                        className="w-full h-full object-cover"
                                    />
                                    {phase === 'idle' && (
                                        <button
                                            onClick={reset}
                                            className="absolute top-2 right-2 w-6 h-6 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
                                            aria-label="Remove image"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                    {isWorking && (
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                            <div className="text-white text-center">
                                                <Loader2 size={28} className="animate-spin mx-auto mb-1" />
                                                <p className="text-xs font-medium">
                                                    {phase === 'analyzing' ? 'Analyzing image…' : 'Generating video…'}
                                                </p>
                                                <p className="text-[10px] opacity-70">{fmtElapsed(elapsed)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Crop hint */}
                                {phase === 'idle' && (
                                    <input
                                        type="text"
                                        value={crop}
                                        onChange={(e) => setCrop(e.target.value)}
                                        placeholder="Crop type (optional, e.g. Wheat)"
                                        className="w-full clay-input px-3 py-2 text-xs text-black-forest placeholder-black-forest/30 focus:outline-none"
                                    />
                                )}

                                {/* Generate button */}
                                {phase === 'idle' && (
                                    <motion.button
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={handleGenerate}
                                        className="w-full clay-primary rounded-xl py-2.5 text-xs font-bold text-white flex items-center justify-center gap-2"
                                        id="field-vision-generate-btn"
                                    >
                                        <Sprout size={14} />
                                        Generate Field Vision
                                    </motion.button>
                                )}

                                {/* Status pill while generating */}
                                {isWorking && (
                                    <div className="flex items-center gap-2 clay-tile px-3 py-2 rounded-xl">
                                        <span className="status-dot healthy" />
                                        <span className="text-[11px] text-black-forest/60 font-medium">
                                            {phase === 'analyzing'
                                                ? 'Running Gemini Vision analysis…'
                                                : 'Veo 3.1 is generating your video (1–3 min)…'}
                                        </span>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ── Error ── */}
                        <AnimatePresence>
                            {phase === 'error' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="clay-tile p-3 flex items-start gap-2"
                                >
                                    <AlertTriangle size={14} className="text-copperwood shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-semibold text-copperwood">Generation failed</p>
                                        <p className="text-[10px] text-black-forest/50 mt-0.5">{errorMsg}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Analytics ── */}
                        <AnimatePresence>
                            {analytics && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-3"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 size={13} className="text-olive-leaf" />
                                        <span className="text-[10px] font-bold text-olive-leaf uppercase tracking-wider">
                                            Field Analytics
                                        </span>
                                        {analytics.is_mock && (
                                            <span className="text-[9px] bg-sunlit-clay/20 text-copperwood px-1.5 py-0.5 rounded-full font-medium">
                                                DEMO
                                            </span>
                                        )}
                                    </div>

                                    {/* Main metric grid */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <AnalyticCard
                                            icon={Leaf}
                                            label="Land Area"
                                            value={analytics.land_area_ha?.toFixed(1)}
                                            unit="ha"
                                            color="text-olive-leaf"
                                            index={0}
                                        />
                                        <AnalyticCard
                                            icon={Droplets}
                                            label="Water Need"
                                            value={analytics.water_need_l_per_day
                                                ? (analytics.water_need_l_per_day / 1000).toFixed(1)
                                                : '—'}
                                            unit="kL/day/ha"
                                            color="text-blue-500"
                                            index={1}
                                        />
                                        <AnalyticCard
                                            icon={DollarSign}
                                            label="Profit Est."
                                            value={analytics.profit_usd_per_ha
                                                ? `$${Math.round(analytics.profit_usd_per_ha).toLocaleString()}`
                                                : '—'}
                                            unit="/ha/season"
                                            color="text-sunlit-clay"
                                            index={2}
                                        />
                                        <AnalyticCard
                                            icon={AlertTriangle}
                                            label="Risk"
                                            value={analytics.risk_label || '—'}
                                            unit=""
                                            color={
                                                analytics.risk_score <= 30 ? 'text-olive-leaf'
                                                    : analytics.risk_score <= 60 ? 'text-sunlit-clay'
                                                        : 'text-copperwood'
                                            }
                                            index={3}
                                        />
                                    </div>

                                    {/* Sustainability arc + badges */}
                                    <div className="clay-tile p-3 flex items-center gap-4">
                                        <div className="shrink-0">
                                            <SustainArc score={analytics.sustainability_score ?? 0} />
                                            <p className="text-[9px] text-center text-black-forest/40 mt-1 font-medium uppercase tracking-wide">
                                                Sustainability
                                            </p>
                                        </div>
                                        <div className="space-y-1.5 min-w-0">
                                            {analytics.soil_type !== 'Unknown' && (
                                                <div>
                                                    <p className="text-[9px] text-black-forest/40 uppercase tracking-wide">Soil</p>
                                                    <p className="text-xs font-semibold text-black-forest truncate">{analytics.soil_type}</p>
                                                </div>
                                            )}
                                            {analytics.recommended_crop !== 'N/A' && (
                                                <div>
                                                    <p className="text-[9px] text-black-forest/40 uppercase tracking-wide">Best Crop</p>
                                                    <p className="text-xs font-semibold text-olive-leaf truncate">{analytics.recommended_crop}</p>
                                                </div>
                                            )}
                                            {analytics.notes && (
                                                <p className="text-[9px] text-black-forest/50 leading-snug mt-1">{analytics.notes}</p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Video Player ── */}
                        <AnimatePresence>
                            {videoUrl && phase === 'ready' && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                                    className="space-y-2"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <Play size={13} className="text-olive-leaf fill-olive-leaf" />
                                        <span className="text-[10px] font-bold text-olive-leaf uppercase tracking-wider">
                                            AI-Generated Vision
                                        </span>
                                        <span className="text-[9px] text-black-forest/30 ml-auto">Veo 3.1</span>
                                    </div>
                                    <div className="rounded-xl overflow-hidden bg-black shadow-clay-gradient">
                                        <video
                                            src={videoUrl}
                                            controls
                                            autoPlay
                                            loop
                                            playsInline
                                            className="w-full max-h-52 object-cover"
                                            aria-label="AI-generated field vision video"
                                        />
                                    </div>
                                    <p className="text-[9px] text-black-forest/30 text-center">
                                        SynthID watermarked · Veo 3.1 Preview · AgriBot Field Vision
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
