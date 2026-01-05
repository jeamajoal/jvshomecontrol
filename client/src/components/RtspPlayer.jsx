import React, { useEffect, useRef, useState } from 'react';

import JSMpeg from '@cycjimmy/jsmpeg-player';

import { API_HOST } from '../apiHost';

const RtspPlayer = ({ cameraId, className = '' }) => {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = String(cameraId || '').trim();
    if (!id) {
      setStatus('error');
      setError('Missing cameraId');
      return () => undefined;
    }

    let mounted = true;
    const ac = new AbortController();

    const cleanup = () => {
      try {
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch {
        // ignore
      }
      try {
        if (wrapperRef.current) wrapperRef.current.innerHTML = '';
      } catch {
        // ignore
      }
    };

    const run = async () => {
      cleanup();
      setError(null);
      setStatus('loading');

      try {
        const res = await fetch(`${API_HOST}/api/cameras/${encodeURIComponent(id)}/rtsp/ensure`, {
          method: 'GET',
          signal: ac.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `RTSP stream start failed (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        const wsUrl = String(data?.wsUrl || '').trim();
        if (!wsUrl) throw new Error('RTSP stream did not return wsUrl');

        if (!mounted) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) throw new Error('Missing player wrapper');

        // node-rtsp-stream outputs an MPEG1 video over websocket, which JSMpeg can decode.
        playerRef.current = new JSMpeg.VideoElement(wrapper, wsUrl, {
          autoplay: true,
          control: false,
          decodeFirstFrame: true,
          autoSetWrapperSize: false,
        });

        if (!mounted) return;
        setStatus('ready');
      } catch (e) {
        if (!mounted) return;
        setStatus('error');
        setError(e?.message || String(e));
      }
    };

    run();

    return () => {
      mounted = false;
      ac.abort();
      cleanup();
    };
  }, [cameraId]);

  if (status === 'error') {
    return (
      <div className={`w-full aspect-video flex items-center justify-center text-xs text-white/45 ${className}`.trim()}>
        {error || 'Stream unavailable'}
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-video ${className}`.trim()}>
      {status !== 'ready' ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/45">
          Starting stream…
        </div>
      ) : null}
      <div ref={wrapperRef} className="absolute inset-0" />
    </div>
  );
};

export default RtspPlayer;
