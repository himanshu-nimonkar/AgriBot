import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Rectangle, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useState, useEffect, useMemo } from 'react'
import { Locate, Layers, Ruler, Mountain, Droplets, Activity } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import throttle from 'lodash.throttle'

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom controls
function LocationMarker({ position, setPosition }) {
    const map = useMap()

    useEffect(() => {
        if (position) {
            map.flyTo(position, 16, { duration: 1.5 })
        }
    }, [position, map])

    return position === null ? null : (
        <Marker position={position}>
            <Popup className="clay-popup">
                <div className="text-center p-1">
                    <p className="font-bold text-olive-leaf mb-1">Field Center</p>
                    <p className="text-xs text-black-forest/70">
                        {position[0].toFixed(4)}, {position[1].toFixed(4)}
                    </p>
                </div>
            </Popup>
        </Marker>
    )
}

function LatLonDisplay({ position }) {
    if (!position) return null
    return (
        <div className="leaflet-bottom leaflet-left" style={{ bottom: '20px', left: '20px', zIndex: 1000 }}>
             <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-glass px-3 py-1.5 flex items-center gap-3"
             >
                <div className="flex flex-col">
                    <span className="text-[9px] text-black-forest/50 font-bold uppercase tracking-wider">Latitude</span>
                    <span className="text-xs font-mono font-bold text-olive-leaf">{position[0].toFixed(4)}°N</span>
                </div>
                <div className="w-px h-6 bg-black-forest/10"></div>
                <div className="flex flex-col">
                    <span className="text-[9px] text-black-forest/50 font-bold uppercase tracking-wider">Longitude</span>
                    <span className="text-xs font-mono font-bold text-copperwood">{position[1].toFixed(4)}°W</span>
                </div>
             </motion.div>
        </div>
    )
}

function CustomMapControls({ onLocate }) {
    const map = useMap()
    return (
        <div className="absolute bottom-5 right-3 lg:top-3 lg:left-3 lg:bottom-auto lg:right-auto z-[1000] flex flex-col gap-2 pointer-events-none">
            {/* Zoom Controls */}
            <div className="pointer-events-auto clay-glass flex flex-col rounded-xl overflow-hidden shadow-clay-sm border border-white/40">
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomIn() }} className="w-9 h-9 flex items-center justify-center text-black-forest/70 hover:bg-black-forest/5 text-lg font-bold transition-colors">+</button>
                <div className="h-px w-full bg-black-forest/10" />
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomOut() }} className="w-9 h-9 flex items-center justify-center text-black-forest/70 hover:bg-black-forest/5 text-lg font-bold transition-colors">-</button>
            </div>

            {/* Locate Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLocate(); }}
                className="pointer-events-auto w-9 h-9 clay-glass flex items-center justify-center text-black-forest/70 hover:text-olive-leaf shadow-clay-sm rounded-xl border border-white/40 bg-[var(--clay-surface)] transition-colors"
                title="Locate Me"
            >
                <Locate size={16} />
            </motion.button>
        </div>
    )
}

function LiveMap({ location, setLocation, satelliteData, activeLayer, onActiveLayerChange, onNdviPointChange, onLocateMe, layerSummary }) {
    const [position, setPosition] = useState([38.5449, -121.7405]) // Default: UC Davis

    // BOUNDARY CALCULATION: Create a rectangle around the center
    const fieldBounds = useMemo(() => {
        const lat = position[0]
        const lon = position[1]
        // Approx 1km box
        return [
            [lat - 0.0045, lon - 0.0055], // SouthWest
            [lat + 0.0045, lon + 0.0055]  // NorthEast
        ]
    }, [position])

    useEffect(() => {
        if (location && location.lat && location.lon) {
            setPosition([parseFloat(location.lat), parseFloat(location.lon)])
        } else {
            // Fallback content if location missing
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setPosition([pos.coords.latitude, pos.coords.longitude])
                    },
                    (err) => {
                        console.warn('Geolocation denied, using default')
                    }
                )
            }
        }
    }, [location])

    const handleLocate = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                setPosition([pos.coords.latitude, pos.coords.longitude])
            })
        }
    }



    // NDVI specific color helper for fallback circles
    const getNDVIColor = (ndvi) => {
        if (ndvi === undefined || ndvi === null) return '#8a8872' // gray/black-forest
        if (ndvi < 0.2) return '#ef4444' // red
        if (ndvi < 0.4) return '#f59e0b' // orange
        if (ndvi < 0.6) return '#10b981' // emerald
        return '#059669' // dark green
    }
    const ndviColor = getNDVIColor(satelliteData?.ndvi_current)

    // Dynamic color for overlays based on type
    const getLayerStyle = (type) => {
        switch(type) {
            case 'ndvi': return { color: ndviColor, fillColor: ndviColor, fillOpacity: 0.4 }
            case 'moisture': return { color: '#0077b6', fillColor: '#0077b6', fillOpacity: 0.3 }
            case 'soil': return { color: '#bc6c25', fillColor: '#bc6c25', fillOpacity: 0.35 }
            case 'elevation': return { color: '#582f0e', fillColor: '#582f0e', fillOpacity: 0.1 } // Just stroke mainly
            default: return { color: '#606c38', fillOpacity: 0.2 }
        }
    }

    const currentStyle = getLayerStyle(activeLayer)

    return (
        <div className="relative w-full h-full z-0 group">
             {/* Map Instance */}
            <MapContainer
                center={position}
                zoom={15}
                scrollWheelZoom={false} // Better for page scroll
                style={{ height: '100%', width: '100%', background: 'transparent' }}
                zoomControl={false} // Move zoom control if needed, or stick to default position
            >
                {/* 1. Base Tile Layer */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    className="map-tiles-filter" // Apply CSS filter for softer look if defined in index.css
                />

                {/* 2. Elevation Topo Layer Toggle */}
                {activeLayer === 'elevation' && (
                    <TileLayer
                        attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                        opacity={0.7}
                    />
                )}

                {/* 3. Satellite Data Tile Layers (Restored) */}
                {activeLayer === 'ndvi' && satelliteData?.tile_url && (
                    <TileLayer
                        key={`ndvi-${satelliteData.tile_url}`}
                        url={satelliteData.tile_url}
                        opacity={0.7}
                        zIndex={100}
                    />
                )}
                {activeLayer === 'moisture' && satelliteData?.ndwi_tile_url && (
                    <TileLayer
                        key={`ndwi-${satelliteData.ndwi_tile_url}`}
                        url={satelliteData.ndwi_tile_url}
                        opacity={0.7}
                        zIndex={100}
                    />
                )}

                {/* 4. Field Boundary Rectangle (Fallback) */}
                {/* Shows if specific satellite tiles aren't available but layer is active */}
                {((activeLayer === 'ndvi' && !satelliteData?.tile_url) || 
                  (activeLayer === 'moisture' && !satelliteData?.ndwi_tile_url) || 
                  activeLayer === 'soil' || activeLayer === 'elevation') && (
                    <Rectangle
                        bounds={fieldBounds}
                        pathOptions={{
                            color: currentStyle.color,
                            weight: 2,
                            fillColor: currentStyle.fillColor,
                            fillOpacity: currentStyle.fillOpacity,
                            dashArray: activeLayer === 'elevation' ? '5, 5' : null
                        }}
                    >
                        <Popup className="clay-popup">
                             <div className="p-1">
                                 <h4 className="font-bold text-black-forest text-xs uppercase mb-1">
                                     {activeLayer === 'ndvi' && 'Vegetation Index (NDVI)'}
                                     {activeLayer === 'moisture' && 'Water Stress Analysis'}
                                     {activeLayer === 'soil' && 'Soil Composition'}
                                     {activeLayer === 'elevation' && 'Topography'}
                                 </h4>
                                 <div className="text-[10px] text-black-forest/70 space-y-1">
                                    {activeLayer === 'ndvi' && <p>Value: <span className="font-bold">{satelliteData?.ndvi_current?.toFixed(2) ?? '0.00'}</span></p>}
                                    {activeLayer === 'moisture' && <p>Status: <span className="text-blue-600 font-bold">{satelliteData?.water_stress_level || 'Adequate'}</span></p>}
                                    {activeLayer === 'soil' && (
                                        <>
                                            <p>Type: <span className="font-bold text-copperwood">Silty Loam</span></p>
                                            <p>pH Level: 6.8 (Neutral)</p>
                                        </>
                                    )}
                                    {activeLayer === 'elevation' && <p>Avg Elevation: <span className="font-bold">42m</span></p>}
                                 </div>
                             </div>
                        </Popup>
                    </Rectangle>
                )}

                <LocationMarker position={position} setPosition={setPosition} />
                <LatLonDisplay position={position} />
                <CustomMapControls onLocate={handleLocate} />

            </MapContainer>

            {/* Upper Right Controls (Layer Summary & Picker) */}
            <div className="absolute top-3 right-3 z-[900] flex flex-col items-end gap-2 pointer-events-none">
                 {/* Field Telemetry Box (Restored) */}
                 <AnimatePresence>
                     <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="pointer-events-auto clay-glass p-3 min-w-[170px] max-w-[180px] origin-top-right shadow-clay-sm rounded-xl border border-white/60 backdrop-blur-xl"
                     >
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-[9px] font-bold text-olive-leaf uppercase tracking-widest">Field Telemetry</h3>
                            <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${satelliteData ? 'bg-olive-leaf animate-pulse' : 'bg-black-forest/40'}`}></span>
                                <span className="text-[9px] text-black-forest/50 font-mono">{satelliteData ? 'LIVE' : 'STANDBY'}</span>
                            </div>
                        </div>

                        <div className="space-y-2 lg:space-y-3">
                            {!satelliteData ? (
                                <div className="space-y-2 lg:space-y-3 animate-pulse">
                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <div className="h-2 w-8 bg-black-forest/10 rounded"></div>
                                            <div className="h-4 w-12 bg-black-forest/10 rounded"></div>
                                        </div>
                                        <div className="h-1.5 w-full bg-black-forest/5 rounded-full"></div>
                                    </div>
                                    <div className="pt-2 border-t border-black-forest/5">
                                        <div className="flex justify-between items-center">
                                            <div className="h-2 w-16 bg-black-forest/10 rounded"></div>
                                            <div className="h-3 w-10 bg-black-forest/10 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* NDVI Section */}
                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-black-forest/60 font-medium">NDVI</span>
                                            <span className="text-sm lg:text-base font-bold text-olive-leaf font-mono leading-none">
                                                {satelliteData.ndvi_current?.toFixed(2) ?? '0.00'}
                                            </span>
                                        </div>

                                        {/* Gradient Bar with Marker */}
                                        <div className="relative h-1.5 w-full bg-black-forest/10 rounded-full overflow-visible">
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 opacity-80"></div>
                                            <div
                                                className="absolute top-[-2px] w-1 h-2.5 bg-white shadow-[0_0_8px_white] rounded-full transition-all duration-1000 ease-out"
                                                style={{ left: `${Math.max(0, Math.min(100, (satelliteData.ndvi_current || 0) * 100))}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-[9px] text-black-forest/40 mt-1 font-mono">
                                            <span>Poor</span>
                                            <span>Healthy</span>
                                        </div>
                                    </div>

                                    {/* Water Stress Section */}
                                    <div className="pt-1.5 lg:pt-2 border-t border-black-forest/5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-black-forest/60 font-medium">Water Stress</span>
                                            <span className={`text-[9px] lg:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${(satelliteData.water_stress_level === 'Low' || !satelliteData.water_stress_level) ? 'bg-olive-leaf/20 text-olive-leaf' :
                                                    satelliteData.water_stress_level === 'Moderate' ? 'bg-yellow-500/20 text-yellow-600' :
                                                        'bg-red-500/20 text-red-600'
                                                }`}>
                                                {satelliteData.water_stress_level || 'Optimal'}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                     </motion.div>
                 </AnimatePresence>

                 {/* Layer Controls */}
                 <div className="pointer-events-auto clay-glass p-1.5 flex flex-col gap-1.5 shadow-clay-sm border border-white/40">
                      {[
                        { id: 'ndvi', icon: Layers, label: 'Vegetation (NDVI)' },
                        { id: 'moisture', icon: Droplets, label: 'Water Stress' },
                        { id: 'soil', icon: Ruler, label: 'Soil Details' },
                        { id: 'elevation', icon: Mountain, label: 'Elevation' }
                      ].map(layer => (
                          <div key={layer.id} className="relative group">
                              <motion.button
                                onClick={() => onActiveLayerChange(layer.id)}
                                whileHover={{ x: -2 }}
                                whileTap={{ scale: 0.95 }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                    activeLayer === layer.id
                                        ? 'bg-olive-leaf text-white shadow-md'
                                        : 'text-black-forest/60 hover:bg-black-forest/5'
                                }`}
                              >
                                 <layer.icon size={16} />
                              </motion.button>
                              
                              {/* Hover Tooltip */}
                              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 bg-black-forest text-white text-[10px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                  {layer.label}
                                  {/* Right pointing triangle */}
                                  <div className="absolute -right-1 top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-l-4 border-l-black-forest"></div>
                              </div>
                          </div>
                      ))}
                 </div>
            </div>

            {/* Timelines / Legends Overlay (Bottom Left, Above Lat/Lon spacing increased to bottom-24) */}
             <div className="absolute bottom-20 md:bottom-24 left-3 z-[900] flex justify-start pointer-events-none mb-2">
                <AnimatePresence mode="wait">

                    
                    {activeLayer === 'soil' && (
                         <motion.div
                            key="soil-legend"
                            initial={{ opacity: 0, y: 20, x: -10 }}
                            animate={{ opacity: 1, y: 0, x: 0 }}
                            exit={{ opacity: 0, y: 10, x: -10 }}
                            className="pointer-events-auto clay-glass p-3 flex gap-4 items-center shadow-clay-sm"
                        >
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-[#bc6c25]"></div>
                                <span className="text-[10px] font-bold text-black-forest">Silty Loam</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-[#dda15e] opacity-50"></div>
                                <span className="text-[10px] font-bold text-black-forest/60">Sandy</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
             </div>
        </div>
    )
}

export default LiveMap
