import { useState, useEffect, useCallback, useRef } from 'react'

// API base URL for WebSocket - uses Cloudflare tunnel in production
const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const useWebSocket = () => {
    const [isConnected, setIsConnected] = useState(false)
    const [lastMessage, setLastMessage] = useState(null)
    const wsRef = useRef(null)
    const reconnectTimeoutRef = useRef(null)

    const connect = useCallback(() => {
        try {
            let wsUrl
            if (API_BASE_URL) {
                // Production: use the Cloudflare tunnel URL
                const baseUrl = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
                wsUrl = `${baseUrl}/ws/dashboard`
            } else {
                // Development: use current host
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
                wsUrl = `${protocol}//${window.location.host}/ws/dashboard`
            }

            wsRef.current = new WebSocket(wsUrl)

            wsRef.current.onopen = () => {
                console.log('WebSocket connected')
                setIsConnected(true)
            }

            wsRef.current.onmessage = (event) => {
                // Ignore heartbeat pong messages
                if (event.data === 'pong') return

                try {
                    const data = JSON.parse(event.data)
                    setLastMessage(data)
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e)
                }
            }

            wsRef.current.onclose = () => {
                console.log('WebSocket disconnected')
                setIsConnected(false)

                // Attempt to reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect()
                }, 3000)
            }

            wsRef.current.onerror = (error) => {
                console.error('WebSocket error:', error)
                setIsConnected(false)
            }
        } catch (error) {
            console.error('Failed to connect WebSocket:', error)
        }
    }, [])

    const sendQuery = useCallback((query, lat, lon, crop) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'query',
                query,
                lat,
                lon,
                crop
            }))
        }
    }, [])

    useEffect(() => {
        connect()

        // Keepalive ping
        const pingInterval = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send('ping')
            }
        }, 30000)

        return () => {
            clearInterval(pingInterval)
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [connect])

    return { isConnected, lastMessage, sendQuery }
}

export default useWebSocket
