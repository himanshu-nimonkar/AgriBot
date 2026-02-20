import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, TrendingUp, Droplets, Thermometer, ChevronDown, RefreshCw } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const METRICS = [
    { key: 'temp', label: 'Temperature', color: '#bc6c25', unit: '°C', icon: Thermometer },
    { key: 'precip', label: 'Precipitation', color: '#606c38', unit: 'mm', icon: Droplets },
    { key: 'humidity', label: 'Humidity', color: '#dda15e', unit: '%', icon: TrendingUp }
]

function HistoricalChart({ lat = 38.5449, lon = -121.7405, days = 30 }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [activeMetric, setActiveMetric] = useState('temp')
    const [isExpanded, setIsExpanded] = useState(true)
    const [hasFetched, setHasFetched] = useState(false)

    // Lazy load — only fetch when expanded
    useEffect(() => {
        if (!isExpanded || hasFetched) return
        const fetchHistory = async () => {
            setLoading(true)
            setError(null)
            try {
                const end = new Date().toISOString().split('T')[0]
                const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean&start_date=${start}&end_date=${end}&timezone=auto`
                const res = await fetch(url)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const json = await res.json()
                setData(json.daily)
                setHasFetched(true)
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        fetchHistory()
    }, [isExpanded, hasFetched, lat, lon, days])

    // Re-fetch when location changes
    useEffect(() => {
        setHasFetched(false)
    }, [lat, lon])

    const chartData = useMemo(() => {
        if (!data?.time) return []
        return data.time.map((date, i) => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            temp: data.temperature_2m_max?.[i] != null && data.temperature_2m_min?.[i] != null
                ? Math.round((data.temperature_2m_max[i] + data.temperature_2m_min[i]) / 2 * 10) / 10
                : null,
            precip: data.precipitation_sum?.[i] ?? null,
            humidity: data.relative_humidity_2m_mean?.[i] ?? null
        })).filter(d => d[activeMetric] != null)
    }, [data, activeMetric])

    const summary = useMemo(() => {
        if (!data?.time) return {}
        const temps = data.time.map((_, i) =>
            (data.temperature_2m_max?.[i] != null && data.temperature_2m_min?.[i] != null)
                ? (data.temperature_2m_max[i] + data.temperature_2m_min[i]) / 2
                : null
        ).filter(Boolean)
        const precips = data.precipitation_sum?.filter(p => p != null) || []
        const humids = data.relative_humidity_2m_mean?.filter(h => h != null) || []
        return {
            avgTemp: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null,
            totalPrecip: precips.length ? precips.reduce((a, b) => a + b, 0).toFixed(1) : null,
            avgHumidity: humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(0) : null,
        }
    }, [data])

    const metric = METRICS.find(m => m.key === activeMetric)

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
            <div className="clay-card-sm px-3 py-2 text-xs">
                <p className="font-semibold text-black-forest">{label}</p>
                <p style={{ color: metric.color }}>
                    {metric.label}: {payload[0]?.value?.toLocaleString()}{metric.unit}
                </p>
            </div>
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
                    <Calendar size={14} strokeWidth={1.5} /> {days}-Day History
                </h3>
                <ChevronDown
                    size={14}
                    className={`text-black-forest/30 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {isExpanded && (
                <div className="p-4">
                    {/* Metric Tabs */}
                    <div className="flex gap-2 mb-4">
                        {METRICS.map(m => {
                            const Icon = m.icon
                            return (
                                <motion.button
                                    key={m.key}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setActiveMetric(m.key)}
                                    className={`clay-pill flex items-center gap-1.5 transition-all text-xs ${
                                        activeMetric === m.key
                                            ? 'ring-2 ring-olive-leaf/30 text-olive-leaf font-bold'
                                            : 'text-black-forest/50'
                                    }`}
                                >
                                    <Icon size={12} strokeWidth={1.5} />
                                    {m.label}
                                </motion.button>
                            )
                        })}
                    </div>

                    {loading && (
                        <div className="h-[200px] flex items-center justify-center">
                            <div className="flex gap-1">
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8 space-y-2">
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

                    {!loading && !error && chartData.length > 0 && (
                        <>
                            <div className="h-[200px] -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={metric.color} stopOpacity={0.25} />
                                                <stop offset="95%" stopColor={metric.color} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(40,54,24,0.06)" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fill: '#8a8872' }}
                                            interval={Math.floor(chartData.length / 6)}
                                        />
                                        <YAxis tick={{ fontSize: 10, fill: '#8a8872' }} width={35} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey={activeMetric}
                                            stroke={metric.color}
                                            strokeWidth={2}
                                            fill={`url(#gradient-${activeMetric})`}
                                            animationDuration={800}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Summary stats */}
                            <div className="flex gap-3 mt-3">
                                {summary.avgTemp != null && (
                                    <div className="clay-tile px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Avg Temp</p>
                                        <p className="text-sm font-bold text-copperwood tabular-nums">{summary.avgTemp}°C</p>
                                    </div>
                                )}
                                {summary.totalPrecip != null && (
                                    <div className="clay-tile px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Total Rain</p>
                                        <p className="text-sm font-bold text-olive-leaf tabular-nums">{summary.totalPrecip}mm</p>
                                    </div>
                                )}
                                {summary.avgHumidity != null && (
                                    <div className="clay-tile px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Avg Humidity</p>
                                        <p className="text-sm font-bold text-sunlit-clay tabular-nums">{summary.avgHumidity}%</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {!loading && !error && chartData.length === 0 && !hasFetched && (
                        <div className="text-center py-8 space-y-2">
                            <p className="text-black-forest/40 text-xs">Expand to load historical data</p>
                        </div>
                    )}

                    {!loading && !error && chartData.length === 0 && hasFetched && (
                        <p className="text-black-forest/30 text-xs text-center py-8">No historical data available</p>
                    )}
                </div>
            )}
        </motion.div>
    )
}

export default HistoricalChart
