import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Thermometer, Bug } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const PEST_THRESHOLDS = [
    { name: 'Aphids', gdd: 150, color: '#bc6c25' },
    { name: 'Codling Moth', gdd: 250, color: '#606c38' },
    { name: 'Tomato Hornworm', gdd: 400, color: '#dda15e' },
]

function DegreeDays({ weatherData, baseTempC = 10 }) {
    const chartData = useMemo(() => {
        if (!weatherData?.forecast?.length) return []
        let accum = 0
        return weatherData.forecast.map((day) => {
            const tmax = typeof day.temp_max === 'number' ? day.temp_max : 18
            const tmin = typeof day.temp_min === 'number' ? day.temp_min : 8
            const gdd = Math.max(0, ((tmax + tmin) / 2) - baseTempC)
            accum += gdd
            return {
                date: day.date?.slice(5) || '?',
                gddDaily: parseFloat(gdd.toFixed(1)),
                gddAccum: parseFloat(accum.toFixed(1)),
            }
        })
    }, [weatherData, baseTempC])

    const totalGDD = chartData.length > 0 ? chartData[chartData.length - 1].gddAccum : 0

    if (!weatherData?.forecast?.length) return null

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
            <div className="clay-card-sm p-2 text-[10px] !rounded-lg shadow-clay-sm">
                <p className="font-semibold text-black-forest mb-1">{label}</p>
                <p className="text-copperwood">Daily: {payload[0]?.value} GDD</p>
                <p className="text-olive-leaf font-bold">Accum: {payload[1]?.value} GDD</p>
            </div>
        )
    }

    return (
        <div className="clay-card-static p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em] flex items-center gap-2">
                    <Thermometer size={14} className="text-copperwood" />
                    Growing Degree Days
                </h3>
                <span className="text-[10px] font-mono font-bold text-copperwood tabular-nums">
                    {totalGDD.toFixed(0)} GDD
                </span>
            </div>

            {/* Chart */}
            <div className="h-28 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gddGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#bc6c25" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#bc6c25" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="gddDaily" stroke="#dda15e" fill="none" strokeWidth={1.5} dot={false} />
                        <Area type="monotone" dataKey="gddAccum" stroke="#bc6c25" fill="url(#gddGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Pest thresholds */}
            <div className="flex gap-2 mt-2 flex-wrap">
                {PEST_THRESHOLDS.map(pest => (
                    <div key={pest.name} className="flex items-center gap-1">
                        <Bug size={9} style={{ color: pest.color }} />
                        <span className={`text-[8px] font-medium ${totalGDD >= pest.gdd ? 'text-copperwood font-bold' : 'text-black-forest/40'}`}>
                            {pest.name} ({pest.gdd})
                            {totalGDD >= pest.gdd && ' ⚠️'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default DegreeDays
