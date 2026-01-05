import React, { useEffect, useRef, useState } from 'react';

import Hls from 'hls.js';

import { API_HOST } from '../apiHost';

const HlsPlayer = ({ cameraId, className = '' }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

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
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      } catch {
        // ignore
      }
      try {
        const video = videoRef.current;
        if (video) {
          video.removeAttribute('src');
          video.load();
        }
      } catch {
        // ignore
      }
    };

    const run = async () => {
      cleanup();
      setError(null);
      setStatus('loading');

      try {
        const res = await fetch(`${API_HOST}/api/cameras/${encodeURIComponent(id)}/hls/ensure`, {
          method: 'GET',
          signal: ac.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HLS stream start failed (${res.status})`);
        }

        const data = await res.json().catch(() => ({}));
        const playlistUrl = String(data?.playlistUrl || '').trim();
        if (!playlistUrl) throw new Error('HLS stream did not return playlistUrl');

        if (!mounted) return;

        const video = videoRef.current;
        if (!video) throw new Error('Missing video element');

        // iOS Safari + some smart TVs: native HLS
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = playlistUrl;
          await video.play().catch(() => undefined);
          if (!mounted) return;
          setStatus('ready');
          return;
        }

        // Most modern browsers: hls.js
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
          });

          hlsRef.current = hls;

          hls.on(Hls.Events.ERROR, (_evt, data2) => {
            if (!mounted) return;
            if (data2?.fatal) {
              setStatus('error');
              setError(data2?.details || data2?.type || 'HLS fatal error');
              try {
                hls.destroy();
              } catch {
                // ignore
              }
              hlsRef.current = null;
            }
          });

          hls.loadSource(playlistUrl);
          hls.attachMedia(video);

          // Wait for manifest parsed before attempting autoplay
          hls.on(Hls.Events.MANIFEST_PARSED, async () => {
            try {
              await video.play();
            } catch {
              // ignore autoplay failure
            }
            if (!mounted) return;
            setStatus('ready');
          });

          return;
        }

        throw new Error('HLS is not supported in this browser');
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
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        controls={false}
      />
    </div>
  );
};

export default HlsPlayer;
