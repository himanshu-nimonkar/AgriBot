import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2, DollarSign } from 'lucide-react';

export default function MarketTrends({ apiUrl }) {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchTrends = async () => {
            setIsLoading(true);
            try {
                const url = apiUrl ? `${apiUrl}/api/market/trends` : '/api/market/trends';
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to fetch market trends');
                const result = await response.json();
                
                if (result.status === 'success' && result.data) {
                    setData(result.data);
                } else {
                    throw new Error('Invalid data format received');
                }
            } catch (err) {
                console.error("Market Trends Fetch Error:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTrends();
    }, [apiUrl]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[var(--clay-bg)]/95 backdrop-blur-xl border border-white/40 p-3 rounded-xl shadow-xl z-50 pointer-events-none"
                    style={{
                        boxShadow: 'inset 2px 2px 5px rgba(255, 255, 255, 0.7), inset -3px -3px 7px rgba(0, 0, 0, 0.05), 8px 8px 16px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    <p className="font-bold text-black-forest mb-2 border-b border-black-forest/10 pb-1">{label}</p>
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-3 text-sm my-1">
                            <div className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: entry.color }} />
                            <span className="text-black-forest/70 w-32">{entry.name}:</span>
                            <span className="font-semibold text-black-forest">${entry.value.toFixed(2)}</span>
                        </div>
                    ))}
                </motion.div>
            );
        }
        return null;
    };

    if (error) {
        return (
            <div className="clay-card-static p-4 h-full flex flex-col items-center justify-center text-center text-red-500/80">
                <TrendingDown className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="clay-card p-4 lg:p-6 w-full h-[420px] flex flex-col relative group cursor-default">
            <div className="flex justify-between items-start mb-6 shrink-0 relative z-10">
                <div className="flex items-center gap-3">
                    <div 
                        className="p-2.5 rounded-xl bg-gradient-to-br from-olive-leaf/20 to-sage/30 text-black-forest shadow-inner"
                        style={{
                            boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.6), inset -2px -2px 4px rgba(0,0,0,0.05)'
                        }}
                    >
                        <DollarSign className="w-5 h-5 text-copperwood" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-black-forest tracking-tight">Market Trends</h2>
                        <p className="text-xs text-black-forest/50 font-medium">Historical 5-year Yolo County Averages</p>
                    </div>
                </div>
                
                {!isLoading && data.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-sage/20 rounded-full text-black-forest/70 shadow-inner">
                        <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                        <span>Tomatoes +62% (5yr)</span>
                    </div>
                )}
            </div>

            <div className="flex-1 w-full relative min-h-0 pl-0 sm:pl-2">
                <AnimatePresence>
                    {isLoading ? (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <Loader2 className="w-8 h-8 text-olive-leaf animate-spin" />
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="w-full h-full"
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={data}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-black-forest)" strokeOpacity={0.06} />
                                    <XAxis 
                                        dataKey="year" 
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'var(--color-black-forest)', opacity: 0.6, fontSize: 11, fontWeight: 500 }}
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: 'var(--color-black-forest)', opacity: 0.6, fontSize: 11, fontWeight: 500 }}
                                        tickFormatter={(value) => `$${value}`}
                                        dx={-10}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-copperwood)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.4 }} />
                                    <Legend 
                                        verticalAlign="top" 
                                        height={36}
                                        iconType="circle"
                                        wrapperStyle={{ fontSize: '11px', fontWeight: 600, opacity: 0.8, color: 'var(--color-black-forest)' }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="Tomatoes ($/ton)" 
                                        stroke="#B22222" // Copperwood red equivalent
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#B22222', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#B22222' }}
                                        animationDuration={2000}
                                        animationEasing="ease-out"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="Almonds ($/lb)" 
                                        stroke="#6B8E23" // Olive leaf green equivalent
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#6B8E23', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#6B8E23' }}
                                        animationDuration={2000}
                                        animationDelay={300}
                                        animationEasing="ease-out"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="Walnuts ($/lb)" 
                                        stroke="#8B4513" // Brown/Wood equivalent
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#8B4513', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#8B4513' }}
                                        animationDuration={2000}
                                        animationDelay={600}
                                        animationEasing="ease-out"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            {/* Claymorphism Shine Overlay */}
            <div className="absolute inset-0 rounded-[2rem] pointer-events-none border border-white/40 mix-blend-overlay" />
        </div>
    );
}
