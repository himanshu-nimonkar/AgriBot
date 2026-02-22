import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] w-full bg-transparent relative overflow-hidden">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="clay-card-static p-8 flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-4"
            >
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="p-3 rounded-2xl bg-gradient-to-br from-olive-leaf/20 to-sage/30 shadow-inner"
                    style={{ boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.6), inset -2px -2px 4px rgba(0,0,0,0.05)' }}
                >
                    <Loader2 size={32} className="text-olive-leaf drop-shadow-sm" />
                </motion.div>
                <div>
                    <h2 className="text-lg font-bold text-black-forest">Loading</h2>
                    <p className="text-xs text-black-forest/60 font-medium tracking-wide uppercase mt-1">Fetching Data</p>
                </div>
            </motion.div>
        </div>
    );
}
