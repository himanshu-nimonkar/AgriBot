import { BookOpen, TrendingUp, FlaskConical, ExternalLink } from 'lucide-react'

function WhyBox({ results = [], sources = [], marketData, chemicalData = [], apiUrl = 'http://localhost:8000' }) {
    // If no data at all
    if (!results.length && !sources.length && !marketData && !chemicalData.length) {
        return (
            <div className="glass-card p-6 h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                <div className="p-3 bg-slate-800 rounded-full">
                    <BookOpen size={24} className="text-slate-500" />
                </div>
                <h3 className="text-slate-400 font-medium">Knowledge & Data</h3>
                <p className="text-xs text-slate-500 max-w-[200px]">
                    Analysis sources, market data, and chemical labels will appear here.
                </p>
            </div>
        )
    }

    return (
        <div className="glass-card p-0 overflow-hidden h-full flex flex-col">
            <div className="p-4 border-b border-white/5 bg-slate-900/50">
                <h3 className="font-semibold text-emerald-400 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <span>🧠</span> Agri-Brain Context
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">

                {/* 1. Market Data (God Mode) */}
                {marketData && marketData.available && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <TrendingUp size={14} className="text-blue-400" />
                            <span>Market Intelligence</span>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/20">
                            <div className="flex justify-between items-baseline">
                                <span className="text-slate-200 font-medium capitalize">{marketData.commodity}</span>
                                <span className="text-lg font-mono font-bold text-white">
                                    ${marketData.price.toFixed(2)}
                                    <span className="text-xs text-slate-400 ml-1">/{marketData.unit}</span>
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-2 text-xs">
                                <span className="text-slate-400">{marketData.source}</span>
                                <span className={`px-2 py-0.5 rounded-full ${marketData.trend === 'up' ? 'bg-green-500/20 text-green-400' :
                                    marketData.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                                        'bg-slate-500/20 text-slate-400'
                                    }`}>
                                    Trend: {marketData.trend.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Chemical Labels (God Mode) */}
                {chemicalData.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <FlaskConical size={14} className="text-purple-400" />
                            <span>Recommended Products</span>
                        </div>
                        <div className="space-y-2">
                            {chemicalData.map((chem, i) => (
                                <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-purple-500/10 hover:border-purple-500/30 transition-colors">
                                    <div className="flex justify-between shrink-0">
                                        <h4 className="font-bold text-purple-200 text-sm">{chem.product_name}</h4>
                                        <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{chem.active_ingredient}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-300 font-mono">
                                        <div><span className="text-slate-500">Rate:</span> {chem.rate}</div>
                                        <div><span className="text-slate-500">PHI:</span> {chem.phi}</div>
                                        <div className="col-span-2 text-slate-400 italic font-sans mt-1">"{chem.notes}"</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. Research Sources (Standard & Fallback) */}
                {(results.length > 0 || sources.length > 0) && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <BookOpen size={14} className="text-emerald-400" />
                            <span>Research Citations</span>
                        </div>
                        <ul className="space-y-3">
                            {/* Prefer Detailed RAG Results */}
                            {results.length > 0 ? (
                                results.map((result, idx) => (
                                    <li key={idx} className="group cursor-default">
                                        <div className="flex gap-3">
                                            <div className="mt-1 min-w-[1.5rem] h-6 flex items-center justify-center rounded-md bg-emerald-900/30 text-emerald-400 text-xs font-mono border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                                                {idx + 1}
                                            </div>
                                            <div className="space-y-1 w-full">
                                                <p className="text-sm text-slate-300 leading-relaxed group-hover:text-white transition-colors">
                                                    {typeof result === 'string' ? result : result.text}
                                                </p>
                                                {result.source && (
                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                                                            <ExternalLink size={10} />
                                                            {result.source.replace('.pdf', '')}
                                                        </div>
                                                        {result.source && (
                                                            <a
                                                                href={`${apiUrl.replace(/\/+$/, "")}/research/${result.source}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-medium transition-colors border border-emerald-500/20"
                                                            >
                                                                <BookOpen size={10} />
                                                                View Document
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))
                            ) : (
                                /* Fallback to Simple Sources List */
                                sources.map((src, idx) => (
                                    <li key={idx} className="group cursor-default">
                                        <div className="flex gap-3">
                                            <div className="mt-1 min-w-[1.5rem] h-6 flex items-center justify-center rounded-md bg-emerald-900/30 text-emerald-400 text-xs font-mono border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                                                {idx + 1}
                                            </div>
                                            <div className="space-y-1 w-full">
                                                <p className="text-sm text-slate-300 leading-relaxed group-hover:text-white transition-colors">
                                                    {src}
                                                </p>
                                                <div className="flex items-center justify-end mt-2">
                                                    <a
                                                        href={`${apiUrl.replace(/\/+$/, "")}/research/${src.includes('.') ? src : src + '.pdf'}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-medium transition-colors border border-emerald-500/20"
                                                    >
                                                        <BookOpen size={10} />
                                                        View Document
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}

export default WhyBox
