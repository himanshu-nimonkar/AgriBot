import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePersistentToggle } from '../hooks/usePersistentToggle'
import { Loader2, TrendingUp, AlertTriangle, Sprout, Sprout as Wheat, Droplets, Thermometer, BrainCircuit, ChevronUp, ChevronDown } from 'lucide-react'

export default function YieldPrediction({ satelliteData, weatherData, apiUrl }) {
    const [isLoading, setIsLoading] = useState(false)
    const [prediction, setPrediction] = useState(null)
    const [selectedCrop, setSelectedCrop] = useState('tomatoes')
    const [expanded, setExpanded] = usePersistentToggle('ag_yield_expanded', false)

    const runPrediction = async () => {
        setIsLoading(true)
        setPrediction(null)
        try {
            const payload = {
                crop_type: selectedCrop,
                ndvi: satelliteData?.ndvi_current || 0.65,
                avg_temp: weatherData?.temperature_c || 22,
                rainfall_mm: weatherData?.precipitation_intensity || 10,
                soil_quality: satelliteData?.soil_type || "Silty Loam"
            }

            const res = await fetch(`${apiUrl}/api/yield/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error('Failed to compute yield')
            const data = await res.json()
            setPrediction(data)
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const CROP_OPTIONS = [
        { id: 'tomatoes', label: 'Tomato' },
        { id: 'almonds', label: 'Almonds' },
        { id: 'walnuts', label: 'Walnuts' },
        { id: 'rice', label: 'Rice' },
        { id: 'corn', label: 'Corn' },
        { id: 'wheat', label: 'Wheat' }
    ]

    return (
        <div className="clay-card-static p-4 lg:p-5 flex flex-col w-full transition-all duration-300 group">
            <div className="flex items-start justify-between shrink-0 relative z-10 w-full">
                <div className="flex items-center gap-3">
                    <motion.div 
                        whileHover={{ scale: 1.05, rotate: -5 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-olive-leaf/20 to-sage/30 text-black-forest shadow-inner clay-button cursor-pointer flex-shrink-0"
                        style={{
                            boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.6), inset -2px -2px 4px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Wheat className="w-4 h-4 text-copperwood drop-shadow-sm" />
                    </motion.div>
                    <div>
                        <h3 className="text-[13px] font-bold text-black-forest uppercase tracking-tight">
                            AI Yield Forecaster
                        </h3>
                        <p className="text-[10px] text-black-forest/50 font-medium mt-0.5">Estimates seasonal tonnage via NDVI & Telemetry</p>
                        <p className="text-[10px] text-black-forest/60 mt-0.5 leading-snug max-w-[220px] hidden lg:block">Uses current satellite health and weather data to estimate your end-of-season crop yield.</p>
                        <p className="text-[9px] text-black-forest/60 mt-0.5 leading-snug lg:hidden">End-of-season yield estimates.</p>
                    </div>
                </div>
                <div className="flex flex-col justify-center h-full">
                    <motion.button
                        whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setExpanded(!expanded)}
                        className="clay-button w-7 h-7 rounded-lg flex items-center justify-center text-black-forest/40 hover:text-olive-leaf transition-colors"
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </motion.button>
                </div>
            </div>

            <AnimatePresence mode="sync">
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                        className="flex flex-col gap-4 overflow-hidden"
                    >
                        <div className="flex items-center gap-2">
                            <select 
                                value={selectedCrop} 
                                onChange={(e) => setSelectedCrop(e.target.value)}
                                className="flex-1 bg-white/50 border border-black-forest/10 rounded-xl px-3 py-2 text-xs font-medium text-black-forest focus:outline-none focus:ring-2 focus:ring-olive-leaf/30 transition-all cursor-pointer hover:bg-white/70"
                            >
                                {CROP_OPTIONS.map(c => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>

                            <motion.button
                                whileHover={{ scale: 1.05, boxShadow: "0px 8px 15px rgba(107, 142, 35, 0.2)" }}
                                whileTap={{ scale: 0.95 }}
                                onClick={runPrediction}
                                disabled={isLoading}
                                className="clay-button btn-liquid px-4 py-2 rounded-xl bg-olive-leaf text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 min-w-[100px] justify-center"
                            >
                                {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Predict'}
                            </motion.button>
                        </div>

                        <AnimatePresence mode="wait">
                            {prediction && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    transition={{ duration: 0.4, type: "spring" }}
                                    className="bg-gradient-to-br from-white/60 to-cornsilk/20 rounded-2xl p-4 border border-olive-leaf/10 overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-white/20 mix-blend-overlay pointer-events-none rounded-2xl" />
                                    <div className="relative z-10">
                                        <div className="flex items-end justify-between mb-4">
                                            <div>
                                                <p className="text-[10px] font-bold text-black-forest/40 uppercase tracking-widest mb-1">Estimated Output</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-3xl font-black text-black-forest drop-shadow-sm">{prediction.predicted_yield}</span>
                                                    <span className="text-xs font-bold text-olive-leaf">{prediction.unit}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <motion.span 
                                                    initial={{ opacity: 0, x: 10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${prediction.confidence > 0.85 ? 'bg-olive-leaf/10 text-olive-leaf' : 'bg-amber-500/10 text-amber-600'}`}
                                                >
                                                    {(prediction.confidence * 100).toFixed(0)}% Confidence
                                                </motion.span>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mt-2 pt-3 border-t border-black-forest/5">
                                            <p className="text-[10px] font-bold text-black-forest/40 uppercase tracking-wider mb-2">Analysis Factors</p>
                                            {prediction.risk_factors.map((factor, idx) => (
                                                <motion.div 
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.1 }}
                                                    key={idx} 
                                                    className="flex items-start gap-2 bg-white/40 rounded-lg p-2 text-xs hover:bg-white/60 transition-colors"
                                                >
                                                    {factor.includes('Optimal') ? (
                                                        <Sprout size={14} className="text-olive-leaf shrink-0 mt-0.5" />
                                                    ) : (
                                                        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                                    )}
                                                    <span className="text-black-forest/80 leading-tight font-medium">{factor}</span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
