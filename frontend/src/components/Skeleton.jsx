import React from 'react';

const Skeleton = ({ className = '', variant = 'default' }) => {
    if (variant === 'card') {
        return (
            <div className={`clay-card-static p-5 space-y-3 ${className}`}>
                <div className="skeleton h-4 w-3/4 rounded-lg"></div>
                <div className="skeleton h-3 w-1/2 rounded-lg"></div>
                <div className="skeleton h-20 w-full rounded-xl"></div>
            </div>
        );
    }
    if (variant === 'tile') {
        return (
            <div className={`clay-tile p-3 space-y-2 ${className}`}>
                <div className="skeleton h-3 w-20 rounded"></div>
                <div className="skeleton h-8 w-16 rounded"></div>
            </div>
        );
    }
    return (
        <div className={`skeleton ${className}`}></div>
    );
};

export default Skeleton;
