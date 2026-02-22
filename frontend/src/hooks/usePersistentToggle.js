import { useState, useEffect } from 'react';

export function usePersistentToggle(key, defaultValue = false) {
    const [state, setState] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            // Parse stored json or if none return defaultValue
            return item !== null ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, state]);

    return [state, setState];
}
