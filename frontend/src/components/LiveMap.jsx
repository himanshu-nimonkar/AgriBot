import { useRef, useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix default marker icons (delete default first)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

// Component to handle map clicks
function MapClickHandler({ setLocation }) {
    useMapEvents({
        click: (e) => {
            setLocation({
                lat: e.latlng.lat,
                lon: e.latlng.lng,
                label: `Field (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`
            })
        }
    })
    return null
}

// Internal component to handle map updates
function MapUpdater({ center }) {
    const map = useMap()
    useEffect(() => {
        // Safety check: coordinates valid AND map has size (prevent NaN errors)
        const size = map.getSize()
        if (center &&
            typeof center[0] === 'number' && !isNaN(center[0]) &&
            typeof center[1] === 'number' && !isNaN(center[1]) &&
            size.x > 0 && size.y > 0) {

            // Small delay to ensure layout is stable
            const timer = setTimeout(() => {
                map.flyTo(center, 14, { duration: 1.5 })
            }, 100)
            return () => clearTimeout(timer)
        } else {
            // console.warn('[MapUpdater] Skipped flyTo - Invalid Center or Map Hidden', { center, size });
        }
    }, [center, map])
    return null
}

function LiveMap({ location, setLocation, satelliteData }) {
    // Validation: Check for numbers and valid ranges
    const isValidLocation = location &&
        typeof location.lat === 'number' &&
        typeof location.lon === 'number' &&
        !isNaN(location.lon) &&
        Math.abs(location.lat) <= 90 &&
        Math.abs(location.lon) <= 180;

    // DEBUG LOG
    console.log('[LiveMap] Render:', { location, isValidLocation });

    // Fallback if location invalid (prevents crash)
    const effectiveLocation = isValidLocation ? location : { lat: 38.5449, lon: -121.7405, label: 'Davis, CA' }

    // NDVI color logic
    const getNDVIColor = (ndvi) => {
        if (ndvi === undefined || ndvi === null) return '#6b7280' // gray
        if (ndvi < 0.2) return '#ef4444' // red
        if (ndvi < 0.4) return '#f59e0b' // orange
        if (ndvi < 0.6) return '#10b981' // emerald
        return '#059669' // dark green
    }

    const ndviColor = getNDVIColor(satelliteData?.ndvi_current)

    // Safety check BEFORE rendering map
    if (!effectiveLocation) return null;

    // Layer State: 'ndvi', 'water', or 'none'
    const [activeLayer, setActiveLayer] = useState('ndvi')

    return (
        <div className="w-full h-full relative group">
            {/* Map Container */}
            <MapContainer
                center={[effectiveLocation.lat, effectiveLocation.lon]}
                zoom={13}
                className="h-full w-full rounded-xl z-0 bg-slate-900"
                scrollWheelZoom={true}
            >
                <MapUpdater center={[effectiveLocation.lat, effectiveLocation.lon]} />
                {/*
                   Safe Dark Mode: standard OSM with CSS filter.
                */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    // Inline filter for dark mode effect
                    className="dark-map-tiles"
                />

                {/* Map Click Disabled per user request */}
                {/* <MapClickHandler setLocation={setLocation} /> */}

                {/* Field Location Marker */}
                <Marker position={[effectiveLocation.lat, effectiveLocation.lon]}>
                    <Popup className="glass-popup">
                        <div className="text-slate-900 font-sans">
                            <p className="font-bold">{effectiveLocation.label}</p>
                            <p className="text-xs font-mono">{effectiveLocation.lat.toFixed(4)}, {effectiveLocation.lon.toFixed(4)}</p>
                        </div>
                    </Popup>
                </Marker>

                {/* Satellite Layers */}
                {activeLayer === 'ndvi' && satelliteData?.tile_url && (
                    <TileLayer
                        key={`ndvi-${satelliteData.tile_url}`}
                        url={satelliteData.tile_url}
                        opacity={0.7}
                        zIndex={100}
                    />
                )}
                
                {activeLayer === 'water' && satelliteData?.ndwi_tile_url && (
                    <TileLayer
                        key={`ndwi-${satelliteData.ndwi_tile_url}`}
                        url={satelliteData.ndwi_tile_url}
                        opacity={0.7}
                        zIndex={100}
                    />
                )}

                {/* Fallback Simulation Layer (Circle) - Only if no real tiles and layer is active */}
                {(!satelliteData?.tile_url && activeLayer !== 'none' && satelliteData && satelliteData.ndvi_current !== undefined) && (
                    <Circle
                        center={[effectiveLocation.lat, effectiveLocation.lon]}
                        pathOptions={{
                            color: activeLayer === 'ndvi' ? ndviColor : '#3b82f6',
                            fillColor: activeLayer === 'ndvi' ? ndviColor : '#3b82f6',
                            fillOpacity: 0.4,
                            weight: 2
                        }}
                        radius={800} // 800m radius simulation
                    >
                        <Popup>
                            <div className="text-slate-900 text-xs">
                                <strong>{activeLayer === 'ndvi' ? 'Vegetation' : 'Water'} Analysis Zone</strong><br />
                                Value: {activeLayer === 'ndvi' ? satelliteData.ndvi_current?.toFixed(2) : satelliteData.ndwi_current?.toFixed(2)}
                            </div>
                        </Popup>
                    </Circle>
                )}

            </MapContainer>

            {/* Layer Toggles */}
            <div className="absolute top-24 left-4 z-[400] flex flex-col gap-2">
                 <button 
                    onClick={() => setActiveLayer(prev => prev === 'ndvi' ? 'none' : 'ndvi')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md transition-all shadow-lg border ${activeLayer === 'ndvi' 
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20' 
                        : 'bg-slate-900/80 text-emerald-400 border-white/10 hover:bg-slate-800'}`}
                 >
                    🍃 Vegetation
                 </button>
                 <button 
                    onClick={() => setActiveLayer(prev => prev === 'water' ? 'none' : 'water')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md transition-all shadow-lg border ${activeLayer === 'water' 
                        ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/20' 
                        : 'bg-slate-900/80 text-blue-400 border-white/10 hover:bg-slate-800'}`}
                 >
                    💧 Water Stress
                 </button>
            </div>

            {/* Overlays */}
            <div className="absolute bottom-6 left-4 z-[400] pointer-events-none">
                <div className="glass-card px-3 py-1.5 flex items-center gap-2">
                    <span className={`animate-pulse w-2 h-2 rounded-full ${activeLayer === 'none' ? 'bg-slate-500' : 'bg-emerald-500'}`}></span>
                    <span className="text-xs font-medium text-emerald-400">
                        {activeLayer === 'none' ? 'MAP IDLE' : 'LIVE SATELLITE FEED'}
                    </span>
                </div>
            </div>

            {/* Satellite Stats Panel - Compact & Premium */}
            {/* Satellite Stats Panel - Always Visible with Skeleton Support */}
            <div className="absolute top-3 right-3 z-[400] glass-card p-3 min-w-[170px] border-emerald-500/30 shadow-2xl backdrop-blur-xl scale-95 origin-top-right">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Field Telemetry</h3>
                    <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${satelliteData ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                        <span className="text-[9px] text-slate-400 font-mono">{satelliteData ? 'LIVE' : 'STANDBY'}</span>
                    </div>
                </div>

                <div className="space-y-3">
                    {!satelliteData ? (
                        /* Skeleton State */
                        <div className="space-y-3 animate-pulse">
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <div className="h-2 w-8 bg-slate-700/50 rounded"></div>
                                    <div className="h-4 w-12 bg-slate-700/50 rounded"></div>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full"></div>
                            </div>
                            <div className="pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <div className="h-2 w-16 bg-slate-700/50 rounded"></div>
                                    <div className="h-3 w-10 bg-slate-700/50 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Real Data */
                        <>
                            {/* NDVI Section */}
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[10px] text-slate-400 font-medium">NDVI</span>
                                    <span className="text-base font-bold text-white font-mono leading-none">
                                        {satelliteData.ndvi_current?.toFixed(2) ?? '0.00'}
                                    </span>
                                </div>

                                {/* Gradient Bar with Marker */}
                                <div className="relative h-1.5 w-full bg-slate-800/80 rounded-full overflow-visible">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 opacity-80"></div>
                                    <div
                                        className="absolute top-[-2px] w-1 h-2.5 bg-white shadow-[0_0_8px_white] rounded-full transition-all duration-1000 ease-out"
                                        style={{ left: `${Math.max(0, Math.min(100, (satelliteData.ndvi_current || 0) * 100))}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                                    <span>Poor</span>
                                    <span>Healthy</span>
                                </div>
                            </div>

                            {/* Water Stress Section */}
                            <div className="pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-slate-400 font-medium">Water Stress</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${(satelliteData.water_stress_level === 'Low' || !satelliteData.water_stress_level) ? 'bg-emerald-500/20 text-emerald-400' :
                                            satelliteData.water_stress_level === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                                                'bg-red-500/20 text-red-400'
                                        }`}>
                                        {satelliteData.water_stress_level || 'Optimal'}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default LiveMap
