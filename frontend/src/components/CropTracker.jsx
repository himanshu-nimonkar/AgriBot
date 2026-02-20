import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sprout, ChevronDown } from 'lucide-react'

const CROPS = {
    rice: { name: 'Rice', stages: ['Seedbed', 'Transplant', 'Vegetative', 'Reproductive', 'Ripening', 'Harvest'], months: [3, 4, 5, 7, 9, 10], emoji: '🌾' },
    tomato: { name: 'Tomato', stages: ['Seeding', 'Transplant', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest'], months: [2, 3, 4, 5, 6, 8], emoji: '🍅' },
    almond: { name: 'Almond', stages: ['Dormant', 'Bloom', 'Leaf Out', 'Nut Fill', 'Hull Split', 'Harvest'], months: [12, 2, 3, 5, 7, 8], emoji: '🌰' },
    wheat: { name: 'Wheat', stages: ['Planting', 'Emergence', 'Tillering', 'Heading', 'Ripening', 'Harvest'], months: [11, 12, 1, 4, 5, 6], emoji: '🌿' },
}

function CropTracker() {
    const [selectedCrop, setSelectedCrop] = useState('rice')
    const crop = CROPS[selectedCrop]
    const currentMonth = new Date().getMonth() + 1 // 1-indexed

    const currentStageIndex = useMemo(() => {
        const months = crop.months
        for (let i = months.length - 1; i >= 0; i--) {
            if (currentMonth >= months[i]) return i
        }
        return 0
    }, [crop, currentMonth])

    const progress = ((currentStageIndex + 0.5) / crop.stages.length) * 100

    return (
        <div className="clay-card-static p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-black-forest uppercase tracking-[0.12em] flex items-center gap-2">
                    <Sprout size={14} className="text-olive-leaf" />
                    Crop Growth Tracker
                </h3>
                <div className="relative">
                    <select
                        value={selectedCrop}
                        onChange={(e) => setSelectedCrop(e.target.value)}
                        className="appearance-none text-[10px] font-semibold text-olive-leaf bg-olive-leaf/10 pl-2 pr-5 py-1 rounded-full cursor-pointer focus:outline-none"
                    >
                        {Object.entries(CROPS).map(([key, val]) => (
                            <option key={key} value={key}>{val.emoji} {val.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-olive-leaf pointer-events-none" />
                </div>
            </div>

            {/* Progress bar */}
            <div className="relative mb-3">
                <div className="h-2 rounded-full bg-cornsilk overflow-hidden">
                    <motion.div
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-olive-leaf/40 via-olive-leaf to-olive-leaf"
                    />
                </div>
            </div>

            {/* Stage timeline */}
            <div className="flex justify-between">
                {crop.stages.map((stage, i) => {
                    const isActive = i === currentStageIndex
                    const isPast = i < currentStageIndex
                    return (
                        <div key={stage} className="flex flex-col items-center flex-1">
                            <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
                                isActive ? 'bg-olive-leaf border-olive-leaf shadow-[0_0_6px_rgba(96,108,56,0.4)] scale-125' :
                                isPast ? 'bg-olive-leaf/50 border-olive-leaf/50' :
                                'bg-cornsilk border-black-forest/15'
                            }`} />
                            <span className={`text-[8px] mt-1 text-center leading-tight ${
                                isActive ? 'font-bold text-olive-leaf' :
                                isPast ? 'text-black-forest/40' :
                                'text-black-forest/25'
                            }`}>
                                {stage}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default CropTracker
