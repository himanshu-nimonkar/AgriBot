import React from 'react';
import { Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SessionModal = ({ isOpen, onClose, onConfirm }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop with blur-in */}
                    <motion.div
                        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                        animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-black-forest/25"
                        onClick={onClose}
                        aria-hidden="true"
                    />
                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        className="relative clay-card-static p-6 w-full max-w-sm text-center space-y-4 bg-[#f8f4e8]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="session-modal-title"
                    >
                        <div className="mx-auto w-12 h-12 rounded-full bg-olive-leaf/10 flex items-center justify-center mb-2 shadow-clay-sm">
                            <Sprout size={22} className="text-olive-leaf" strokeWidth={1.5} />
                        </div>

                        <h3 id="session-modal-title" className="text-lg font-bold text-black-forest text-shadow-subtle">
                            Start New Session?
                        </h3>
                        <p className="text-sm text-black-forest/60">
                            This will clear your current chat history and context. The map and weather data will remain.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 rounded-xl clay-button text-black-forest/70 hover:text-black-forest transition-colors text-sm font-medium"
                                aria-label="Cancel session reset"
                            >
                                Cancel
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl clay-primary text-sm font-bold"
                                aria-label="Confirm session reset"
                            >
                                Start Fresh
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SessionModal;
