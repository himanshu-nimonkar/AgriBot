import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

function WeatherTelemetry({ data }) {
    if (!data) {
        return (
            <div className="glass-card p-6 border-emerald-500/20">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                    <span>🌤️</span>
                    Weather Telemetry
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-slate-800/30 rounded-lg p-3 border border-white/5 space-y-2">
                             <div className="skeleton h-3 w-20"></div>
                             <div className="skeleton h-8 w-16"></div>
                        </div>
                    ))}
                </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-slate-800/30 rounded-lg p-3 border border-white/5 space-y-2">
                             <div className="skeleton h-3 w-24"></div>
                             <div className="skeleton h-6 w-12"></div>
                        </div>
                    ))}
                </div>
                 <div className="h-32 skeleton w-full"></div>
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

    // Safely access data with defaults
    const temp = data?.temperature_c ?? '--';
    const humidity = data?.relative_humidity ?? '--';
    const wind = data?.wind_speed_kmh ?? '--';
    const precip = data?.precipitation_mm ?? '--';
    const soil = (data?.soil_moisture_0_7cm !== undefined && data?.soil_moisture_0_7cm !== null) ? (data.soil_moisture_0_7cm * 100).toFixed(1) : '--';
    const eto = data?.reference_evapotranspiration ?? '--';

    // Prepare forecast data for chart
    const forecastData = data.forecast?.map(day => ({
        date: day.date ? day.date.split('-').slice(1).join('/') : '',
        high: day.temp_max,
        low: day.temp_min,
        precip: day.precipitation_sum || 0
    })) || []

    // Calculate total precipitation for the week
    const totalPrecip = forecastData.reduce((sum, day) => sum + (day.precip || 0), 0).toFixed(1)
    const rainyDays = forecastData.filter(day => day.precip > 0).length

    return (
        <div className="glass-card p-6 border-emerald-500/20">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <span>🌤️</span>
                Local Conditions
            </h2>

            {/* Current Conditions Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Temperature</p>
                    <p className="text-2xl font-bold text-white">{temp}<span className="text-sm font-normal text-slate-500">°C</span></p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Humidity</p>
                    <p className="text-2xl font-bold text-white">{humidity}<span className="text-sm font-normal text-slate-500">%</span></p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Wind Speed</p>
                    <p className="text-2xl font-bold text-white">{wind}<span className="text-sm font-normal text-slate-500"> km/h</span></p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Precipitation</p>
                    <p className="text-2xl font-bold text-white">{precip}<span className="text-sm font-normal text-slate-500"> mm</span></p>
                </div>
            </div>

            {/* Agricultural Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Soil Mst (0-7cm)</p>
                    <p className="text-xl font-bold text-blue-400">{soil}%</p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Reference ET</p>
                    <p className="text-xl font-bold text-yellow-400">{eto} mm</p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Spray Risk</p>
                    <span className={getRiskClass(data.spray_drift_risk)}>
                        {(data.spray_drift_risk || 'N/A').toUpperCase()}
                    </span>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 border border-white/5">
                    <p className="text-xs text-slate-400 mb-1">Fungal Risk</p>
                    <span className={getRiskClass(data.fungal_risk)}>
                        {(data.fungal_risk || 'N/A').toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Forecast Chart */}
            {forecastData.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-widest">7-Day Forecast</h3>
                        <div className="flex gap-4 text-xs">
                            <span className="text-blue-400">💧 {totalPrecip}mm total</span>
                            <span className="text-slate-400">{rainyDays} rainy day{rainyDays !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div className="h-32 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={forecastData}>
                                <defs>
                                    <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} unit="°" axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0f172a',
                                        border: '1px solid #1e293b',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="high"
                                    stroke="#ef4444"
                                    fill="url(#colorHigh)"
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="low"
                                    stroke="#3b82f6"
                                    fill="transparent"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    
                    {/* Precipitation Bar Chart */}
                    <div className="h-24">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={forecastData}>
                                <defs>
                                    <linearGradient id="colorPrecip" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} unit="mm" axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0f172a',
                                        border: '1px solid #1e293b',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    formatter={(value) => [`${value} mm`, 'Precipitation']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="precip"
                                    stroke="#3b82f6"
                                    fill="url(#colorPrecip)"
                                    strokeWidth={2}
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
