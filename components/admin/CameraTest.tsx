'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';

const LS_CAM = 'ls.camera';
const LS_MIC = 'ls.mic';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

/** "Testar câmera" (Configurações › Transmissão): prévia, medidor do microfone e escolha de dispositivos. */
export function CameraTest({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cam, setCam] = useState(store.get(LS_CAM));
  const [mic, setMic] = useState(store.get(LS_MIC));
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setCams(all.filter((d) => d.kind === 'videoinput'));
    setMics(all.filter((d) => d.kind === 'audioinput'));
  }, []);

  const start = useCallback(async () => {
    stop();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não libera a câmera aqui. Use HTTPS e um navegador atual (Chrome, Edge ou Safari).');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: cam ? { exact: cam } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { deviceId: mic ? { exact: mic } : undefined, echoCancellation: true, noiseSuppression: true },
      });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      const v = s.getVideoTracks()[0]?.getSettings();
      setInfo(v?.width ? `${v.width}×${v.height} · ${Math.round(v.frameRate ?? 0)} fps` : '');
      await refreshDevices();

      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const b of buf) sum += ((b - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError')
        setError('Sem permissão para a câmera e o microfone. No Chrome ou Edge, clique no cadeado ao lado do endereço e permita câmera e microfone. No Safari, abra Ajustes do site (Safari › Configurações › Sites) e permita. Depois, clique em Tentar de novo.');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setError('Dispositivo não encontrado. Escolha outra câmera ou microfone.');
      else if (name === 'NotReadableError') setError('A câmera está em uso por outro programa. Feche-o e tente de novo.');
      else setError('Não foi possível abrir a câmera. Tente de novo.');
    }
  }, [cam, mic, refreshDevices, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener('devicechange', refreshDevices);
    return () => md.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  const sel = 'h-[46px] w-full rounded-xl border-none bg-surface-2 px-3 text-[14px]';
  return (
    <Modal labelledBy="cam-title" onClose={onClose} width={560}>
      <h2 id="cam-title" className="text-[22px] font-medium tracking-[-0.02em]">Testar câmera</h2>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-dark">
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
        {info && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-[10px] py-1 font-mono text-[12px] text-white">{info}</span>}
        {error && <p role="alert" className="absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-[14px] leading-[1.5] text-white">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted">Microfone</span>
        <div className="h-2 flex-grow overflow-hidden rounded-full bg-surface-2" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div className="h-2 rounded-full bg-accent-ink" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="cam-sel" className="text-[12px] text-muted">Câmera</label>
          <select id="cam-sel" className={sel} value={cam} onChange={(e) => { setCam(e.target.value); store.set(LS_CAM, e.target.value); }}>
            <option value="">Padrão do navegador</option>
            {cams.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Câmera ${i + 1}`}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="mic-sel" className="text-[12px] text-muted">Microfone</label>
          <select id="mic-sel" className={sel} value={mic} onChange={(e) => { setMic(e.target.value); store.set(LS_MIC, e.target.value); }}>
            <option value="">Padrão do navegador</option>
            {mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-[6px]">
        {error && <button type="button" onClick={start} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Tentar de novo</button>}
        <button type="button" onClick={onClose} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white">Fechar</button>
      </div>
    </Modal>
  );
}
