import { useEffect, useState, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Thermometer, Droplets, Wind, CloudRain } from 'lucide-react'

// Hook: Animate number from 0 to target
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
            const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
            setValue(start + (end - start) * eased)
            if (progress < 1) requestAnimationFrame(step)
            else prev.current = end
        }
        requestAnimationFrame(step)
    }, [target, duration])
    return value
}

// Tile animation variant
const tileVariant = {
    hidden: { opacity: 0, y: 12, scale: 0.96 },
    visible: (i) => ({
        opacity: 1, y: 0, scale: 1,
        transition: { delay: i * 0.06, duration: 0.35, ease: 'easeOut' }
    })
}

function WeatherTelemetry({ data, isLoading }) {
    const [unit, setUnit] = useState(() => localStorage.getItem('ag_unit') || 'metric')

    const toggleUnit = () => {
        const next = unit === 'metric' ? 'imperial' : 'metric'
        setUnit(next)
        localStorage.setItem('ag_unit', next)
    }

    // Convert helpers (defined before hooks so they can be used in derived values)
    const toF = (c) => c !== null && c !== undefined && c !== '--' ? (c * 9/5 + 32) : '--'
    const toMph = (kmh) => kmh !== null && kmh !== undefined && kmh !== '--' ? (kmh * 0.621371) : '--'
    const toIn = (mm) => mm !== null && mm !== undefined && mm !== '--' ? (mm * 0.0393701) : '--'

    // Derive values (safe when data is null — all default to '--')
    const rawTemp = data?.temperature_c ?? '--'
    const rawHumidity = data?.relative_humidity ?? '--'
    const rawWind = data?.wind_speed_kmh ?? '--'
    const rawPrecip = data?.precipitation_mm ?? '--'
    const rawSoil = (data?.soil_moisture_0_7cm != null) ? (data.soil_moisture_0_7cm * 100) : '--'
    const rawEto = data?.reference_evapotranspiration ?? '--'

    const temp = unit === 'imperial' && rawTemp !== '--' ? toF(rawTemp) : rawTemp
    const wind = unit === 'imperial' && rawWind !== '--' ? toMph(rawWind) : rawWind
    const precip = unit === 'imperial' && rawPrecip !== '--' ? toIn(rawPrecip) : rawPrecip

    const tempUnit = unit === 'imperial' ? '°F' : '°C'
    const windUnit = unit === 'imperial' ? 'mph' : 'km/h'
    const precipUnit = unit === 'imperial' ? 'in' : 'mm'

    // ALL HOOKS MUST BE CALLED UNCONDITIONALLY — before any early return
    const animTemp = useAnimatedNumber(temp)
    const animHumidity = useAnimatedNumber(rawHumidity)
    const animWind = useAnimatedNumber(wind)
    const animPrecip = useAnimatedNumber(precip)
    const animSoil = useAnimatedNumber(rawSoil)
    const animEto = useAnimatedNumber(rawEto)

    // ─── Loading / empty state (AFTER all hooks) ───
    if (!data || isLoading) {
        return (
            <div className="clay-card-static p-6" aria-label="Loading weather data">
                <h2 className="text-lg font-semibold text-black-forest flex items-center gap-2 mb-4 text-shadow-subtle">
                    <Thermometer size={18} className="text-sunlit-clay" />
                    Weather Telemetry
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 stagger-children">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="clay-tile p-3 space-y-2">
                            <div className="skeleton h-3 w-20 rounded-lg"></div>
                            <div className="skeleton h-8 w-16 rounded-lg"></div>
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 stagger-children">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="clay-tile p-3 space-y-2">
                            <div className="skeleton h-3 w-24 rounded"></div>
                            <div className="skeleton h-6 w-12 rounded"></div>
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

    // Forecast data
    const forecastData = data.forecast?.map(day => ({
        date: day.date ? day.date.split('-').slice(1).join('/') : '',
        high: unit === 'imperial' ? Math.round(toF(day.temp_max)) : day.temp_max,
        low: unit === 'imperial' ? Math.round(toF(day.temp_min)) : day.temp_min,
        precip: unit === 'imperial' ? +(toIn(day.precipitation_sum || 0)).toFixed(2) : (day.precipitation_sum || 0)
    })) || []

    const totalPrecip = forecastData.reduce((sum, day) => sum + (day.precip || 0), 0).toFixed(1)
    const rainyDays = forecastData.filter(day => day.precip > 0).length

    // Trend indicator
    const TrendIcon = ({ value, threshold = 0 }) => {
        if (value > threshold) return <TrendingUp size={12} className="text-olive-leaf" />
        if (value < -threshold) return <TrendingDown size={12} className="text-copperwood" />
        return <Minus size={12} className="text-black-forest/30" />
    }

    const metrics = [
        { label: 'Temperature', value: animTemp, suffix: tempUnit, icon: <Thermometer size={14} strokeWidth={1.5} className="text-sunlit-clay" />, decimals: 1 },
        { label: 'Humidity', value: animHumidity, suffix: '%', icon: <Droplets size={14} strokeWidth={1.5} className="text-olive-leaf" />, decimals: 0 },
        { label: 'Wind Speed', value: animWind, suffix: ` ${windUnit}`, icon: <Wind size={14} strokeWidth={1.5} className="text-black-forest/50" />, decimals: 1 },
        { label: 'Precipitation', value: animPrecip, suffix: ` ${precipUnit}`, icon: <CloudRain size={14} strokeWidth={1.5} className="text-olive-leaf/70" />, decimals: 1 },
    ]

    return (
        <div className="clay-card-static p-5 md:p-6" role="region" aria-label="Weather conditions">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base md:text-lg font-semibold text-black-forest flex items-center gap-2 text-shadow-subtle">
                    Local Conditions
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

            {/* Current Conditions Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
                {metrics.map((m, i) => (
                    <motion.div
                        key={m.label}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={tileVariant}
                        className="clay-tile p-3"
                    >
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

            {/* Agricultural Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
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

            {/* Forecast Chart */}
            {forecastData.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[11px] font-bold text-black-forest/40 uppercase tracking-[0.12em]">7-Day Forecast</h3>
                        <div className="flex gap-4 text-[11px]">
                            <span className="text-olive-leaf font-medium flex items-center gap-1">
                                <Droplets size={10} /> {totalPrecip}{precipUnit} total
                            </span>
                            <span className="text-black-forest/40">{rainyDays} rainy day{rainyDays !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div className="h-32 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={forecastData}>
                                <defs>
                                    <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#bc6c25" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#bc6c25" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#d4cdb8" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: '#8a8872', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#8a8872', fontSize: 10 }} unit={unit === 'imperial' ? '°F' : '°'} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#f8f4e8',
                                        border: '1px solid #d4cdb8',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        boxShadow: '4px 4px 8px #d4cdb8, -4px -4px 8px #ffffff',
                                        color: '#283618'
                                    }}
                                    itemStyle={{ color: '#283618' }}
                                    animationDuration={200}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="high"
                                    stroke="#bc6c25"
                                    fill="url(#colorHigh)"
                                    strokeWidth={2}
                                    animationBegin={200}
                                    animationDuration={1000}
                                    animationEasing="ease-out"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="low"
                                    stroke="#606c38"
                                    fill="transparent"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    animationBegin={400}
                                    animationDuration={1000}
                                    animationEasing="ease-out"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Precipitation Chart */}
                    <div className="h-24">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={forecastData}>
                                <defs>
                                    <linearGradient id="colorPrecip" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#606c38" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#606c38" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#d4cdb8" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: '#8a8872', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#8a8872', fontSize: 10 }} unit={precipUnit} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#f8f4e8',
                                        border: '1px solid #d4cdb8',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        boxShadow: '4px 4px 8px #d4cdb8, -4px -4px 8px #ffffff',
                                        color: '#283618'
                                    }}
                                    itemStyle={{ color: '#283618' }}
                                    formatter={(value) => [`${value} ${precipUnit}`, 'Precipitation']}
                                    animationDuration={200}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="precip"
                                    stroke="#606c38"
                                    fill="url(#colorPrecip)"
                                    strokeWidth={2}
                                    animationBegin={600}
                                    animationDuration={1000}
                                    animationEasing="ease-out"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    )
}

export default WeatherTelemetry
