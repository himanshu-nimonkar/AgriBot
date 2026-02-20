import { BookOpen, TrendingUp, FlaskConical, ExternalLink, Brain } from 'lucide-react'
import { motion } from 'framer-motion'

const stagger = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
}
const fadeUp = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
}

function WhyBox({ results = [], sources = [], marketData, chemicalData = [], apiUrl = 'http://localhost:8000' }) {
    // If no data at all, show curated Yolo County article
    if (!results.length && !sources.length && !marketData && !chemicalData.length) {
        return (
            <div className="clay-card-static p-0 overflow-hidden h-full flex flex-col">
                <div className="p-4 border-b border-black-forest/5 clay-header-gradient">
                    <h3 className="font-semibold text-olive-leaf flex items-center gap-2 text-sm uppercase tracking-[0.1em]">
                        <Brain size={16} className="text-olive-leaf" strokeWidth={1.5} /> Knowledge & Data
                    </h3>
                </div>
                <div className="flex-1 p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="clay-tile p-4 flex items-start gap-3"
                    >
                        <div className="p-2 bg-olive-leaf/10 rounded-full shrink-0">
                            <BookOpen size={18} className="text-olive-leaf" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-black-forest font-semibold">Yolo County Research Spotlight</p>
                            <p className="text-xs text-black-forest/50 leading-relaxed">
                                Catch up on local insights from UC Davis' California Institute for Ag & Life Sciences.
                            </p>
                            <a
                                href="https://cail.ucdavis.edu/tag/yolo-county/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-olive-leaf hover:text-copperwood font-semibold transition-colors link-underline-grow"
                            >
                                Open article <ExternalLink size={12} />
                            </a>
                        </div>
                    </motion.div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4 w-full flex flex-col" role="region" aria-label="Agricultural context data">
            {/* 1. Market Data */}
            {marketData && marketData.available && (
                <motion.div initial="hidden" animate="show" variants={stagger} className="clay-card-static p-4 space-y-3">
                    <motion.div variants={fadeUp} className="flex items-center gap-2 text-[11px] font-bold text-copperwood uppercase tracking-[0.12em] border-b border-black-forest/5 pb-2">
                        <TrendingUp size={14} className="text-copperwood" />
                        <span>Market Intelligence</span>
                        </motion.div>
                        <motion.div variants={fadeUp} className="clay-tile p-3">
                            <div className="flex justify-between items-baseline">
                                <span className="text-black-forest font-medium capitalize">{marketData.commodity}</span>
                                <span className="text-lg font-mono font-bold text-black-forest tabular-nums">
                                    ${marketData.price.toFixed(2)}
                                    <span className="text-xs text-black-forest/40 ml-1">/{marketData.unit}</span>
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-2 text-xs">
                                <span className="text-black-forest/50">{marketData.source}</span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${marketData.trend === 'up' ? 'bg-olive-leaf/10 text-olive-leaf' :
                                    marketData.trend === 'down' ? 'bg-red-100 text-red-600' :
                                        'bg-black-forest/5 text-black-forest/50'
                                    }`}>
                                    {marketData.trend === 'up' ? '↑' : marketData.trend === 'down' ? '↓' : '→'} {marketData.trend.toUpperCase()}
                                </span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* 2. Chemical Labels */}
                {chemicalData.length > 0 && (
                    <motion.div initial="hidden" animate="show" variants={stagger} className="clay-card-static p-4 space-y-3">
                        <motion.div variants={fadeUp} className="flex items-center gap-2 text-[11px] font-bold text-sunlit-clay uppercase tracking-[0.12em] border-b border-black-forest/5 pb-2">
                            <FlaskConical size={14} className="text-sunlit-clay" />
                            <span>Recommended Products</span>
                        </motion.div>
                        <div className="space-y-2">
                            {chemicalData.map((chem, i) => (
                                <motion.div key={i} variants={fadeUp} className="clay-tile p-3">
                                    <div className="flex justify-between shrink-0">
                                        <h4 className="font-bold text-copperwood text-sm">{chem.product_name}</h4>
                                        <span className="text-[10px] bg-cornsilk px-1.5 py-0.5 rounded text-black-forest/60 font-medium">{chem.active_ingredient}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-black-forest/70 font-mono">
                                        <div><span className="text-black-forest/40">Rate:</span> {chem.rate}</div>
                                        <div><span className="text-black-forest/40">PHI:</span> {chem.phi}</div>
                                        <div className="col-span-2 text-black-forest/50 italic font-sans mt-1">"{chem.notes}"</div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* 3. Research Sources */}
                {(results.length > 0 || sources.length > 0) && (
                    <motion.div initial="hidden" animate="show" variants={stagger} className="clay-card-static p-4 space-y-3">
                        <motion.div variants={fadeUp} className="flex items-center gap-2 text-[11px] font-bold text-olive-leaf uppercase tracking-[0.12em] border-b border-black-forest/5 pb-2">
                            <BookOpen size={14} className="text-olive-leaf" />
                            <span>Research Citations</span>
                        </motion.div>
                        <ul className="space-y-3">
                            {results.length > 0 ? (
                                results.map((result, idx) => (
                                    <motion.li key={idx} variants={fadeUp} className="group cursor-default">
                                        <div className="flex gap-3">
                                            <div className="mt-1 min-w-[1.5rem] h-6 flex items-center justify-center rounded-md bg-olive-leaf/10 text-olive-leaf text-xs font-mono font-bold shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="space-y-1 w-full">
                                                <p className="text-sm text-black-forest/70 leading-relaxed group-hover:text-black-forest transition-colors">
                                                    {typeof result === 'string' ? result : result.text}
                                                </p>
                                                {result.source && (
                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex items-center gap-1 text-[10px] text-black-forest/40 uppercase tracking-wide font-medium">
                                                            <ExternalLink size={10} />
                                                            {result.source.replace('.pdf', '')}
                                                        </div>
                                                        {result.source && (
                                                            <a
                                                                href={`${apiUrl.replace(/\/+$/, "")}/research/${result.source}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-olive-leaf/10 hover:bg-olive-leaf/20 text-olive-leaf text-[10px] font-medium transition-colors link-underline-grow"
                                                            >
                                                                <BookOpen size={10} />
                                                                View Document
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.li>
                                ))
                            ) : (
                                sources.map((src, idx) => (
                                    <motion.li key={idx} variants={fadeUp} className="group cursor-default">
                                        <div className="flex gap-3">
                                            <div className="mt-1 min-w-[1.5rem] h-6 flex items-center justify-center rounded-md bg-olive-leaf/10 text-olive-leaf text-xs font-mono font-bold shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="space-y-1 w-full">
                                                <p className="text-sm text-black-forest/70 leading-relaxed group-hover:text-black-forest transition-colors">
                                                    {src}
                                                </p>
                                                <div className="flex items-center justify-end mt-2">
                                                    <a
                                                        href={`${apiUrl.replace(/\/+$/, "")}/research/${src.includes('.') ? src : src + '.pdf'}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-olive-leaf/10 hover:bg-olive-leaf/20 text-olive-leaf text-[10px] font-medium transition-colors link-underline-grow"
                                                    >
                                                        <BookOpen size={10} />
                                                        View Document
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.li>
                                ))
                            )}
                        </ul>
                    </motion.div>
                )}
        </div>
    )
}

export default WhyBox
