import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Home } from 'lucide-react';

export default function NotFoundPage() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalhost ? '' : '/AgriBot';

    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen w-full p-6 text-center bg-[var(--clay-bg)] font-display">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-card p-10 max-w-md w-full flex flex-col items-center justify-center space-y-6 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                
                <motion.div
                    whileHover={{ scale: 1.05, rotate: -5 }}
                    className="p-4 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 shadow-inner clay-button cursor-pointer"
                    style={{
                        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.6), inset -2px -2px 4px rgba(0,0,0,0.05)'
                    }}
                >
                    <AlertTriangle size={48} className="drop-shadow-sm" />
                </motion.div>
                
                <div className="space-y-2 z-10 relative">
                    <h1 className="text-3xl font-extrabold text-black-forest tracking-tight">404</h1>
                    <h2 className="text-xl font-bold text-black-forest">Page Not Found</h2>
                    <p className="text-sm text-black-forest/60 font-medium leading-relaxed">
                        The requested page could not be found. It might have been moved or doesn't exist.
                    </p>
                </div>
                
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => window.location.href = baseUrl || '/'}
                    className="clay-button w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-olive-leaf to-olive-leaf/90 text-white font-bold flex items-center justify-center gap-3 transition-colors shadow-lg z-10 mt-4"
                >
                    <Home size={18} />
                    <span>Return to Dashboard</span>
                </motion.button>
            </motion.div>
        </div>
    );
}
