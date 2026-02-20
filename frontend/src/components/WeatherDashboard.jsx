import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Thermometer, Droplets, Wind, CloudRain, TrendingUp, TrendingDown, Minus,
    Calendar, Sun, GitCompare, Clock, RefreshCw
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Animated Number Hook ───
function useAnimatedNumber(target, duration = 800) {
    const [value, setValue] = useState(0)
    const prev = useRef(0)
    useEffect(() => {
        if (target === '--' || target === null || target === undefined) { setValue(0); return }
        const start = prev.current
        const end = Number(target)
        if (isNaN(end)) { setValue(0); return }
        const startTime = performance.now()
        const step = (now) => {
            const progress = Math.min((now - startTime) / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(start + (end - start) * eased)
            if (progress < 1) requestAnimationFrame(step)
            else prev.current = end
        }
        requestAnimationFrame(step)
    }, [target, duration])
    return value
}

const tileVariant = {
    hidden: { opacity: 0, y: 12, scale: 0.96 },
    visible: (i) => ({
        opacity: 1, y: 0, scale: 1,
        transition: { delay: i * 0.06, duration: 0.35, ease: 'easeOut' }
    })
}

const TABS = [
    { id: 'current', label: 'Current', icon: Thermometer },
    { id: 'weekly', label: 'Weekly', icon: Calendar },
    { id: 'trends', label: 'Trends', icon: GitCompare },
    { id: 'history', label: 'History', icon: Clock },
]

function WeatherDashboard({
    weatherData,
    isLoading,
    lat,
    lon,
    unitPreference = 'metric',
    onUnitChange
}) {
    const [activeTab, setActiveTab] = useState('current')
    const unit = unitPreference

    const toggleUnit = () => {
        const next = unit === 'metric' ? 'imperial' : 'metric'
        localStorage.setItem('ag_unit', next)
        if (onUnitChange) onUnitChange(next)
    }

    const toF = (c) => c !== null && c !== undefined && c !== '--' ? (c * 9/5 + 32) : '--'
    const toMph = (kmh) => kmh !== null && kmh !== undefined && kmh !== '--' ? (kmh * 0.621371) : '--'
    const toIn = (mm) => mm !== null && mm !== undefined && mm !== '--' ? (mm * 0.0393701) : '--'

    const tempUnit = unit === 'imperial' ? '°F' : '°C'
    const windUnit = unit === 'imperial' ? 'mph' : 'km/h'
    const precipUnit = unit === 'imperial' ? 'in' : 'mm'

    // Current conditions values
    const rawTemp = weatherData?.temperature_c ?? '--'
    const rawHumidity = weatherData?.relative_humidity ?? '--'
    const rawWind = weatherData?.wind_speed_kmh ?? '--'
    const rawPrecip = weatherData?.precipitation_mm ?? '--'
    const rawSoil = (weatherData?.soil_moisture_0_7cm != null) ? (weatherData.soil_moisture_0_7cm * 100) : '--'
    const rawEto = weatherData?.reference_evapotranspiration ?? '--'

    const temp = unit === 'imperial' && rawTemp !== '--' ? toF(rawTemp) : rawTemp
    const wind = unit === 'imperial' && rawWind !== '--' ? toMph(rawWind) : rawWind
    const precip = unit === 'imperial' && rawPrecip !== '--' ? toIn(rawPrecip) : rawPrecip

    // ALL HOOKS UNCONDITIONAL
    const animTemp = useAnimatedNumber(temp)
    const animHumidity = useAnimatedNumber(rawHumidity)
    const animWind = useAnimatedNumber(wind)
    const animPrecip = useAnimatedNumber(precip)
    const animSoil = useAnimatedNumber(rawSoil)
    const animEto = useAnimatedNumber(rawEto)

    // ─── Loading state ───
    if (!weatherData || isLoading) {
        return (
            <div className="clay-card p-5" aria-label="Loading weather data">
                <div className="flex items-center gap-2 mb-4">
                    <div className="skeleton h-4 w-32 rounded-lg"></div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger-children">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="clay-tile p-3 space-y-2">
                            <div className="skeleton h-3 w-20 rounded-lg"></div>
                            <div className="skeleton h-8 w-16 rounded-lg"></div>
                        </div>
                    ))}
                </div>
                <div className="skeleton h-32 w-full rounded-xl"></div>
            </div>
        )
    }

    const getRiskClass = (risk) => {
        if (!risk) return 'risk-badge low'
        switch (risk.toLowerCase()) {
            case 'high': return 'risk-badge high'
            case 'medium': return 'risk-badge medium'
            default: return 'risk-badge low'
        }
    }

    return (
        <div className="clay-card overflow-hidden" role="region" aria-label="Weather dashboard">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-olive-leaf/10 via-olive-leaf/5 to-transparent px-5 pt-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-black-forest uppercase tracking-[0.1em] flex items-center gap-2">
                        <Thermometer size={15} className="text-olive-leaf" />
                        Weather Intelligence
                    </h2>
                    <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={toggleUnit}
                        className="text-[10px] font-bold text-olive-leaf/60 hover:text-olive-leaf px-2.5 py-1 rounded-lg clay-input transition-colors uppercase tracking-wider"
                        aria-label={`Switch to ${unit === 'metric' ? 'imperial' : 'metric'} units`}
                    >
                        {unit === 'metric' ? '°C / km' : '°F / mi'}
                    </motion.button>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 bg-[var(--clay-inset)] rounded-xl p-1">
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                                    isActive
                                        ? 'bg-[var(--clay-surface)] shadow-sm text-olive-leaf'
                                        : 'text-black-forest/40 hover:text-black-forest/60'
                                }`}
                            >
                                <Icon size={11} strokeWidth={isActive ? 2 : 1.5} />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="p-5 pt-4">
                <AnimatePresence mode="wait">
                    {activeTab === 'current' && (
                        <CurrentTab
                            key="current"
                            animTemp={animTemp} animHumidity={animHumidity} animWind={animWind}
                            animPrecip={animPrecip} animSoil={animSoil} animEto={animEto}
                            temp={temp} rawSoil={rawSoil} rawEto={rawEto}
                            tempUnit={tempUnit} windUnit={windUnit} precipUnit={precipUnit}
                            data={weatherData} getRiskClass={getRiskClass}
                            forecastData={weatherData.forecast} unit={unit} toF={toF} toIn={toIn}
                        />
                    )}
                    {activeTab === 'weekly' && (
                        <WeeklyTab key="weekly" weatherData={weatherData} unit={unit} toF={toF} toIn={toIn} />
                    )}
                    {activeTab === 'trends' && (
                        <TrendsTab key="trends" lat={lat} lon={lon} unit={unit} toF={toF} toIn={toIn} />
                    )}
                    {activeTab === 'history' && (
                        <HistoryTab key="history" lat={lat} lon={lon} unit={unit} toF={toF} toIn={toIn} />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// TAB 1: CURRENT CONDITIONS
// ─────────────────────────────────────────────
function CurrentTab({ animTemp, animHumidity, animWind, animPrecip, animSoil, animEto,
    temp, rawSoil, rawEto, tempUnit, windUnit, precipUnit, data, getRiskClass,
    forecastData, unit, toF, toIn }) {

    const metrics = [
        { label: 'Temperature', value: animTemp, suffix: tempUnit, icon: <Thermometer size={14} strokeWidth={1.5} className="text-sunlit-clay" />, decimals: 1 },
        { label: 'Humidity', value: animHumidity, suffix: '%', icon: <Droplets size={14} strokeWidth={1.5} className="text-olive-leaf" />, decimals: 0 },
        { label: 'Wind Speed', value: animWind, suffix: ` ${windUnit}`, icon: <Wind size={14} strokeWidth={1.5} className="text-black-forest/50" />, decimals: 1 },
        { label: 'Precipitation', value: animPrecip, suffix: ` ${precipUnit}`, icon: <CloudRain size={14} strokeWidth={1.5} className="text-olive-leaf/70" />, decimals: 1 },
    ]

    const fData = forecastData?.map(day => ({
        date: day.date ? day.date.split('-').slice(1).join('/') : '',
        high: unit === 'imperial' ? Math.round(toF(day.temp_max)) : day.temp_max,
        low: unit === 'imperial' ? Math.round(toF(day.temp_min)) : day.temp_min,
        precip: unit === 'imperial' ? +(toIn(day.precipitation_sum || 0)).toFixed(2) : (day.precipitation_sum || 0)
    })) || []

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {metrics.map((m, i) => (
                    <motion.div key={m.label} custom={i} initial="hidden" animate="visible" variants={tileVariant} className="clay-tile p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            {m.icon}
                            <p className="text-[11px] text-black-forest/50 font-medium">{m.label}</p>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <p className="text-2xl font-bold text-black-forest tabular-nums">
                                {m.value !== 0 || (temp !== '--') ? m.value.toFixed(m.decimals) : '--'}
                            </p>
                            <span className="text-sm font-normal text-black-forest/40">{m.suffix}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <motion.div custom={4} initial="hidden" animate="visible" variants={tileVariant} className="clay-tile p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Droplets size={14} className="text-olive-leaf" />
                        <p className="text-[11px] text-black-forest/50 font-medium">Soil Mst (0-7cm)</p>
                    </div>
                    <p className="text-xl font-bold text-olive-leaf tabular-nums">{rawSoil !== '--' ? animSoil.toFixed(1) : '--'}%</p>
                </motion.div>

                <motion.div custom={5} initial="hidden" animate="visible" variants={tileVariant} className="clay-tile p-3">
                    <p className="text-[11px] text-black-forest/50 mb-1 font-medium">Reference ET</p>
                    <p className="text-xl font-bold text-sunlit-clay tabular-nums">{rawEto !== '--' ? animEto.toFixed(1) : '--'} mm</p>
                </motion.div>

                <motion.div custom={6} initial="hidden" animate="visible" variants={tileVariant} className="clay-tile p-3">
                    <p className="text-[11px] text-black-forest/50 mb-1 font-medium">Spray Risk</p>
                    <span className={getRiskClass(data.spray_drift_risk)}>
                        {(data.spray_drift_risk || 'N/A').toUpperCase()}
                    </span>
                </motion.div>

                <motion.div custom={7} initial="hidden" animate="visible" variants={tileVariant} className="clay-tile p-3">
                    <p className="text-[11px] text-black-forest/50 mb-1 font-medium">Fungal Risk</p>
                    <span className={getRiskClass(data.fungal_risk)}>
                        {(data.fungal_risk || 'N/A').toUpperCase()}
                    </span>
                </motion.div>
            </div>

            {/* Mini forecast chart */}
            {fData.length > 0 && (
                <div className="h-28 -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={fData}>
                            <defs>
                                <linearGradient id="colorHighDash" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#bc6c25" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#bc6c25" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d4cdb8" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: '#8a8872', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#8a8872', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#f8f4e8', border: '1px solid #d4cdb8', borderRadius: '12px', fontSize: '12px', boxShadow: '4px 4px 8px #d4cdb8, -4px -4px 8px #ffffff', color: '#283618' }} />
                            <Area type="monotone" dataKey="high" stroke="#bc6c25" fill="url(#colorHighDash)" strokeWidth={2} dot={false} animationDuration={1500} animationEasing="ease-out" className="chart-animate-line" />
                            <Area type="monotone" dataKey="low" stroke="#606c38" fill="transparent" strokeWidth={2} strokeDasharray="5 5" dot={false} animationDuration={900} animationEasing="ease-out" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </motion.div>
    )
}

// ─────────────────────────────────────────────
// TAB 2: WEEKLY OUTLOOK
// ─────────────────────────────────────────────
function WeeklyTab({ weatherData, unit = 'metric', toF, toIn }) {
    const summary = useMemo(() => {
        if (!weatherData?.forecast?.length) return null
        const forecast = weatherData.forecast
        const totalRain = forecast.reduce((s, d) => s + (typeof d.precipitation_sum === 'number' ? d.precipitation_sum : 0), 0)
        const avgTempMax = forecast.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / forecast.length
        const avgTempMin = forecast.reduce((s, d) => s + (typeof d.temp_min === 'number' ? d.temp_min : 0), 0) / forecast.length
        const sunnyDays = forecast.filter(d => typeof d.precipitation_sum === 'number' && d.precipitation_sum < 1).length
        const rainyDays = forecast.length - sunnyDays

        const firstHalf = forecast.slice(0, Math.ceil(forecast.length / 2))
        const secondHalf = forecast.slice(Math.ceil(forecast.length / 2))
        const firstAvg = firstHalf.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / firstHalf.length
        const secondAvg = secondHalf.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / secondHalf.length
        const tempTrend = secondAvg - firstAvg

        return { totalRain, avgTempMax, avgTempMin, sunnyDays, rainyDays, tempTrend, forecastLen: forecast.length }
    }, [weatherData])

    if (!summary) return <p className="text-xs text-black-forest/30 text-center py-8">No forecast data</p>

    const TrendIcon = summary.tempTrend > 1 ? TrendingUp : summary.tempTrend < -1 ? TrendingDown : Minus
    const rainUnit = unit === 'imperial' ? 'in' : 'mm'
    
    // Animated values
    const rawMax = unit === 'imperial' ? toF(summary.avgTempMax) : summary.avgTempMax
    const rawMin = unit === 'imperial' ? toF(summary.avgTempMin) : summary.avgTempMin
    const rawRain = unit === 'imperial' ? toIn(summary.totalRain) : summary.totalRain

    const animMax = useAnimatedNumber(rawMax)
    const animMin = useAnimatedNumber(rawMin)
    const animRain = useAnimatedNumber(rawRain)
    const animSunny = useAnimatedNumber(summary.sunnyDays)

    const displayMax = animMax.toFixed(0)
    const displayMin = animMin.toFixed(0)
    const displayRain = animRain.toFixed(1)

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="grid grid-cols-2 gap-3">
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="clay-tile p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Thermometer size={12} className="text-copperwood" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Avg Temp</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <motion.span
                            key={`${displayMax}-${displayMin}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4 }}
                            className="text-lg font-bold text-black-forest font-mono tabular-nums"
                        >{displayMax}°</motion.span>
                        <span className="text-[10px] text-black-forest/40">/ {displayMin}°</span>
                        <TrendIcon size={10} className={`ml-auto ${summary.tempTrend > 1 ? 'text-copperwood' : summary.tempTrend < -1 ? 'text-blue-500' : 'text-black-forest/30'}`} />
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="clay-tile p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <CloudRain size={12} className="text-[#2563eb]" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Total Rain</span>
                    </div>
                    <motion.span
                        key={displayRain}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className="text-lg font-bold text-black-forest font-mono tabular-nums"
                    >
                        {displayRain}<span className="text-[10px] text-black-forest/40 ml-0.5">{rainUnit}</span>
                    </motion.span>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="clay-tile p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Sun size={12} className="text-sunlit-clay" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Sunny Days</span>
                    </div>
                    <motion.span
                        key={summary.sunnyDays}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className="text-lg font-bold text-black-forest font-mono tabular-nums"
                    >
                        {animSunny.toFixed(0)}<span className="text-[10px] text-black-forest/40 ml-0.5">/ {summary.forecastLen}</span>
                    </motion.span>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="clay-tile p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendIcon size={12} className={summary.tempTrend > 1 ? 'text-copperwood' : summary.tempTrend < -1 ? 'text-blue-500' : 'text-olive-leaf'} />
                        <span className="text-[10px] text-black-forest/50 font-medium">Trend</span>
                    </div>
                    <motion.span
                        key={summary.tempTrend > 1 ? 'warm' : summary.tempTrend < -1 ? 'cool' : 'stable'}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-sm font-semibold text-black-forest/70"
                    >
                        {summary.tempTrend > 1 ? 'Warming' : summary.tempTrend < -1 ? 'Cooling' : 'Stable'}
                    </motion.span>
                </motion.div>
            </div>
        </motion.div>
    )
}

// ─────────────────────────────────────────────
// TAB 3: TRENDS (Year-over-Year comparison)
// ─────────────────────────────────────────────
function TrendsTab({ lat = 38.5449, lon = -121.7405, unit = 'metric', toF, toIn }) {
    const [lastYearData, setLastYearData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [metric, setMetric] = useState('temp')

    useEffect(() => {
        const fetchLastYear = async () => {
            setLoading(true)
            try {
                const now = new Date()
                const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
                const lastYearStart = new Date(lastYearEnd)
                lastYearStart.setDate(lastYearStart.getDate() - 30)
                const thisYearStart = new Date(now)
                thisYearStart.setDate(thisYearStart.getDate() - 30)
                const fmt = d => d.toISOString().slice(0, 10)

                const [lastRes, thisRes] = await Promise.all([
                    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(lastYearStart)}&end_date=${fmt(lastYearEnd)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`),
                    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(thisYearStart)}&end_date=${fmt(now)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`)
                ])
                const [lastData, thisData] = await Promise.all([lastRes.json(), thisRes.json()])
                setLastYearData({ last: lastData.daily, current: thisData.daily })
            } catch (err) {
                console.error('Comparison fetch error:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchLastYear()
    }, [lat, lon])

    const chartData = useMemo(() => {
        if (!lastYearData) return []
        const { last, current } = lastYearData
        const len = Math.min(last?.time?.length || 0, current?.time?.length || 0, 30)
        const data = []
        for (let i = 0; i < len; i++) {
            const entry = { day: i + 1 }
            if (metric === 'temp') {
                const thisTemp = current.temperature_2m_max?.[i] ?? 0
                const lastTemp = last.temperature_2m_max?.[i] ?? 0
                entry.thisYear = unit === 'imperial' ? toF(thisTemp) : thisTemp
                entry.lastYear = unit === 'imperial' ? toF(lastTemp) : lastTemp
            } else {
                const thisRain = current.precipitation_sum?.[i] ?? 0
                const lastRain = last.precipitation_sum?.[i] ?? 0
                entry.thisYear = unit === 'imperial' ? toIn(thisRain) : thisRain
                entry.lastYear = unit === 'imperial' ? toIn(lastRain) : lastRain
            }
            data.push(entry)
        }
        return data
    }, [lastYearData, metric, unit, toF, toIn])

    const comparison = useMemo(() => {
        if (!chartData.length) return null
        const thisAvg = chartData.reduce((s, d) => s + d.thisYear, 0) / chartData.length
        const lastAvg = chartData.reduce((s, d) => s + d.lastYear, 0) / chartData.length
        const diff = thisAvg - lastAvg
        const pctDiff = lastAvg !== 0 ? ((diff / lastAvg) * 100) : 0
        return { thisAvg, lastAvg, diff, pctDiff }
    }, [chartData])

    // Animated values moved to top level
    const animThisYear = useAnimatedNumber(comparison?.thisAvg || 0)
    const animLastYear = useAnimatedNumber(comparison?.lastAvg || 0)
    const animPctDiff = useAnimatedNumber(comparison?.pctDiff || 0)

    const valueUnit = metric === 'temp'
        ? (unit === 'imperial' ? '°F' : '°C')
        : (unit === 'imperial' ? 'in' : 'mm')

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="inline-flex items-center gap-1 rounded-xl p-1 bg-[var(--clay-inset)] mb-4">
                <button
                    onClick={() => setMetric('temp')}
                    className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all ${metric === 'temp' ? 'bg-[var(--clay-surface)] shadow-sm text-olive-leaf' : 'text-black-forest/40 hover:text-black-forest/60'}`}
                >
                    <Thermometer size={10} /> Temperature
                </button>
                <button
                    onClick={() => setMetric('precip')}
                    className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all ${metric === 'precip' ? 'bg-[var(--clay-surface)] shadow-sm text-olive-leaf' : 'text-black-forest/40 hover:text-black-forest/60'}`}
                >
                    <CloudRain size={10} /> Rainfall
                </button>
            </div>

            {loading ? (
                <div className="space-y-2">
                    <div className="skeleton h-28 w-full rounded-xl"></div>
                    <div className="flex gap-2">
                        <div className="skeleton h-8 w-1/2 rounded-lg"></div>
                        <div className="skeleton h-8 w-1/2 rounded-lg"></div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="h-28 -mx-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart key={`trends-${metric}-${unit}`} data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="thisYearGradDash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#606c38" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#606c38" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="lastYearGradDash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#bc6c25" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#bc6c25" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#f8f4e8', border: '1px solid #d4cdb8', borderRadius: '12px', fontSize: '11px', color: '#283618' }} />
                                <Area type="monotone" dataKey="thisYear" stroke="#606c38" fill="url(#thisYearGradDash)" strokeWidth={2} dot={false} name="This Year" animationDuration={1500} animationEasing="ease-out" className="chart-animate-line" />
                                <Area type="monotone" dataKey="lastYear" stroke="#bc6c25" fill="url(#lastYearGradDash)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Last Year" animationDuration={900} animationEasing="ease-out" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {comparison && (
                        <div className="flex gap-2 mt-3">
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">This Year</span>
                                <span className="text-xs font-bold text-olive-leaf font-mono tabular-nums">
                                    {animThisYear.toFixed(1)}{valueUnit}
                                </span>
                            </div>
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">Last Year</span>
                                <span className="text-xs font-bold text-copperwood font-mono tabular-nums">
                                    {animLastYear.toFixed(1)}{valueUnit}
                                </span>
                            </div>
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">Change</span>
                                <span className={`text-xs font-bold font-mono tabular-nums flex items-center justify-center gap-0.5 ${comparison.diff > 0 ? 'text-copperwood' : comparison.diff < 0 ? 'text-blue-500' : 'text-black-forest/40'}`}>
                                    {comparison.diff > 0 ? <TrendingUp size={10} /> : comparison.diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                    {Math.abs(animPctDiff).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-[9px] text-black-forest/40">
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-olive-leaf rounded"></span> This Year</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-copperwood rounded border-dashed"></span> Last Year</span>
                    </div>
                </>
            )}
        </motion.div>
    )
}

// ─────────────────────────────────────────────
// TAB 4: HISTORY (30-day chart)
// ─────────────────────────────────────────────
function HistoryTab({ lat = 38.5449, lon = -121.7405, unit = 'metric', toF, toIn }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [activeMetric, setActiveMetric] = useState('temp')

    const METRICS = [
        { key: 'temp', label: 'Temp', color: '#bc6c25', unit: unit === 'imperial' ? '°F' : '°C', icon: Thermometer },
        { key: 'precip', label: 'Rain', color: '#606c38', unit: unit === 'imperial' ? 'in' : 'mm', icon: Droplets },
        { key: 'humidity', label: 'Humidity', color: '#dda15e', unit: '%', icon: TrendingUp }
    ]

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true); setError(null)
            try {
                const end = new Date().toISOString().split('T')[0]
                const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean&start_date=${start}&end_date=${end}&timezone=auto`
                const res = await fetch(url)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const json = await res.json()
                setData(json.daily)
            } catch (e) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        fetchHistory()
    }, [lat, lon])

    const chartData = useMemo(() => {
        if (!data?.time) return []
        return data.time.map((date, i) => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            temp: data.temperature_2m_max?.[i] != null && data.temperature_2m_min?.[i] != null ? (() => {
                const avgC = Math.round(((data.temperature_2m_max[i] + data.temperature_2m_min[i]) / 2) * 10) / 10
                return unit === 'imperial' ? Number(toF(avgC).toFixed(1)) : avgC
            })() : null,
            precip: data.precipitation_sum?.[i] != null
                ? (unit === 'imperial' ? Number(toIn(data.precipitation_sum[i]).toFixed(2)) : data.precipitation_sum[i])
                : null,
            humidity: data.relative_humidity_2m_mean?.[i] ?? null
        })).filter(d => d[activeMetric] != null)
    }, [data, activeMetric, unit, toF, toIn])

    const metric = METRICS.find(m => m.key === activeMetric)

    const summary = useMemo(() => {
        if (!data?.time) return {}
        const temps = data.time.map((_, i) =>
            (data.temperature_2m_max?.[i] != null && data.temperature_2m_min?.[i] != null)
                ? (data.temperature_2m_max[i] + data.temperature_2m_min[i]) / 2 : null
        ).filter(Boolean)
        const precips = data.precipitation_sum?.filter(p => p != null) || []
        const humids = data.relative_humidity_2m_mean?.filter(h => h != null) || []
        return {
            avgTemp: temps.length ? (unit === 'imperial'
                ? toF(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
                : (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null,
            totalPrecip: precips.length ? (unit === 'imperial'
                ? toIn(precips.reduce((a, b) => a + b, 0)).toFixed(2)
                : precips.reduce((a, b) => a + b, 0).toFixed(1)) : null,
            avgHumidity: humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(0) : null,
        }
    }, [data, unit, toF, toIn])

    // Moved hooks to top level
    const animAvgTemp = useAnimatedNumber(summary.avgTemp ? Number(summary.avgTemp) : 0)
    const animTotalPrecip = useAnimatedNumber(summary.totalPrecip ? Number(summary.totalPrecip) : 0)
    const animAvgHumidity = useAnimatedNumber(summary.avgHumidity ? Number(summary.avgHumidity) : 0)

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {/* Metric Tabs */}
            <div className="flex gap-1 bg-[var(--clay-inset)] rounded-lg p-0.5 mb-4 w-fit">
                {METRICS.map(m => {
                    const Icon = m.icon
                    return (
                        <button
                            key={m.key}
                            onClick={() => setActiveMetric(m.key)}
                            className={`flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-md font-semibold transition-all ${
                                activeMetric === m.key ? 'bg-[var(--clay-surface)] shadow-sm text-olive-leaf' : 'text-black-forest/40'
                            }`}
                        >
                            <Icon size={10} /> {m.label}
                        </button>
                    )
                })}
            </div>

            {loading && (
                <div className="h-[180px] flex items-center justify-center">
                    <div className="flex gap-1"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>
                </div>
            )}

            {error && (
                <div className="text-center py-8 space-y-2">
                    <p className="text-copperwood text-xs">Failed to load: {error}</p>
                    <button onClick={() => setError(null)} className="clay-button px-3 py-1.5 text-xs text-olive-leaf inline-flex items-center gap-1.5">
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {!loading && !error && chartData.length > 0 && (
                <>
                    <div className="h-[180px] -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart key={`history-${activeMetric}-${unit}`} data={chartData}>
                                <defs>
                                    <linearGradient id={`gradient-hist-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={metric.color} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={metric.color} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(40,54,24,0.06)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8a8872' }} interval={Math.floor(chartData.length / 6)} />
                                <YAxis tick={{ fontSize: 10, fill: '#8a8872' }} width={35} />
                                <Tooltip contentStyle={{ backgroundColor: '#f8f4e8', border: '1px solid #d4cdb8', borderRadius: '12px', fontSize: '11px', color: '#283618' }} />
                                <Area type="monotone" dataKey={activeMetric} stroke={metric.color} strokeWidth={2} fill={`url(#gradient-hist-${activeMetric})`} animationDuration={1500} className="chart-animate-line" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="flex gap-3 mt-3">
                        {summary.avgTemp != null && (
                            <div className="clay-tile px-3 py-2 flex-1 text-center">
                                <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Avg Temp</p>
                                <p className="text-sm font-bold text-copperwood tabular-nums">{animAvgTemp.toFixed(1)}{unit === 'imperial' ? '°F' : '°C'}</p>
                            </div>
                        )}
                        {summary.totalPrecip != null && (
                            <div className="clay-tile px-3 py-2 flex-1 text-center">
                                <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Total Rain</p>
                                <p className="text-sm font-bold text-olive-leaf tabular-nums">{animTotalPrecip.toFixed(1)}{unit === 'imperial' ? 'in' : 'mm'}</p>
                            </div>
                        )}
                        {summary.avgHumidity != null && (
                            <div className="clay-tile px-3 py-2 flex-1 text-center">
                                <p className="text-[10px] text-black-forest/40 uppercase tracking-wide">Avg Humidity</p>
                                <p className="text-sm font-bold text-sunlit-clay tabular-nums">{animAvgHumidity.toFixed(0)}%</p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!loading && !error && chartData.length === 0 && (
                <p className="text-black-forest/30 text-xs text-center py-8">No historical data available</p>
            )}
        </motion.div>
    )
}

export default WeatherDashboard
