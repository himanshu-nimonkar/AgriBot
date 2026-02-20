import { motion } from 'framer-motion'
import {
    Wind,
    Bug,
    TrendingUp,
    ShoppingCart,
    Zap,
    MapPin,
    CloudSun,
    Beaker,
    Wheat,
    Droplets,
    Shield,
    CalendarClock
} from 'lucide-react'

const actions = [
    { id: 'location', label: 'Current Location Brief', icon: MapPin, query: 'Give me a full farm brief for this location with weather, crop stress, and top priorities.', color: 'text-olive-leaf' },
    { id: 'forecast', label: '7-Day Forecast Plan', icon: CloudSun, query: 'Create a 7-day field action plan from forecast and current field conditions.', color: 'text-[#2563eb]' },
    { id: 'spray', label: 'Spray Window', icon: Wind, query: 'Check the best spray windows and the hours to avoid spraying.', color: 'text-olive-leaf' },
    { id: 'irrigation', label: 'Irrigation Schedule', icon: Droplets, query: 'Estimate irrigation need and recommended irrigation timing for the next 3 days.', color: 'text-[#2563eb]' },
    { id: 'water-stress', label: 'Water Stress Check', icon: Beaker, query: 'Analyze vegetation and water stress and tell me if intervention is needed now.', color: 'text-sunlit-clay' },
    { id: 'pest', label: 'Pest & Disease Risk', icon: Bug, query: 'Assess pest and disease risk this week using weather and field indicators.', color: 'text-copperwood' },
    { id: 'harvest', label: 'Harvest Readiness', icon: Wheat, query: 'Estimate harvest readiness, timing risks, and what to monitor before harvest.', color: 'text-olive-leaf' },
    { id: 'timing', label: 'Best Task Timing', icon: CalendarClock, query: 'Give me the best timing this week for irrigation, spraying, and scouting.', color: 'text-[#2563eb]' },
    { id: 'market', label: 'Market Snapshot', icon: ShoppingCart, query: 'Summarize current market outlook and pricing context for this crop.', color: 'text-copperwood' },
    { id: 'cost', label: 'Action Priorities', icon: TrendingUp, query: 'Rank the top 5 most impactful actions for this field right now.', color: 'text-olive-leaf' },
    { id: 'compliance', label: 'Compliance Check', icon: Shield, query: 'List key compliance or safety checks relevant for upcoming field operations.', color: 'text-sunlit-clay' },
    { id: 'optimize', label: 'Quick Optimize', icon: Zap, query: 'Give me a concise optimize-now checklist for this location.', color: 'text-copperwood' }
]

function QuickActions({ onAction, location }) {
    const locationContext = location
        ? ` Location: ${location.label || 'Selected point'} (${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}).`
        : ''

    return (
        <div className="w-full">
            <h3 className="text-[10px] font-bold text-black-forest/40 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                <Zap size={11} className="text-sunlit-clay" />
                Quick Actions
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {actions.map((action) => (
                    <motion.button
                        key={action.id}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                            if (navigator.vibrate) navigator.vibrate(8)
                            onAction(`${action.query}${locationContext}`)
                        }}
                        className="clay-tile p-2 flex items-center gap-2 text-left cursor-pointer group transition-all"
                    >
                        <action.icon size={14} className={`${action.color} shrink-0 group-hover:scale-110 transition-transform`} strokeWidth={1.5} />
                        <span className="text-[10px] font-semibold text-black-forest/60 leading-tight">{action.label}</span>
                    </motion.button>
                ))}
            </div>
        </div>
    )
}

export default QuickActions
