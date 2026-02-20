import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Thermometer, CloudRain, Wind, TrendingUp, TrendingDown } from 'lucide-react'

function AnomalyBadge({ weatherData, isDesktop = false }) {
    const anomalies = useMemo(() => {
        if (!weatherData) return []
        const items = []
        const temp = weatherData.temperature_c
        const wind = weatherData.wind_speed_kmh
        const precip = weatherData.precipitation_mm
        const humidity = weatherData.relative_humidity

        // Extreme heat
        if (temp != null && temp > 38) {
            items.push({
                type: 'danger',
                icon: Thermometer,
                label: 'Extreme Heat',
                detail: `${temp.toFixed(1)}°C — crop heat stress likely`,
                color: 'text-red-500',
                bg: 'bg-red-50 border-red-200'
            })
        }

        // Frost risk
        if (temp != null && temp < 2) {
            items.push({
                type: 'danger',
                icon: Thermometer,
                label: 'Frost Warning',
                detail: `${temp.toFixed(1)}°C — protect sensitive crops`,
                color: 'text-blue-500',
                bg: 'bg-blue-50 border-blue-200'
            })
        }

        // Heavy rainfall
        if (precip != null && precip > 25) {
            items.push({
                type: 'warning',
                icon: CloudRain,
                label: 'Heavy Rain',
                detail: `${precip.toFixed(1)}mm — potential flooding/erosion`,
                color: 'text-olive-leaf',
                bg: 'bg-[#f4f6ef] border-olive-leaf/30'
            })
        }

        // High wind
        if (wind != null && wind > 40) {
            items.push({
                type: 'warning',
                icon: Wind,
                label: 'High Wind',
                detail: `${wind.toFixed(0)} km/h — avoid spraying`,
                color: 'text-sunlit-clay',
                bg: 'bg-[#fef9ee] border-sunlit-clay/40'
            })
        }

        // Check forecast for day-to-day temperature swings
        const forecast = weatherData.forecast
        if (forecast?.daily?.temperature_2m_max && forecast.daily.temperature_2m_max.length >= 2) {
            const maxes = forecast.daily.temperature_2m_max
            for (let i = 1; i < Math.min(maxes.length, 4); i++) {
                const diff = maxes[i] - maxes[i - 1]
                if (Math.abs(diff) > 10) {
                    items.push({
                        type: 'info',
                        icon: diff > 0 ? TrendingUp : TrendingDown,
                        label: 'Temperature Swing',
                        detail: `${diff > 0 ? '+' : ''}${diff.toFixed(0)}°C change in ${i} day${i > 1 ? 's' : ''}`,
                        color: 'text-copperwood',
                        bg: 'bg-[#fef9ee] border-copperwood/20'
                    })
                    break // Only show first swing
                }
            }
        }

        return items
    }, [weatherData])

    if (anomalies.length === 0) return null

    const cardItem = {
        hidden: { opacity: 0, y: 14, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }
    }

    const Wrapper = isDesktop ? motion.div : 'div'
    const wrapperProps = isDesktop ? { variants: cardItem, className: "clay-card-static p-3 shrink-0 space-y-2" } : { className: "clay-card-static p-3 space-y-2" }

    return (
        <Wrapper {...wrapperProps}>
            <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-sunlit-clay" />
                <h4 className="text-[10px] font-bold text-black-forest/60 uppercase tracking-wider">
                    Weather Anomalies ({anomalies.length})
                </h4>
            </div>
            <AnimatePresence>
                {anomalies.map((anomaly, i) => {
                    const Icon = anomaly.icon
                    return (
                        <motion.div
                            key={`${anomaly.label}-${i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border ${anomaly.bg}`}
                        >
                            <Icon size={14} className={`${anomaly.color} shrink-0 mt-0.5`} strokeWidth={2} />
                            <div>
                                <p className={`text-xs font-semibold ${anomaly.color}`}>{anomaly.label}</p>
                                <p className="text-[10px] text-black-forest/50 mt-0.5">{anomaly.detail}</p>
                            </div>
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </Wrapper>
    )
}

export default AnomalyBadge
