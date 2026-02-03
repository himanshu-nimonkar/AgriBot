import React from 'react';

const Skeleton = ({ className }) => {
    return (
        <div className={`animate-pulse bg-slate-800/50 rounded-lg ${className}`}></div>
    );
};

export default Skeleton;
