import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, TrendingUp, AlertTriangle, Sprout, Droplets, Thermometer, BrainCircuit } from 'lucide-react'

export default function YieldPrediction({ satelliteData, weatherData, apiUrl }) {
    const [isLoading, setIsLoading] = useState(false)
    const [prediction, setPrediction] = useState(null)
    const [selectedCrop, setSelectedCrop] = useState('tomatoes')

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
        { id: 'tomatoes', label: 'Processing Tomatoes' },
        { id: 'almonds', label: 'Almonds' },
        { id: 'rice', label: 'Rice' },
        { id: 'corn', label: 'Corn' }
    ]

    return (
        <div className="clay-card-static p-4 lg:p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-black-forest flex items-center gap-2">
                        <TrendingUp size={18} className="text-olive-leaf" />
                        AI Yield Forecaster
                    </h3>
                    <p className="text-[10px] text-black-forest/50 mt-1">Estimates seasonal harvest tonnage combining real-time NDVI, soil profile, and telemetry.</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <select 
                    value={selectedCrop} 
                    onChange={(e) => setSelectedCrop(e.target.value)}
                    className="flex-1 bg-white/50 border border-black-forest/10 rounded-xl px-3 py-2 text-xs font-medium text-black-forest focus:outline-none focus:ring-2 focus:ring-olive-leaf/30 transition-all cursor-pointer"
                >
                    {CROP_OPTIONS.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>

                <motion.button
                    whileHover={{ scale: 1.02 }}
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
                        initial={{ opacity: 0, height: 0, scale: 0.95 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 bg-gradient-to-br from-white/60 to-cornsilk/20 rounded-2xl p-4 border border-olive-leaf/10 overflow-hidden"
                    >
                        <div className="flex items-end justify-between mb-4">
                            <div>
                                <p className="text-[10px] font-bold text-black-forest/40 uppercase tracking-widest mb-1">Estimated Output</p>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black text-black-forest drop-shadow-sm">{prediction.predicted_yield}</span>
                                    <span className="text-xs font-bold text-olive-leaf">{prediction.unit}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${prediction.confidence > 0.85 ? 'bg-olive-leaf/10 text-olive-leaf' : 'bg-amber-500/10 text-amber-600'}`}>
                                    {(prediction.confidence * 100).toFixed(0)}% Confidence
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 mt-2 pt-3 border-t border-black-forest/5">
                            <p className="text-[10px] font-bold text-black-forest/40 uppercase tracking-wider mb-2">Analysis Factors</p>
                            {prediction.risk_factors.map((factor, idx) => (
                                <div key={idx} className="flex items-start gap-2 bg-white/40 rounded-lg p-2 text-xs">
                                    {factor.includes('Optimal') ? (
                                        <Sprout size={14} className="text-olive-leaf shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    )}
                                    <span className="text-black-forest/80 leading-tight">{factor}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
