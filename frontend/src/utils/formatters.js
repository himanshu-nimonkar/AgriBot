/**
 * Number formatting utilities
 */

/**
 * Format a number with locale-aware comma separation
 * @param {number} value - The number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number string
 */
export function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || value === '--') return '--'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '--'
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

/**
 * Format large numbers with K/M/B suffixes
 * @param {number} value
 * @returns {string}
 */
export function formatCompact(value) {
    if (value === null || value === undefined) return '--'
    const abs = Math.abs(value)
    if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B'
    if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M'
    if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K'
    return value.toFixed(0)
}

/**
 * Format temperature with unit
 * @param {number} celsius
 * @param {string} unit - 'metric' or 'imperial'
 * @returns {string}
 */
export function formatTemp(celsius, unit = 'metric') {
    if (celsius === null || celsius === undefined || celsius === '--') return '--'
    if (unit === 'imperial') {
        return `${(celsius * 9/5 + 32).toFixed(1)}°F`
    }
    return `${celsius.toFixed(1)}°C`
}

/**
 * Format wind speed with unit
 * @param {number} kmh
 * @param {string} unit
 * @returns {string}
 */
export function formatWind(kmh, unit = 'metric') {
    if (kmh === null || kmh === undefined || kmh === '--') return '--'
    if (unit === 'imperial') {
        return `${(kmh * 0.621371).toFixed(1)} mph`
    }
    return `${kmh.toFixed(1)} km/h`
}

/**
 * Format precipitation with unit
 * @param {number} mm
 * @param {string} unit
 * @returns {string}
 */
export function formatPrecip(mm, unit = 'metric') {
    if (mm === null || mm === undefined || mm === '--') return '--'
    if (unit === 'imperial') {
        return `${(mm * 0.0393701).toFixed(2)} in`
    }
    return `${mm.toFixed(1)} mm`
}
