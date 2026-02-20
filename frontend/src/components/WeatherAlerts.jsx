import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CloudSnow, Wind, CloudRain, Thermometer, Droplets, X, Bell } from 'lucide-react'

function WeatherWarnings({ weatherData, forecast }) {
    const [isOpen, setIsOpen] = useState(false)

    const alerts = useMemo(() => {
        if (!weatherData || !forecast?.length) return []

        const result = []
        const now = weatherData

        if (now.temperature_c !== undefined && now.temperature_c <= 2) {
            result.push({
                id: 'frost-now',
                icon: CloudSnow,
                title: 'Frost Risk',
                message: `Current temperature is ${now.temperature_c.toFixed(1)}°C. Protect sensitive crops.`,
                color: 'text-blue-600 bg-blue-50 border-blue-200'
            })
        }

        if (now.wind_speed_kmh > 25) {
            result.push({
                id: 'wind-now',
                icon: Wind,
                title: 'High Wind',
                message: `Wind is ${now.wind_speed_kmh.toFixed(0)} km/h. Avoid spray windows.`,
                color: 'text-amber-600 bg-amber-50 border-amber-200'
            })
        }

        if (now.relative_humidity > 85) {
            result.push({
                id: 'fungal-now',
                icon: Droplets,
                title: 'Disease Pressure',
                message: `Humidity is ${now.relative_humidity}% and fungal pressure is elevated.`,
                color: 'text-orange-500 bg-orange-50 border-orange-200'
            })
        }

        forecast.forEach((day, index) => {
            if (index === 0) return

            if (typeof day.temp_min === 'number' && day.temp_min <= 0) {
                result.push({
                    id: `frost-${index}`,
                    icon: CloudSnow,
                    title: `Frost Outlook (${index}d)`,
                    message: `${day.temp_min}°C expected on ${day.date}.`,
                    color: 'text-blue-600 bg-blue-50 border-blue-200'
                })
            }

            if (typeof day.precipitation_sum === 'number' && day.precipitation_sum > 15) {
                result.push({
                    id: `rain-${index}`,
                    icon: CloudRain,
                    title: `Heavy Rain (${index}d)`,
                    message: `${day.precipitation_sum}mm expected on ${day.date}.`,
                    color: 'text-cyan-700 bg-cyan-50 border-cyan-200'
                })
            }

            if (typeof day.temp_max === 'number' && day.temp_max > 38) {
                result.push({
                    id: `heat-${index}`,
                    icon: Thermometer,
                    title: `Heat Alert (${index}d)`,
                    message: `${day.temp_max}°C expected. Plan irrigation and shade timing.`,
                    color: 'text-red-600 bg-red-50 border-red-200'
                })
            }
        })

        const hasRainSoon = forecast.slice(1, 4).some((day) => day.precipitation_sum > 5)
        if (now.relative_humidity > 65 && hasRainSoon) {
            result.push({
                id: 'fungal-forecast',
                icon: AlertTriangle,
                title: 'Fungal Window',
                message: 'Humidity and rain pattern suggest elevated fungal risk over the next 72 hours.',
                color: 'text-orange-500 bg-orange-50 border-orange-200'
            })
        }

        return result
    }, [weatherData, forecast])

    return (
        <>
            <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setIsOpen((prev) => !prev)}
                className="relative w-10 h-10 rounded-xl clay-button text-amber-600 hover:text-amber-700 transition-colors flex items-center justify-center"
                aria-label={`Notifications (${alerts.length})`}
                title="Notifications"
            >
                <Bell size={16} strokeWidth={1.8} />
                <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm ${alerts.length > 0
                    ? 'bg-amber-500 text-white'
                    : 'bg-black-forest/20 text-white'
                    }`}>
                    {alerts.length}
                </span>
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[998]"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                            className="absolute top-full right-0 mt-2 w-96 max-w-[92vw] max-h-[60vh] overflow-y-auto clay-card-static p-3 z-[999] space-y-2"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-xs font-bold text-black-forest uppercase tracking-wide flex items-center gap-1.5">
                                    <Bell size={12} className="text-amber-500" />
                                    Notifications ({alerts.length})
                                </h4>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1 rounded-lg hover:bg-black-forest/5 text-black-forest/30"
                                    aria-label="Close notifications"
                                >
                                    <X size={12} />
                                </button>
                            </div>

                            <p className="text-[10px] text-black-forest/45 leading-relaxed">
                                Alerts are generated from current weather and forecast data for this selected location. No login or push account is required.
                            </p>

                            {alerts.length === 0 && (
                                <div className="clay-tile p-3 text-xs text-black-forest/55">
                                    No active weather notifications for this location.
                                </div>
                            )}

                            {alerts.map((alert) => (
                                <div key={alert.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${alert.color} text-xs`}>
                                    <alert.icon size={14} className="mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-semibold">{alert.title}</p>
                                        <p className="opacity-85 mt-0.5 leading-relaxed">{alert.message}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}

export default WeatherWarnings
