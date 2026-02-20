import React from 'react';
import { Phone } from 'lucide-react';
import { motion } from 'framer-motion';

const Navbar = ({ connectionStatus, onCallClick, onShowToast, extraButtons }) => {
    return (
        <motion.nav
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-7xl mx-auto"
            role="banner"
        >
            <div className="px-4 md:px-6 py-3 flex items-center justify-between clay-card-static">
                {/* Logo Section */}
                <div className="flex items-center space-x-3 group cursor-pointer" aria-label="AgriBot Home">
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 2 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center w-10 h-10 rounded-xl clay-button overflow-hidden p-1"
                    >
                        <img src="/AgriBot.png" alt="AgriBot Logo" className="w-full h-full object-contain" />
                    </motion.div>
                    <div>
                        <h1 className="text-lg md:text-xl font-bold tracking-tight text-shadow-subtle">
                            <span className="bg-gradient-to-r from-[#283618] via-[#606c38] to-[#bc6c25] bg-clip-text text-transparent">
                                Agri
                            </span>
                            <span className="bg-gradient-to-r from-[#bc6c25] to-[#dda15e] bg-clip-text text-transparent italic">
                                Bot
                            </span>
                            <span className="text-olive-leaf/40 text-xs ml-0.5 align-super font-normal">🌾</span>
                        </h1>
                        <p className="text-[10px] text-olive-leaf font-mono hidden md:block tracking-[0.15em] uppercase">
                            Yolo County Advisor
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3 md:space-x-4">
                    {/* Connection Status */}
                    <div
                        className="flex items-center space-x-2 px-3 py-1.5 rounded-full transition-all"
                        style={{
                            background: 'rgba(216, 210, 192, 0.5)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                        }}
                        title="Connection Status"
                        role="status"
                        aria-label={`Connection status: ${connectionStatus}`}
                    >
                        <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${connectionStatus === 'connected'
                            ? 'bg-olive-leaf text-olive-leaf shadow-[0_0_6px_currentColor]'
                            : 'bg-red-500 text-red-500 shadow-[0_0_6px_currentColor]'
                        }`}
                        style={connectionStatus === 'connected' ? { animation: 'breathe 2s ease-in-out infinite' } : {}}
                        />
                        <span
                            onClick={() => connectionStatus !== 'connected' && onShowToast && onShowToast({ message: `Debug: Connection lost to ${window.USER_WS_URL || 'Server'}`, type: 'error' })}
                            className={`text-xs font-medium tracking-wide cursor-pointer ${connectionStatus === 'connected' ? 'text-olive-leaf' : 'text-red-500'}`}
                        >
                            {connectionStatus === 'connected' ? 'Online' : 'Offline'}
                        </span>
                    </div>

                    {/* Extra Buttons (e.g. Weather Alerts) */}
                    {extraButtons && (
                        <div className="relative flex items-center">
                            {extraButtons}
                        </div>
                    )}

                    {/* Desktop Call Button */}
                    <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={onCallClick}
                        className="hidden md:flex items-center space-x-2 px-4 py-2.5 clay-primary rounded-xl font-semibold text-xs uppercase tracking-wider"
                        aria-label="Call AI Agent"
                    >
                        <Phone size={14} strokeWidth={2.5} />
                        <span>Call Agent</span>
                    </motion.button>

                    {/* Mobile Call Icon */}
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={onCallClick}
                        className="md:hidden flex items-center justify-center w-10 h-10 clay-primary rounded-full shadow-lg"
                        aria-label="Call AI Agent"
                    >
                        <Phone size={16} strokeWidth={2.5} />
                    </motion.button>
                </div>
            </div>
        </motion.nav>
    );
};

export default Navbar;
