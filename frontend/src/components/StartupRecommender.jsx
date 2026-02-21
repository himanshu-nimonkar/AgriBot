import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, Search, MapPin, Target, Sparkles, Loader2, Info } from 'lucide-react'

export default function StartupRecommender({ apiUrl }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)

    // Initially fetch a broad "recommendation" to populate empty state
    useEffect(() => {
        handleSearch("")
    }, [])

    const handleSearch = async (forcedQuery = query) => {
        setIsLoading(true)
        if (forcedQuery !== "") setHasSearched(true)
        
        try {
            const res = await fetch(`${apiUrl}/api/startups/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: forcedQuery })
            })
            if (!res.ok) throw new Error('Failed to fetch startups')
            const data = await res.json()
            setResults(data.results || [])
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="clay-card-static p-4 lg:p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-black-forest flex items-center gap-2">
                        <Building2 size={18} className="text-olive-leaf" />
                        Local AgTech Startups
                    </h3>
                    <p className="text-[10px] text-black-forest/50 mt-1 font-medium tracking-wide">YOLO COUNTY CONNECTION ENGINE</p>
                </div>
            </div>

            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black-forest/40" />
                <input
                    type="text"
                    placeholder="Search by crop, pest, or sector..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        // Optional: Debounce this for true real-time, 
                        // but pressing enter or having a button is cleaner for now.
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full bg-white/60 border border-black-forest/10 rounded-xl pl-10 pr-4 py-3 text-xs text-black-forest font-bold placeholder:text-black-forest/30 placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-olive-leaf/30 transition-all shadow-inner"
                />
            </div>

            <div className="flex flex-col gap-2 relative min-h-[150px] max-h-[400px] overflow-y-auto pr-1 scrollbar-fade">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-[2px] z-10 rounded-xl">
                        <Loader2 className="animate-spin text-olive-leaf" size={24} />
                    </div>
                ) : null}

                <AnimatePresence>
                    {results.map((startup, index) => (
                        <motion.div
                            key={startup.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white/80 p-3 rounded-xl border border-black-forest/5 hover:border-olive-leaf/30 hover:shadow-md transition-all group"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-xs text-black-forest group-hover:text-olive-leaf transition-colors">{startup.name}</h4>
                            </div>
                            
                            <p className="text-[10px] text-black-forest/60 line-clamp-2 leading-relaxed mb-2">
                                {startup.description}
                            </p>

                            <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider text-black-forest/50">
                                <span className="flex items-center gap-1 bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">
                                    <MapPin size={9} />
                                    {startup.city}
                                </span>
                                <span className="flex items-center gap-1 bg-copperwood/10 text-copperwood px-2 py-0.5 rounded-full">
                                    <Target size={9} />
                                    {startup.focus}
                                </span>
                            </div>
                        </motion.div>
                    ))}

                    {results.length === 0 && !isLoading && (
                        <div className="py-6 text-center text-black-forest/40">
                            <Info size={24} className="mx-auto mb-2 opacity-50" />
                            <p className="text-xs">No local partners found matching those criteria.</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
