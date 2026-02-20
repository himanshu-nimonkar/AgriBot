import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { GitCompare, Thermometer, CloudRain, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function ComparisonMode({ lat = 38.5449, lon = -121.7405 }) {
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
                entry.thisYear = current.temperature_2m_max?.[i] ?? 0
                entry.lastYear = last.temperature_2m_max?.[i] ?? 0
            } else {
                entry.thisYear = current.precipitation_sum?.[i] ?? 0
                entry.lastYear = last.precipitation_sum?.[i] ?? 0
            }
            data.push(entry)
        }
        return data
    }, [lastYearData, metric])

    const comparison = useMemo(() => {
        if (!chartData.length) return null
        const thisAvg = chartData.reduce((s, d) => s + d.thisYear, 0) / chartData.length
        const lastAvg = chartData.reduce((s, d) => s + d.lastYear, 0) / chartData.length
        const diff = thisAvg - lastAvg
        const pctDiff = lastAvg !== 0 ? ((diff / lastAvg) * 100) : 0
        return { thisAvg, lastAvg, diff, pctDiff }
    }, [chartData])

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
            <div className="clay-card-sm p-2 text-[10px] !rounded-lg shadow-clay-sm">
                <p className="font-semibold text-black-forest mb-1">Day {label}</p>
                <p className="text-olive-leaf">This Year: {payload[0]?.value?.toFixed(1)}{metric === 'temp' ? '°C' : 'mm'}</p>
                <p className="text-copperwood">Last Year: {payload[1]?.value?.toFixed(1)}{metric === 'temp' ? '°C' : 'mm'}</p>
            </div>
        )
    }

    return (
        <div className="clay-card-static p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em] flex items-center gap-2">
                    <GitCompare size={14} className="text-olive-leaf" />
                    Year-over-Year
                </h3>
                <div className="flex gap-1">
                    <button
                        onClick={() => setMetric('temp')}
                        className={`text-[9px] px-2 py-1 rounded-full font-semibold transition-all ${metric === 'temp' ? 'clay-primary text-white' : 'clay-button text-black-forest/50'}`}
                    >
                        <Thermometer size={10} className="inline mr-0.5" /> Temp
                    </button>
                    <button
                        onClick={() => setMetric('precip')}
                        className={`text-[9px] px-2 py-1 rounded-full font-semibold transition-all ${metric === 'precip' ? 'clay-primary text-white' : 'clay-button text-black-forest/50'}`}
                    >
                        <CloudRain size={10} className="inline mr-0.5" /> Rain
                    </button>
                </div>
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
                            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="thisYearGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#606c38" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#606c38" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="lastYearGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#bc6c25" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#bc6c25" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="thisYear" stroke="#606c38" fill="url(#thisYearGrad)" strokeWidth={2} dot={false} name="This Year" />
                                <Area type="monotone" dataKey="lastYear" stroke="#bc6c25" fill="url(#lastYearGrad)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Last Year" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {comparison && (
                        <div className="flex gap-2 mt-2">
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">This Year</span>
                                <span className="text-xs font-bold text-olive-leaf font-mono tabular-nums">
                                    {comparison.thisAvg.toFixed(1)}{metric === 'temp' ? '°C' : 'mm'}
                                </span>
                            </div>
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">Last Year</span>
                                <span className="text-xs font-bold text-copperwood font-mono tabular-nums">
                                    {comparison.lastAvg.toFixed(1)}{metric === 'temp' ? '°C' : 'mm'}
                                </span>
                            </div>
                            <div className="clay-tile p-2 flex-1 text-center">
                                <span className="text-[9px] text-black-forest/50 block">Change</span>
                                <span className={`text-xs font-bold font-mono tabular-nums flex items-center justify-center gap-0.5 ${comparison.diff > 0 ? 'text-copperwood' : comparison.diff < 0 ? 'text-blue-500' : 'text-black-forest/40'}`}>
                                    {comparison.diff > 0 ? <TrendingUp size={10} /> : comparison.diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                    {Math.abs(comparison.pctDiff).toFixed(0)}%
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
        </div>
    )
}

export default ComparisonMode
