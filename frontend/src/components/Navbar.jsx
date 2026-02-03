import React from 'react';
import { Phone } from 'lucide-react';

const Navbar = ({ connectionStatus, onCallClick }) => {
    return (
        <nav className="w-full max-w-7xl mx-auto transition-all duration-300">
            <div className="glass-card px-4 md:px-6 py-3 flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
                {/* Logo Section */}
                <div className="flex items-center space-x-3 group cursor-pointer">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-white/5 group-hover:border-emerald-500/30 transition-all overflow-hidden p-1">
                        <img src="/AgriBot.png" alt="AgriBot Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                            AgriBot
                        </h1>
                        <p className="text-[10px] text-slate-400 font-mono hidden md:block tracking-wider uppercase">Yolo County Advisor</p>
                    </div>
                </div>

                <div className="flex items-center space-x-3 md:space-x-4">
                    <div
                        className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-950/30 border border-white/5 backdrop-blur-sm transition-all"
                        title="Connection Status"
                    >
                        <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-500 ${connectionStatus === 'connected' ? 'bg-emerald-500 text-emerald-500 animate-pulse' : 'bg-red-500 text-red-500'
                            }`} />
                        <span
                            onClick={() => connectionStatus !== 'connected' && onShowToast && onShowToast({ message: `Debug: Connection lost to ${window.USER_WS_URL || 'Server'}`, type: 'error' })}
                            className={`text-xs font-medium tracking-wide cursor-pointer ${connectionStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                            {connectionStatus === 'connected' ? 'Online' : 'Offline'}
                        </span>
                    </div>

                    <button
                        onClick={onCallClick}
                        className="hidden md:flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(46,125,50,0.4)] font-semibold text-xs uppercase tracking-wider border border-emerald-400/20"
                    >
                        <Phone size={14} className="animate-pulse" />
                        <span>Call Agent</span>
                    </button>

                    {/* Mobile Call Icon */}
                    <button
                        onClick={onCallClick}
                        className="md:hidden flex items-center justify-center w-9 h-9 bg-emerald-600 text-white rounded-full hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <Phone size={16} />
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
