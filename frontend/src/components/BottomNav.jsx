import { motion } from 'framer-motion'
import { Map, MessageCircle, BarChart3, Settings, Wheat } from 'lucide-react'

const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'map', label: 'Map', icon: Map },
    { id: 'data', label: 'Data', icon: BarChart3 },
    { id: 'vision', label: 'Vision', icon: Wheat },
]

function BottomNav({ activeTab = 'chat', onTabChange }) {
    return (
        <div className="w-full">
            <nav className="clay-card-static !rounded-none border-t border-black-forest/5 px-2 py-1 flex justify-around items-center backdrop-blur-md bg-[var(--clay-surface)]/95" aria-label="Main navigation">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id
                    return (
                        <motion.button
                            key={tab.id}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                if (navigator.vibrate) navigator.vibrate(5)
                                onTabChange(tab.id)
                            }}
                            className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all ${isActive ? 'text-olive-leaf' : 'text-black-forest/30'
                                }`}
                            aria-label={tab.label}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <tab.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                            <span className={`text-[9px] font-semibold ${isActive ? 'text-olive-leaf' : 'text-black-forest/30'}`}>
                                {tab.label}
                            </span>
                            {isActive && (
                                <motion.div
                                    layoutId="bottomNavIndicator"
                                    className="absolute -top-0.5 w-8 h-0.5 bg-olive-leaf rounded-full"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}
                        </motion.button>
                    )
                })}
            </nav>
        </div>
    )
}

export default BottomNav
