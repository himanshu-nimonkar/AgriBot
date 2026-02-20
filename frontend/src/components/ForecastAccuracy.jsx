import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target, TrendingUp, CloudRain, ChevronDown, RefreshCw } from 'lucide-react'

function ForecastAccuracy({ lat = 38.5449, lon = -121.7405 }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const [hasFetched, setHasFetched] = useState(false)

    // Lazy load — fetch only on expand
    useEffect(() => {
        if (!isExpanded || hasFetched) return
        const fetchAccuracy = async () => {
            setLoading(true)
            setError(null)
            try {
                // Get yesterday's date
                const yesterday = new Date(Date.now() - 86400000)
                const yDate = yesterday.toISOString().split('T')[0]
                
                // Fetch forecast made 3 days ago for yesterday (simulated via current forecast endpoint)
                // and compare with actual archived data
                const [forecastRes, actualRes] = await Promise.all([
                    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${yDate}&end_date=${yDate}&timezone=auto`),
                    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${yDate}&end_date=${yDate}&timezone=auto`)
                ])

                if (!forecastRes.ok || !actualRes.ok) throw new Error('API request failed')

                const forecast = await forecastRes.json()
                const actual = await actualRes.json()

                const fMax = forecast.daily?.temperature_2m_max?.[0]
                const aMax = actual.daily?.temperature_2m_max?.[0]
                const fMin = forecast.daily?.temperature_2m_min?.[0]
                const aMin = actual.daily?.temperature_2m_min?.[0]
                const fPrecip = forecast.daily?.precipitation_sum?.[0]
                const aPrecip = actual.daily?.precipitation_sum?.[0]

                // Calculate accuracy percentages
                const tempAccuracy = (fMax != null && aMax != null)
                    ? Math.max(0, Math.round(100 - Math.abs(fMax - aMax) / Math.max(Math.abs(aMax), 1) * 100))
                    : null
                const precipAccuracy = (fPrecip != null && aPrecip != null)
                    ? (aPrecip === 0 && fPrecip === 0) ? 100
                    : Math.max(0, Math.round(100 - Math.abs(fPrecip - aPrecip) / Math.max(Math.abs(aPrecip), 0.1) * 100))
                    : null
                const overall = [tempAccuracy, precipAccuracy].filter(v => v != null)
                const overallPct = overall.length ? Math.round(overall.reduce((a, b) => a + b, 0) / overall.length) : null

                setData({
                    date: yDate,
                    predicted_temp_max: fMax,
                    actual_temp_max: aMax,
                    predicted_precipitation: fPrecip != null ? +fPrecip.toFixed(1) : null,
                    actual_precipitation: aPrecip != null ? +aPrecip.toFixed(1) : null,
                    temp_accuracy_pct: tempAccuracy,
                    precip_accuracy_pct: precipAccuracy,
                    overall_accuracy_pct: overallPct,
                })
                setHasFetched(true)
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        fetchAccuracy()
    }, [isExpanded, hasFetched, lat, lon])

    useEffect(() => {
        setHasFetched(false)
    }, [lat, lon])

    const getAccuracyColor = (pct) => {
        if (pct == null) return 'text-black-forest/30'
        if (pct >= 90) return 'text-olive-leaf'
        if (pct >= 75) return 'text-sunlit-clay'
        return 'text-copperwood'
    }

    const getAccuracyLabel = (pct) => {
        if (pct == null) return 'N/A'
        if (pct >= 95) return 'Excellent'
        if (pct >= 85) return 'Good'
        if (pct >= 70) return 'Fair'
        return 'Poor'
    }

    const AccuracyRing = ({ value, size = 80, strokeWidth = 6 }) => {
        const radius = (size - strokeWidth) / 2
        const circumference = 2 * Math.PI * radius
        const offset = circumference - (Math.min(value || 0, 100) / 100) * circumference
        const color = value >= 90 ? '#606c38' : value >= 75 ? '#dda15e' : '#bc6c25'

        return (
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2} cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(40,54,24,0.06)"
                    strokeWidth={strokeWidth}
                />
                <motion.circle
                    cx={size / 2} cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    strokeLinecap="round"
                />
            </svg>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="clay-card-static overflow-hidden"
        >
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 clay-header-gradient border-b border-black-forest/5"
            >
                <h3 className="font-semibold text-olive-leaf flex items-center gap-2 text-sm uppercase tracking-[0.1em]">
                    <Target size={14} strokeWidth={1.5} /> Forecast Accuracy
                </h3>
                <ChevronDown
                    size={14}
                    className={`text-black-forest/30 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {isExpanded && (
                <div className="p-4">
                    {loading && (
                        <div className="h-[120px] flex items-center justify-center">
                            <div className="flex gap-1">
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-6 space-y-2">
                            <p className="text-copperwood text-xs">Failed to load: {error}</p>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setHasFetched(false); setError(null) }}
                                className="clay-button px-3 py-1.5 text-xs text-olive-leaf inline-flex items-center gap-1.5"
                            >
                                <RefreshCw size={12} /> Retry
                            </motion.button>
                        </div>
                    )}

                    {!loading && !error && data && (
                        <div className="flex flex-col items-center gap-4">
                            {/* Overall score ring */}
                            <div className="relative">
                                <AccuracyRing value={data.overall_accuracy_pct} size={96} strokeWidth={8} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className={`text-xl font-bold tabular-nums ${getAccuracyColor(data.overall_accuracy_pct)}`}>
                                        {data.overall_accuracy_pct != null ? `${data.overall_accuracy_pct}%` : '—'}
                                    </span>
                                    <span className="text-[9px] text-black-forest/40 uppercase tracking-wide">
                                        {getAccuracyLabel(data.overall_accuracy_pct)}
                                    </span>
                                </div>
                            </div>

                            <p className="text-[10px] text-black-forest/40">
                                For {data.date || 'yesterday'}
                            </p>

                            {/* Detail tiles */}
                            <div className="flex gap-3 w-full">
                                <div className="clay-tile px-3 py-2 flex-1">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingUp size={12} className="text-copperwood" strokeWidth={1.5} />
                                        <span className="text-[10px] text-black-forest/40 uppercase">Temperature</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-black-forest/50">Predicted</span>
                                        <span className="font-semibold tabular-nums">
                                            {data.predicted_temp_max != null ? `${data.predicted_temp_max}°` : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-black-forest/50">Actual</span>
                                        <span className="font-semibold tabular-nums">
                                            {data.actual_temp_max != null ? `${data.actual_temp_max}°` : '—'}
                                        </span>
                                    </div>
                                    <p className={`text-xs font-bold mt-1 ${getAccuracyColor(data.temp_accuracy_pct)}`}>
                                        {data.temp_accuracy_pct != null ? `${data.temp_accuracy_pct}% accurate` : 'N/A'}
                                    </p>
                                </div>

                                <div className="clay-tile px-3 py-2 flex-1">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <CloudRain size={12} className="text-olive-leaf" strokeWidth={1.5} />
                                        <span className="text-[10px] text-black-forest/40 uppercase">Precipitation</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-black-forest/50">Predicted</span>
                                        <span className="font-semibold tabular-nums">
                                            {data.predicted_precipitation != null ? `${data.predicted_precipitation}mm` : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-black-forest/50">Actual</span>
                                        <span className="font-semibold tabular-nums">
                                            {data.actual_precipitation != null ? `${data.actual_precipitation}mm` : '—'}
                                        </span>
                                    </div>
                                    <p className={`text-xs font-bold mt-1 ${getAccuracyColor(data.precip_accuracy_pct)}`}>
                                        {data.precip_accuracy_pct != null ? `${data.precip_accuracy_pct}% accurate` : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && !error && !data && (
                        <div className="text-center py-6 space-y-2">
                            <p className="text-black-forest/30 text-xs">No accuracy data available</p>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setHasFetched(false); setError(null) }}
                                className="clay-button px-3 py-1.5 text-xs text-olive-leaf inline-flex items-center gap-1.5"
                            >
                                <RefreshCw size={12} /> Load Data
                            </motion.button>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    )
}

export default ForecastAccuracy
