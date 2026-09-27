'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string | null;
  /** Endereço alternativo quando o principal não carrega (ex.: sem o caminho com áudio AAC). */
  fallbackSrc?: string | null;
  muted?: boolean;
  className?: string;
  /** Avisa quando começa a tocar ou quando o vídeo some (sem sinal). */
  onStatus?: (s: 'loading' | 'playing' | 'waiting' | 'error') => void;
  poster?: string;
  label?: string;
};

// Player HLS: nativo no Safari, hls.js nos outros. Tenta de novo sozinho enquanto a transmissão não chega.
export function HlsPlayer({ src: primary, fallbackSrc, muted = true, className, onStatus, label }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const status = useRef(onStatus);
  status.current = onStatus;
  // Alterna entre o principal e o alternativo a cada nova tentativa (a 2ª já tenta o alternativo).
  const src = fallbackSrc && attempt % 2 === 1 ? fallbackSrc : primary;

  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    let destroyed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let hls: import('hls.js').default | null = null;
    const again = () => {
      if (destroyed) return;
      status.current?.('waiting');
      retry = setTimeout(() => setAttempt((a) => a + 1), 2000);
    };
    const onPlaying = () => status.current?.('playing');
    const onWaiting = () => status.current?.('waiting');
    v.addEventListener('playing', onPlaying);
    v.addEventListener('waiting', onWaiting);
    status.current?.('loading');

    const tryPlay = () => v.play().catch(() => {});
    if (v.canPlayType('application/vnd.apple.mpegurl') && !/Chrome|Android/.test(navigator.userAgent)) {
      v.src = src;
      v.addEventListener('loadedmetadata', tryPlay, { once: true });
      v.addEventListener('error', again, { once: true });
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) {
          v.src = src;
          tryPlay();
          return;
        }
        hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, maxLiveSyncPlaybackRate: 1.1, manifestLoadingMaxRetry: 1, manifestLoadingRetryDelay: 500, levelLoadingMaxRetry: 4 });
        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            hls?.destroy();
            hls = null;
            again();
          }
        });
        hls.loadSource(src);
        hls.attachMedia(v);
      });
    }
    return () => {
      destroyed = true;
      clearTimeout(retry);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('waiting', onWaiting);
      hls?.destroy();
      v.removeAttribute('src');
      v.load();
    };
  }, [src, attempt]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  return <video ref={video} className={className} muted={muted} playsInline autoPlay aria-label={label} />;
}
