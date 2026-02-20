import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Droplets, ChevronDown } from 'lucide-react'

const CROP_KC = {
    rice: { name: 'Rice 🌾', kc_ini: 1.05, kc_mid: 1.2, kc_end: 0.9 },
    tomato: { name: 'Tomato 🍅', kc_ini: 0.6, kc_mid: 1.15, kc_end: 0.8 },
    almond: { name: 'Almond 🌰', kc_ini: 0.4, kc_mid: 1.1, kc_end: 0.65 },
    wheat: { name: 'Wheat 🌿', kc_ini: 0.3, kc_mid: 1.15, kc_end: 0.25 },
    corn: { name: 'Corn 🌽', kc_ini: 0.3, kc_mid: 1.2, kc_end: 0.35 },
    grape: { name: 'Grape 🍇', kc_ini: 0.3, kc_mid: 0.85, kc_end: 0.45 },
}

function IrrigationCalc({ weatherData, unitPreference = 'metric' }) {
    const [crop, setCrop] = useState('almond')
    const [fieldSize, setFieldSize] = useState(10) // acres

    const result = useMemo(() => {
        if (!weatherData) return null
        const et0 = weatherData.reference_evapotranspiration || 3.0
        const rain = weatherData.precipitation_mm || 0
        const kc = CROP_KC[crop]?.kc_mid || 1.0

        // Crop water need = ET0 × Kc
        const etc = et0 * kc
        // Effective rainfall = 80% of actual (some lost to runoff/evap)
        const effectiveRain = rain * 0.8
        // Net irrigation need
        const netNeed = Math.max(0, etc - effectiveRain)
        // Convert mm to gallons/acre (1mm = 27,154 gal/acre)
        const gallonsPerAcre = netNeed * 27154
        const totalGallons = gallonsPerAcre * fieldSize

        return {
            et0: et0.toFixed(1),
            etc: etc.toFixed(1),
            effectiveRain: effectiveRain.toFixed(1),
            netNeed: netNeed.toFixed(1),
            gallonsPerAcre: Math.round(gallonsPerAcre).toLocaleString(),
            totalGallons: formatLargeNumber(totalGallons),
            deficit: netNeed > 0,
        }
    }, [weatherData, crop, fieldSize])

    const mmLabel = unitPreference === 'imperial' ? 'in/day' : 'mm/day'
    const rainLabel = unitPreference === 'imperial' ? 'in' : 'mm'
    const toDisplayDepth = (valueMm) => {
        if (unitPreference === 'imperial') return (Number(valueMm) * 0.0393701).toFixed(2)
        return valueMm
    }

    if (!result) return null

    return (
        <div className="clay-card-static p-4">
            <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em] flex items-center gap-2 mb-3">
                <Droplets size={14} className="text-[#2563eb]" />
                Irrigation Calculator
            </h3>

            {/* Controls */}
            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <select
                        value={crop}
                        onChange={(e) => setCrop(e.target.value)}
                        className="w-full appearance-none text-[10px] font-semibold clay-input px-2.5 py-1.5 pr-6 rounded-lg cursor-pointer focus:outline-none text-black-forest"
                    >
                        {Object.entries(CROP_KC).map(([key, val]) => (
                            <option key={key} value={key}>{val.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-black-forest/30 pointer-events-none" />
                </div>
                <div className="flex items-center gap-1.5">
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        value={fieldSize}
                        onChange={(e) => setFieldSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 clay-input px-2 py-1.5 text-[10px] font-mono text-center rounded-lg focus:outline-none text-black-forest"
                    />
                    <span className="text-[9px] text-black-forest/40">acres</span>
                </div>
            </div>

            {/* Results */}
            <div className="space-y-1.5">
                <div className="flex justify-between text-[10px]">
                    <span className="text-black-forest/50">Reference ET (ET₀)</span>
                    <span className="font-mono font-semibold text-black-forest tabular-nums">{toDisplayDepth(result.et0)} {mmLabel}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                    <span className="text-black-forest/50">Crop ET (ETc)</span>
                    <span className="font-mono font-semibold text-black-forest tabular-nums">{toDisplayDepth(result.etc)} {mmLabel}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                    <span className="text-black-forest/50">Effective Rainfall</span>
                    <span className="font-mono font-semibold text-olive-leaf tabular-nums">-{toDisplayDepth(result.effectiveRain)} {rainLabel}</span>
                </div>
                <div className="h-px bg-black-forest/8 my-1"></div>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="clay-tile p-2.5 flex justify-between items-center"
                >
                    <div>
                        <span className="text-[10px] text-black-forest/50 block">Net Irrigation Need</span>
                        <span className={`text-sm font-bold font-mono tabular-nums ${result.deficit ? 'text-copperwood' : 'text-olive-leaf'}`}>
                            {toDisplayDepth(result.netNeed)} {mmLabel}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] text-black-forest/40 block">{result.gallonsPerAcre} gal/acre</span>
                        <span className="text-[9px] text-black-forest/40">Total: {result.totalGallons} gal</span>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}

function formatLargeNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return Math.round(n).toLocaleString()
}

export default IrrigationCalc
