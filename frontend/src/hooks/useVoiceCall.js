import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceClient } from 'agents/voice/client'

/**
 * In-app voice call to the Cloudflare Worker (WebSocket + Durable Object).
 * One session id is shared with text chat, so the assistant remembers the whole conversation.
 */
export default function useVoiceCall({ agentUrl, sessionId, accessCode, onContext, onNotice }) {
    const clientRef = useRef(null)
    const cbRef = useRef({ onContext, onNotice })
    cbRef.current = { onContext, onNotice }

    const [status, setStatus] = useState('idle') // idle | listening | thinking | speaking
    const [connected, setConnected] = useState(false)
    const [inCall, setInCall] = useState(false)
    const [transcript, setTranscript] = useState([])
    const [interim, setInterim] = useState(null)
    const [level, setLevel] = useState(0)
    const [muted, setMuted] = useState(false)
    const [error, setError] = useState(null)
    const [notice, setNotice] = useState(null)
    const [metrics, setMetrics] = useState(null)

    const teardown = useCallback(() => {
        const c = clientRef.current
        clientRef.current = null
        if (c) {
            try { c.endCall() } catch { /* already closed */ }
            try { c.disconnect() } catch { /* already closed */ }
        }
        setInCall(false)
        setConnected(false)
        setStatus('idle')
        setInterim(null)
        setLevel(0)
    }, [])

    const startCall = useCallback(async () => {
        if (!agentUrl || clientRef.current) return
        setError(null)
        setNotice(null)
        setTranscript([])
        setMetrics(null)
        const host = new URL(agentUrl).host
        const client = new VoiceClient({
            agent: 'AgriAgent',
            name: sessionId,
            host,
            query: accessCode ? { code: accessCode } : undefined,
            preferredFormat: 'mp3'
        })
        client.addEventListener('statuschange', setStatus)
        client.addEventListener('connectionchange', setConnected)
        client.addEventListener('transcriptchange', (t) => setTranscript([...t]))
        client.addEventListener('interimtranscript', setInterim)
        client.addEventListener('audiolevelchange', setLevel)
        client.addEventListener('mutechange', setMuted)
        client.addEventListener('metricschange', setMetrics)
        client.addEventListener('error', (e) => e && setError(e))
        client.addEventListener('custommessage', (m) => {
            if (m?.type === 'agri_context') cbRef.current.onContext?.(m)
            if (m?.type === 'agri_notice') {
                setNotice(m.text)
                cbRef.current.onNotice?.(m)
            }
        })
        clientRef.current = client
        client.connect()
        setInCall(true)
        try {
            await client.startCall()
        } catch (e) {
            // most commonly: microphone permission denied
            setError(e?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser settings and try again.' : (e?.message || 'Could not start the call'))
            teardown()
        }
    }, [agentUrl, sessionId, accessCode, teardown])

    const endCall = useCallback(() => teardown(), [teardown])
    const toggleMute = useCallback(() => clientRef.current?.toggleMute(), [])

    useEffect(() => () => teardown(), [teardown])

    return { status, connected, inCall, transcript, interim, level, muted, error, notice, metrics, startCall, endCall, toggleMute }
}
