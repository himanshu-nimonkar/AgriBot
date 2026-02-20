import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, CloudRain, Thermometer, Sun, TrendingUp, TrendingDown, Minus } from 'lucide-react'

function WeeklySummary({ weatherData }) {
    const summary = useMemo(() => {
        if (!weatherData?.forecast?.length) return null
        const forecast = weatherData.forecast

        const totalRain = forecast.reduce((s, d) => s + (typeof d.precipitation_sum === 'number' ? d.precipitation_sum : 0), 0)
        const avgTempMax = forecast.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / forecast.length
        const avgTempMin = forecast.reduce((s, d) => s + (typeof d.temp_min === 'number' ? d.temp_min : 0), 0) / forecast.length
        const sunnyDays = forecast.filter(d => typeof d.precipitation_sum === 'number' && d.precipitation_sum < 1).length
        const rainyDays = forecast.length - sunnyDays

        // Temperature trend
        const firstHalf = forecast.slice(0, Math.ceil(forecast.length / 2))
        const secondHalf = forecast.slice(Math.ceil(forecast.length / 2))
        const firstAvg = firstHalf.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / firstHalf.length
        const secondAvg = secondHalf.reduce((s, d) => s + (typeof d.temp_max === 'number' ? d.temp_max : 0), 0) / secondHalf.length
        const tempTrend = secondAvg - firstAvg

        // Find extreme days
        const hottest = forecast.reduce((max, d) => (typeof d.temp_max === 'number' && d.temp_max > (max?.temp_max ?? -999)) ? d : max, null)
        const coldest = forecast.reduce((min, d) => (typeof d.temp_min === 'number' && d.temp_min < (min?.temp_min ?? 999)) ? d : min, null)

        return { totalRain, avgTempMax, avgTempMin, sunnyDays, rainyDays, tempTrend, hottest, coldest }
    }, [weatherData])

    if (!summary) {
        return (
            <div className="clay-card-static p-4">
                <div className="flex items-center gap-2 mb-3">
                    <div className="skeleton h-3 w-24 rounded"></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="clay-tile p-2.5 space-y-1.5">
                            <div className="skeleton h-2 w-12 rounded"></div>
                            <div className="skeleton h-5 w-16 rounded"></div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const TrendIcon = summary.tempTrend > 1 ? TrendingUp : summary.tempTrend < -1 ? TrendingDown : Minus

    return (
        <div className="clay-card-static p-4">
            <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em] mb-3 flex items-center gap-2">
                <Calendar size={14} className="text-olive-leaf" />
                This Week's Outlook
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="clay-tile p-2.5"
                >
                    <div className="flex items-center gap-1.5 mb-1">
                        <Thermometer size={12} className="text-copperwood" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Avg Temp</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-base font-bold text-black-forest font-mono tabular-nums">
                            {summary.avgTempMax.toFixed(0)}°
                        </span>
                        <span className="text-[10px] text-black-forest/40">/ {summary.avgTempMin.toFixed(0)}°</span>
                        <TrendIcon size={10} className={`ml-auto ${summary.tempTrend > 1 ? 'text-copperwood' : summary.tempTrend < -1 ? 'text-blue-500' : 'text-black-forest/30'}`} />
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="clay-tile p-2.5"
                >
                    <div className="flex items-center gap-1.5 mb-1">
                        <CloudRain size={12} className="text-[#2563eb]" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Total Rain</span>
                    </div>
                    <span className="text-base font-bold text-black-forest font-mono tabular-nums">
                        {summary.totalRain.toFixed(1)}<span className="text-[10px] text-black-forest/40 ml-0.5">mm</span>
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="clay-tile p-2.5"
                >
                    <div className="flex items-center gap-1.5 mb-1">
                        <Sun size={12} className="text-sunlit-clay" />
                        <span className="text-[10px] text-black-forest/50 font-medium">Sunny Days</span>
                    </div>
                    <span className="text-base font-bold text-black-forest font-mono tabular-nums">
                        {summary.sunnyDays}<span className="text-[10px] text-black-forest/40 ml-0.5">/ {weatherData.forecast.length}</span>
                    </span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="clay-tile p-2.5"
                >
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendIcon size={12} className={summary.tempTrend > 1 ? 'text-copperwood' : summary.tempTrend < -1 ? 'text-blue-500' : 'text-olive-leaf'} />
                        <span className="text-[10px] text-black-forest/50 font-medium">Trend</span>
                    </div>
                    <span className="text-[11px] font-semibold text-black-forest/70">
                        {summary.tempTrend > 1 ? 'Warming' : summary.tempTrend < -1 ? 'Cooling' : 'Stable'}
                    </span>
                </motion.div>
            </div>
        </div>
    )
}

export default WeeklySummary
