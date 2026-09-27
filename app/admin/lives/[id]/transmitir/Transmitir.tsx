'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { useEventStream, useServerClock } from '@/components/useEventStream';
import { IconPlay } from '@/components/icons';
import { IconCamera, IconCameraOff, IconFlip, IconMic, IconMicOff, IconUsers } from '@/components/admin/icons-extra';
import { readQuality, supportsHlsCodec, whipPublish, whipStop, WhipError, type PublishCreds, type Quality, type WhipSession } from '@/components/transmit/whip';
import type { AdminItem, AdminItemState, AdminSnapshot, LiveInfo } from '@/lib/live-state';

type PubState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'failed' | 'ended';
type MediaError = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'unsupported' | 'other';

const LS_CAM = 'ls.camera';
const LS_MIC = 'ls.mic';
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sem armazenamento */
    }
  },
};

const pad = (n: number) => String(n).padStart(2, '0');
const hhmmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};
const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

function useMediaQuery(q: string, initial: boolean) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

function videoConstraints(format: 'vertical' | 'horizontal', mobile: boolean, facing: 'user' | 'environment', camId: string): MediaTrackConstraints {
  const vertical = format === 'vertical';
  const c: MediaTrackConstraints & { resizeMode?: string } = {
    width: { ideal: vertical ? 720 : 1280 },
    height: { ideal: vertical ? 1280 : 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  if (!mobile) {
    // Webcam deitada numa live vertical: o Chrome corta o centro no formato 9:16.
    c.aspectRatio = { ideal: vertical ? 9 / 16 : 16 / 9 };
    c.resizeMode = 'crop-and-scale';
  }
  if (camId && !mobile) c.deviceId = { exact: camId };
  else c.facingMode = { ideal: facing };
  return c;
}

function audioConstraints(micId: string): MediaTrackConstraints {
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(micId ? { deviceId: { exact: micId } } : {}) };
}

function mediaErrorOf(e: unknown): MediaError {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notfound';
  if (name === 'NotReadableError' || name === 'AbortError') return 'inuse';
  return 'other';
}

export function Transmitir({ initial, isMobileUA }: { initial: AdminSnapshot; isMobileUA: boolean }) {
  const { flash, toast } = useToast(3200);
  const desktop = useMediaQuery('(min-width: 1024px)', !isMobileUA);
  const portrait = useMediaQuery('(orientation: portrait)', isMobileUA);
  const mobile = isMobileUA || !desktop;

  // ---------- Live (SSE da Central) ----------
  const { now, sync } = useServerClock(500, initial.current.serverNow);
  const [live, setLive] = useState<LiveInfo>(initial.live);
  const [items, setItems] = useState<AdminItem[]>(initial.items);
  const [cur, setCur] = useState<AdminItemState>(initial.current);
  const [viewers, setViewers] = useState(initial.kpis.viewers);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEventStream(`/api/admin/lives/${live.id}/stream`, {
    snapshot: (s: AdminSnapshot) => {
      setLive(s.live);
      setItems(s.items);
      setCur(s.current);
      sync(s.current.serverNow);
      setViewers(s.kpis.viewers);
    },
    item: (s: AdminItemState) => {
      sync(s.serverNow);
      setCur(s);
    },
    items: (d: { items: AdminItem[] }) => setItems(d.items),
    status: (d: { status: LiveInfo['status']; startedAt: number | null; endedAt: number | null }) => setLive((l) => ({ ...l, ...d })),
    viewers: (d: { count: number }) => setViewers(d.count),
    kpis: (d: { viewers: number }) => setViewers(d.viewers),
    stock: (d: { productId: string; available: number }) =>
      setItems((list) => list.map((i) => (i.productId === d.productId ? { ...i, available: d.available } : i))),
  });

  const format = live.format;
  const vertical = format === 'vertical';
  const needRotate = isMobileUA && !vertical && portrait;

  // ---------- Câmera e microfone ----------
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<MediaError | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>(isMobileUA ? 'environment' : 'user');
  const [camId, setCamId] = useState('');
  const [micId, setMicId] = useState('');
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [level, setLevel] = useState(0);
  const [trackInfo, setTrackInfo] = useState('');
  const preview = useRef<HTMLVideoElement>(null);

  const setMediaStream = useCallback((s: MediaStream | null) => {
    streamRef.current = s;
    setStream(s);
    const v = s?.getVideoTracks()[0]?.getSettings();
    setTrackInfo(v?.width ? `${v.width}×${v.height} · ${Math.round(v.frameRate ?? 30)} fps` : '');
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCams(all.filter((d) => d.kind === 'videoinput'));
      setMics(all.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* ignorar */
    }
  }, []);

  const openMedia = useCallback(async () => {
    setMediaError(null);
    if (typeof window !== 'undefined' && !window.isSecureContext) return setMediaError('insecure');
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return setMediaError('unsupported');
    const savedCam = mobile ? '' : store.get(LS_CAM);
    const savedMic = store.get(LS_MIC);
    const tryGet = (cam: string, mic: string) =>
      navigator.mediaDevices.getUserMedia({ video: videoConstraints(format, mobile, facing, cam), audio: audioConstraints(mic) });
    try {
      let s: MediaStream;
      try {
        s = await tryGet(savedCam, savedMic);
      } catch (e) {
        // Dispositivo lembrado sumiu (webcam desconectada): tenta o padrão.
        if ((savedCam || savedMic) && ((e as DOMException).name === 'OverconstrainedError' || (e as DOMException).name === 'NotFoundError')) s = await tryGet('', '');
        else throw e;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setCamId(s.getVideoTracks()[0]?.getSettings().deviceId ?? '');
      setMicId(s.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      setMediaStream(s);
      refreshDevices();
    } catch (e) {
      setMediaError(mediaErrorOf(e));
    }
  }, [facing, format, mobile, refreshDevices, setMediaStream]);

  useEffect(() => {
    openMedia();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // Abre uma vez; trocas de câmera/microfone usam as funções abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener('devicechange', refreshDevices);
    return () => md.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (preview.current && stream) {
      preview.current.srcObject = stream;
      preview.current.play().catch(() => {});
    }
  }, [stream]);

  // Medidor do microfone (Web Audio)
  const audioCtx = useRef<AudioContext | null>(null);
  const audioTrackId = stream?.getAudioTracks()[0]?.id;
  useEffect(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = audioCtx.current ?? new Ctx();
    audioCtx.current = ctx;
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66) return;
      last = t;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) sum += ((b - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
    };
  }, [audioTrackId]);

  // ---------- Publicação (WHIP) ----------
  const [pub, setPub] = useState<PubState>('idle');
  const pubRef = useRef<PubState>('idle');
  const setPubState = (s: PubState) => {
    pubRef.current = s;
    setPub(s);
  };
  const [quality, setQuality] = useState<Quality | null>(null);
  const [kbps, setKbps] = useState(0);
  const [onAirSince, setOnAirSince] = useState<number | null>(null);
  const [startLiveToo, setStartLiveToo] = useState(false);
  const startLiveTooRef = useRef(false);
  startLiveTooRef.current = startLiveToo;
  const session = useRef<WhipSession | null>(null);
  const creds = useRef<PublishCreds | null>(null);
  const wantOn = useRef(false);
  const deadline = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmStartLive, setConfirmStartLive] = useState(false);
  const [bgWarning, setBgWarning] = useState(false);

  const getCreds = useCallback(
    async (force = false) => {
      if (!force && creds.current && creds.current.expiresAt - Date.now() > 120_000) return creds.current;
      const res = await fetch(`/api/admin/lives/${live.id}/publish-token`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new WhipError(data.error?.message ?? 'Sem permissão para transmitir.', res.status);
      creds.current = data as PublishCreds;
      return creds.current;
    },
    [live.id],
  );

  async function startLiveNow() {
    const res = await fetch(`/api/admin/lives/${live.id}/start`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) flash(data.error?.message ?? 'Não foi possível iniciar a live.');
    else flash('Live iniciada: os compradores já estão vendo');
  }

  const scheduleReconnect = useCallback(() => {
    if (!wantOn.current) return;
    clearTimeout(retryTimer.current);
    clearTimeout(connectTimer.current);
    if (!deadline.current) deadline.current = Date.now() + 60_000;
    setPubState('reconnecting');
    let delay = 1000;
    const attempt = async () => {
      if (!wantOn.current) return;
      if (Date.now() > (deadline.current ?? 0)) {
        await whipStop(session.current, creds.current?.token ?? null);
        session.current = null;
        setPubState('failed');
        return;
      }
      await whipStop(session.current, creds.current?.token ?? null);
      session.current = null;
      try {
        await connect();
      } catch (e) {
        if (e instanceof WhipError && (e.status === 403 || e.status === 409)) {
          wantOn.current = false;
          setPubState('failed');
          flash(e.message);
          return;
        }
        retryTimer.current = setTimeout(attempt, delay);
        delay = Math.min(delay * 2, 8000);
      }
    };
    retryTimer.current = setTimeout(attempt, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    const s0 = streamRef.current;
    if (!s0) throw new Error('sem câmera');
    let c = await getCreds();
    let s: WhipSession;
    try {
      s = await whipPublish(s0, c);
    } catch (e) {
      if (e instanceof WhipError && (e.status === 401 || e.status === 400) && /auth/i.test(e.message)) {
        c = await getCreds(true);
        s = await whipPublish(s0, c);
      } else throw e;
    }
    session.current = s;
    const onState = () => {
      if (session.current !== s) return;
      const st = s.pc.connectionState;
      if (st === 'connected') {
        clearTimeout(connectTimer.current);
        deadline.current = null;
        setPubState('live');
        setOnAirSince((v) => v ?? Date.now());
        if (startLiveTooRef.current && liveRef.current.status === 'scheduled') {
          startLiveTooRef.current = false;
          setStartLiveToo(false);
          startLiveNow();
        }
      } else if (st === 'failed' || st === 'closed') {
        scheduleReconnect();
      } else if (st === 'disconnected') {
        setTimeout(() => {
          if (session.current === s && s.pc.connectionState === 'disconnected') scheduleReconnect();
        }, 3000);
      }
    };
    s.pc.addEventListener('connectionstatechange', onState);
    onState(); // a conexão pode ter fechado antes do listener
    // Se a mídia não conectar em 12 s (firewall/UDP), tenta de novo.
    clearTimeout(connectTimer.current);
    connectTimer.current = setTimeout(() => {
      if (session.current === s && s.pc.connectionState !== 'connected') scheduleReconnect();
    }, 12_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCreds, scheduleReconnect]);

  async function startPublishing() {
    if (!streamRef.current) return;
    if (!supportsHlsCodec()) {
      flash('Este navegador não tem o codec de vídeo necessário. Use Chrome, Edge ou Safari atualizado.');
      return;
    }
    wantOn.current = true;
    deadline.current = null;
    setPubState('connecting');
    audioCtx.current?.resume().catch(() => {});
    requestWakeLock();
    try {
      await connect();
    } catch (e) {
      if (e instanceof WhipError && (e.status === 403 || e.status === 409 || e.status === 401)) {
        wantOn.current = false;
        setPubState('idle');
        flash(e.message.includes('WHIP') ? 'O servidor de vídeo recusou a transmissão.' : e.message);
        return;
      }
      scheduleReconnect();
    }
  }

  async function stopPublishing() {
    wantOn.current = false;
    clearTimeout(retryTimer.current);
    clearTimeout(connectTimer.current);
    await whipStop(session.current, creds.current?.token ?? null);
    session.current = null;
    setPubState('ended');
    setOnAirSince(null);
    setQuality(null);
    releaseWakeLock();
  }

  // Volta a tentar na hora quando a rede volta.
  useEffect(() => {
    const on = () => {
      if (wantOn.current && pubRef.current === 'reconnecting') scheduleReconnect();
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [scheduleReconnect]);

  // Qualidade da conexão (getStats a cada 2 s). Ignora os primeiros 6 s (a taxa ainda está subindo)
  // e só mostra piora quando duas leituras seguidas concordam, para não piscar.
  useEffect(() => {
    if (pub !== 'live') return;
    let prev: Awaited<ReturnType<typeof readQuality>>['next'] = null;
    const recent: Quality[] = [];
    const startedAt = Date.now();
    setQuality(null);
    const rank: Record<Quality, number> = { good: 0, unstable: 1, bad: 2 };
    const iv = setInterval(async () => {
      const s = session.current;
      if (!s) return;
      try {
        const q = await readQuality(s.pc, prev);
        prev = q.next;
        setKbps(q.kbps);
        if (Date.now() - startedAt < 6000) return;
        recent.push(q.quality);
        if (recent.length > 2) recent.shift();
        const settled = recent.length === 2 ? (rank[recent[0]] <= rank[recent[1]] ? recent[0] : recent[1]) : recent[0];
        setQuality(settled);
      } catch {
        /* ignorar */
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [pub]);

  // Trocar faixa de vídeo/áudio sem renegociar
  async function swapTrack(kind: 'video' | 'audio', track: MediaStreamTrack) {
    const s = streamRef.current;
    const old = kind === 'video' ? s?.getVideoTracks()[0] : s?.getAudioTracks()[0];
    track.enabled = kind === 'video' ? camOn : micOn;
    const videoTrack = kind === 'video' ? track : s?.getVideoTracks()[0];
    const audioTrack = kind === 'audio' ? track : s?.getAudioTracks()[0];
    const next = new MediaStream([videoTrack, audioTrack].filter((t): t is MediaStreamTrack => !!t));
    const sender = kind === 'video' ? session.current?.video : session.current?.audio;
    await sender?.replaceTrack(track).catch(() => {});
    if (old && old !== track) old.stop();
    setMediaStream(next);
  }

  async function flipCamera() {
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    const old = streamRef.current?.getVideoTracks()[0];
    old?.stop(); // o iPhone não abre duas câmeras ao mesmo tempo
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(format, true, nextFacing, '') });
      await swapTrack('video', s.getVideoTracks()[0]);
      setFacing(nextFacing);
    } catch {
      flash('Não foi possível trocar de câmera.');
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(format, true, facing, '') });
        await swapTrack('video', s.getVideoTracks()[0]);
      } catch {
        setMediaError('inuse');
      }
    }
  }

  async function chooseCamera(id: string) {
    setCamId(id);
    store.set(LS_CAM, id);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(format, false, facing, id) });
      await swapTrack('video', s.getVideoTracks()[0]);
    } catch {
      flash('Não foi possível abrir essa câmera.');
    }
  }

  async function chooseMic(id: string) {
    setMicId(id);
    store.set(LS_MIC, id);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(id) });
      await swapTrack('audio', s.getAudioTracks()[0]);
    } catch {
      flash('Não foi possível abrir esse microfone.');
    }
  }

  function toggleMic() {
    const t = streamRef.current?.getAudioTracks()[0];
    if (t) t.enabled = !micOn;
    setMicOn(!micOn);
  }
  function toggleCam() {
    const t = streamRef.current?.getVideoTracks()[0];
    if (t) t.enabled = !camOn;
    setCamOn(!camOn);
  }

  // ---------- Tela acesa (Wake Lock) e segundo plano ----------
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  async function requestWakeLock() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) wakeLock.current = await wl.request('screen');
    } catch {
      /* sem suporte ou negado */
    }
  }
  function releaseWakeLock() {
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (wantOn.current) setBgWarning(true);
      } else if (wantOn.current) {
        requestWakeLock();
        if (session.current && session.current.pc.connectionState !== 'connected') scheduleReconnect();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (wantOn.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [scheduleReconnect]);

  useEffect(
    () => () => {
      wantOn.current = false;
      clearTimeout(retryTimer.current);
      clearTimeout(connectTimer.current);
      whipStop(session.current, creds.current?.token ?? null);
      releaseWakeLock();
    },
    [],
  );

  // ---------- Produto no ar ----------
  const current = items.find((i) => i.id === cur.itemId) ?? null;
  const curIdx = current ? items.findIndex((i) => i.id === current.id) : -1;
  const remaining = cur.paused || cur.endsAt === null ? (cur.remainingMs ?? 0) : Math.max(0, cur.endsAt - now);
  const [nexting, setNexting] = useState(false);
  async function next() {
    setNexting(true);
    const res = await fetch(`/api/admin/lives/${live.id}/next`, { method: 'POST' });
    setNexting(false);
    if (!res.ok) flash((await res.json().catch(() => ({})))?.error?.message ?? 'Não foi possível trocar.');
  }

  // ---------- Visual ----------
  const transmitting = pub === 'live' || pub === 'connecting' || pub === 'reconnecting';
  const pill =
    pub === 'live'
      ? { text: 'AO VIVO', cls: 'bg-live text-white', dot: true }
      : pub === 'reconnecting'
        ? { text: 'Reconectando', cls: 'bg-[#F5B97A] text-ink', dot: false }
        : pub === 'failed'
          ? { text: 'Sem conexão', cls: 'bg-danger text-white', dot: false }
          : pub === 'ended'
            ? { text: 'Encerrada', cls: 'bg-dark-3 text-dark-muted', dot: false }
            : { text: pub === 'connecting' ? 'Conectando…' : 'Pré-visualização', cls: 'bg-white/15 text-white', dot: false };
  const qualityView = quality === 'good' ? { t: 'Conexão boa', c: 'bg-[#7CB518]', bars: 3 } : quality === 'unstable' ? { t: 'Conexão instável', c: 'bg-[#F5B97A]', bars: 2 } : quality === 'bad' ? { t: 'Conexão ruim', c: 'bg-live', bars: 1 } : null;
  const mirror = facing === 'user' || (!isMobileUA && facing !== 'environment');
  const liveChip = live.status === 'live' ? 'Live no ar' : live.status === 'ended' ? 'Live encerrada' : 'Live ainda não começou';

  const statusPill = (
    <span className={`inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-[11px] font-semibold tracking-[0.04em] ${pill.cls}`} role="status" aria-live="polite">
      {pill.dot && <span className="h-[6px] w-[6px] animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-white" />}
      {pill.text}
    </span>
  );

  const meter = (
    <span className="flex h-4 items-end gap-[2px]" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={micOn ? Math.round(level * 100) : 0}>
      {[0.12, 0.28, 0.45, 0.62, 0.8].map((th, i) => (
        <span key={i} className={`w-[3px] rounded-full ${micOn && level > th ? 'bg-accent' : 'bg-white/25'}`} style={{ height: 5 + i * 2.5 }} />
      ))}
    </span>
  );

  const qualityBadge = qualityView && pub === 'live' && (
    <span className="inline-flex items-center gap-[6px] text-[12px]" title={`${kbps} kbps`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((b) => <span key={b} className={`w-[3px] rounded-full ${b <= qualityView.bars ? qualityView.c : 'bg-white/25'}`} style={{ height: 4 + b * 3 }} />)}
      </span>
      {qualityView.t}
    </span>
  );
  const measuring = pub === 'live' && !qualityView && <span className="text-[12px] text-white/70">Medindo conexão…</span>;

  const productCard = current && live.status === 'live' && (
    <div className="flex items-center gap-[10px] rounded-2xl bg-white p-2 pr-2 text-ink">
      {current.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="h-11 w-11 shrink-0 rounded-xl bg-line-2" />
      )}
      <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
        <span className="text-[11px] text-muted">
          No ar · {curIdx + 1} de {items.length}
          {cur.hidden ? ' · oculto' : ''}
        </span>
        <span className="truncate text-[14px] font-medium">{current.name}</span>
      </span>
      {cur.mode === 'auto' && (
        <span className={`rounded-full px-2 py-[3px] font-mono text-[12px] ${remaining <= 60_000 ? 'bg-warn-bg text-warn' : 'bg-accent text-ink'}`} aria-label="Tempo restante">
          {cur.paused ? 'pausa' : mmss(remaining)}
        </span>
      )}
      <button type="button" onClick={next} disabled={nexting || curIdx >= items.length - 1} className="h-9 shrink-0 rounded-full border-none bg-ink px-3 text-[13px] font-medium text-white disabled:opacity-40">
        Próximo
      </button>
    </div>
  );

  const mainButton =
    pub === 'failed' ? (
      <button type="button" onClick={startPublishing} className="h-14 w-full rounded-full border-none bg-accent text-[16px] font-medium text-ink">Tentar de novo</button>
    ) : transmitting ? (
      <button type="button" onClick={() => setConfirmEnd(true)} className="h-14 w-full rounded-full border-none bg-live text-[16px] font-medium text-white">Encerrar</button>
    ) : (
      <button type="button" onClick={startPublishing} disabled={!stream || live.status === 'ended' || needRotate} className="flex h-14 w-full items-center justify-center gap-[10px] rounded-full border-none bg-accent text-[16px] font-medium text-ink disabled:opacity-50">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-accent"><IconPlay size={11} /></span>
        {pub === 'ended' ? 'Transmitir de novo' : 'Iniciar transmissão'}
      </button>
    );

  const roundBtn = (label: string, on: boolean, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={!on}
      title={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full border-none disabled:opacity-40 ${on ? 'bg-white/15 text-white' : 'bg-white text-ink'}`}
    >
      {icon}
    </button>
  );
  const controls = (
    <div className="flex items-center justify-center gap-3">
      {mobile && roundBtn('Trocar câmera', true, flipCamera, <IconFlip />, !stream)}
      {roundBtn(micOn ? 'Mutar microfone' : 'Ligar microfone', micOn, toggleMic, micOn ? <IconMic /> : <IconMicOff />, !stream)}
      {roundBtn(camOn ? 'Desligar câmera' : 'Ligar câmera', camOn, toggleCam, camOn ? <IconCamera /> : <IconCameraOff />, !stream)}
    </div>
  );
  const startTogether = live.status === 'scheduled' && (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
      <span className="flex flex-grow flex-col">
        <span className="text-[14px]">Iniciar a live junto</span>
        <span className="text-[12px] text-dark-muted">{transmitting ? 'A live começa quando o sinal conectar.' : 'Para quem está operando sozinho.'}</span>
      </span>
      {transmitting && pub === 'live' ? (
        <button type="button" onClick={() => setConfirmStartLive(true)} className="h-9 rounded-full border-none bg-white px-3 text-[13px] font-medium text-ink">Iniciar live</button>
      ) : (
        <Switch label="Iniciar a live junto" checked={startLiveToo} onChange={setStartLiveToo} />
      )}
    </div>
  );

  // ---------- Telas de erro ----------
  if (mediaError) {
    const texts: Record<MediaError, { t: string; d: React.ReactNode }> = {
      denied: {
        t: 'Libere a câmera e o microfone',
        d: (
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-left text-[14px] leading-[1.5] text-dark-muted">
            <li><strong className="font-medium text-white">Chrome ou Edge (celular e computador):</strong> toque no cadeado ao lado do endereço, abra Permissões e deixe Câmera e Microfone em Permitir.</li>
            <li><strong className="font-medium text-white">Safari no iPhone:</strong> toque em “aA” na barra de endereço, Ajustes do Site, e permita Câmera e Microfone. Confira também Ajustes › Safari › Câmera.</li>
            <li><strong className="font-medium text-white">Safari no Mac:</strong> menu Safari › Ajustes › Sites › Câmera e Microfone, e escolha Permitir para este site.</li>
          </ul>
        ),
      },
      notfound: { t: 'Câmera ou microfone não encontrado', d: 'Conecte uma câmera e um microfone e tente de novo.' },
      inuse: { t: 'A câmera está em uso', d: 'Feche outros aplicativos ou abas que estejam usando a câmera (videochamada, por exemplo) e tente de novo.' },
      insecure: { t: 'Abra pelo endereço seguro', d: 'A câmera só funciona em endereço com https. Abra a tela Transmitir pelo QR code da Central ou pelo link do painel.' },
      unsupported: { t: 'Este navegador não transmite', d: 'Use o Chrome, o Edge ou o Safari atualizados.' },
      other: { t: 'Não foi possível abrir a câmera', d: 'Tente de novo. Se continuar, reinicie o navegador.' },
    };
    const x = texts[mediaError];
    return (
      <main className="on-dark flex min-h-[100dvh] items-center justify-center bg-dark p-5 text-white">
        <div className="flex w-full max-w-[460px] flex-col gap-4 rounded-card-lg bg-dark-2 p-6">
          <span className="text-[13px] text-dark-muted">{live.name}</span>
          <h1 className="text-[24px] font-medium tracking-[-0.02em]">{x.t}</h1>
          {typeof x.d === 'string' ? <p className="m-0 text-[14px] leading-[1.5] text-dark-muted">{x.d}</p> : x.d}
          <button type="button" onClick={openMedia} className="mt-2 h-12 rounded-full border-none bg-accent text-[15px] font-medium text-ink">Tentar de novo</button>
          <Link href={`/admin/lives/${live.id}/central`} className="text-center text-[13px] text-dark-muted">Voltar para a Central</Link>
        </div>
      </main>
    );
  }

  const video = (
    <video
      ref={preview}
      muted
      playsInline
      autoPlay
      aria-label="Prévia da câmera"
      className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''} ${camOn ? '' : 'opacity-0'}`}
    />
  );

  const modals = (
    <>
      {confirmEnd && (
        <Modal labelledBy="end-t" onClose={() => setConfirmEnd(false)} width={420}>
          <h2 id="end-t" className="text-[22px] font-medium tracking-[-0.02em]">Encerrar a transmissão?</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-muted">Os compradores deixam de ver o vídeo. A live continua aberta até alguém encerrá-la na Central.</p>
          <div className="flex flex-wrap justify-end gap-2 pt-[6px]">
            <button type="button" onClick={() => setConfirmEnd(false)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Continuar transmitindo</button>
            <button type="button" onClick={() => { setConfirmEnd(false); stopPublishing(); }} className="h-11 rounded-full border-none bg-live px-[18px] text-[14px] font-medium text-white">Encerrar</button>
          </div>
        </Modal>
      )}
      {confirmStartLive && (
        <Modal labelledBy="sl-t" onClose={() => setConfirmStartLive(false)} width={420}>
          <h2 id="sl-t" className="text-[22px] font-medium tracking-[-0.02em]">Iniciar a live?</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-muted">Os compradores da sala de espera entram na live e o primeiro produto vai ao ar.</p>
          <div className="flex justify-end gap-2 pt-[6px]">
            <button type="button" onClick={() => setConfirmStartLive(false)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Agora não</button>
            <button type="button" onClick={() => { setConfirmStartLive(false); startLiveNow(); }} className="h-11 rounded-full border-none bg-ink px-[18px] text-[14px] font-medium text-white">Iniciar live</button>
          </div>
        </Modal>
      )}
      {toast}
    </>
  );

  const bgBanner = bgWarning && (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-warn-bg px-4 py-3 text-[13px] leading-[1.4] text-warn">
      <span className="flex-grow">A tela saiu do primeiro plano e a transmissão pode ter caído. Confira o selo de status e mantenha esta tela aberta.</span>
      <button type="button" onClick={() => setBgWarning(false)} className="border-none bg-transparent p-0 text-[13px] font-medium text-warn underline">Ok</button>
    </div>
  );

  // ---------- Celular: tela cheia ----------
  if (mobile) {
    return (
      <main className="on-dark fixed inset-0 overflow-hidden bg-black text-white">
        {video}
        {!camOn && <div className="absolute inset-0 flex items-center justify-center text-[14px] text-dark-muted">Câmera desligada</div>}
        <div className="absolute inset-x-0 top-0 flex flex-col gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <Link href={`/admin/lives/${live.id}/central`} aria-label="Voltar para a Central" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white no-underline">‹</Link>
            <span className="min-w-0 flex-grow truncate text-[15px] font-medium">{live.name}</span>
            {statusPill}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-[12px] text-white/85">
            <span className="font-mono">{onAirSince ? hhmmss(Date.now() - onAirSince) : '00:00:00'}</span>
            <span className="inline-flex items-center gap-1"><IconUsers />{viewers}</span>
            {meter}
            {qualityBadge || measuring}
          </div>
          <div className="pl-11">{bgBanner}</div>
        </div>

        {needRotate && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-solid border-white/70 text-[26px]">↻</span>
            <p className="m-0 text-[16px] font-medium">Gire o celular</p>
            <p className="m-0 text-[14px] text-dark-muted">Esta live é horizontal. Transmita com o celular deitado.</p>
          </div>
        )}

        <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-12 ${!portrait ? 'left-auto w-[380px]' : ''}`}>
          {productCard}
          {startTogether}
          {controls}
          {mainButton}
          <span className="text-center text-[12px] text-white/70">
            Mantenha esta tela aberta · {liveChip}
            {trackInfo ? ` · ${trackInfo}` : ''}
          </span>
        </div>
        {modals}
      </main>
    );
  }

  // ---------- Computador: prévia no formato da live + painel ----------
  const sel = 'h-11 w-full rounded-xl border-none bg-dark-3 px-3 text-[14px] text-white';
  return (
    <main className="on-dark flex min-h-screen bg-dark text-white">
      <section className="flex min-w-0 flex-grow items-center justify-center p-6">
        <div
          className={`relative overflow-hidden rounded-[28px] bg-dark-3 ${vertical ? 'aspect-[9/16] h-[calc(100vh-48px)] max-h-[1280px]' : 'aspect-video w-full max-w-[1280px]'}`}
          style={vertical ? undefined : { maxHeight: 'calc(100vh - 48px)' }}
        >
          {video}
          {!camOn && <div className="absolute inset-0 flex items-center justify-center text-[14px] text-dark-muted">Câmera desligada</div>}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            {statusPill}
            <span className="rounded-full bg-black/40 px-[10px] py-1 font-mono text-[12px]">{onAirSince ? hhmmss(Date.now() - onAirSince) : '00:00:00'}</span>
          </div>
          {trackInfo && <span className="absolute bottom-4 left-4 rounded-full bg-black/40 px-[10px] py-1 font-mono text-[11px]">{trackInfo}</span>}
        </div>
      </section>

      <aside className="box-border flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-solid border-dark-line bg-dark-2 p-6">
        <div className="flex items-center gap-[10px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-ink"><IconPlay /></span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[12px] text-dark-muted">Transmitir · {live.brandName}</span>
            <span className="truncate text-[16px] font-medium">{live.name}</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1 rounded-2xl bg-dark-3 p-3">
            <span className="text-[11px] text-dark-muted">Status</span>
            <span className="text-[13px] font-medium">{pill.text}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-dark-3 p-3">
            <span className="text-[11px] text-dark-muted">No ar</span>
            <span className="font-mono text-[13px]">{onAirSince ? hhmmss(Date.now() - onAirSince) : '00:00:00'}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-dark-3 p-3">
            <span className="text-[11px] text-dark-muted">Assistindo</span>
            <span className="text-[13px] font-medium tabular">{viewers}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-dark-3 px-4 py-3 text-[13px]">
          <span className="inline-flex items-center gap-2">Microfone {meter}</span>
          {qualityBadge || measuring || <span className="text-dark-muted">{liveChip}</span>}
        </div>
        {bgBanner}

        {productCard || (
          <div className="rounded-2xl bg-dark-3 px-4 py-3 text-[13px] text-dark-muted">
            {live.status === 'live' ? 'Nenhum produto no ar.' : live.status === 'ended' ? 'A live foi encerrada.' : 'O produto no ar aparece aqui quando a live começar.'}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="cam" className="text-[12px] text-dark-muted">Câmera</label>
            <select id="cam" className={sel} value={camId} onChange={(e) => chooseCamera(e.target.value)}>
              {cams.length === 0 && <option value="">Câmera padrão</option>}
              {cams.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Câmera ${i + 1}`}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="mic" className="text-[12px] text-dark-muted">Microfone</label>
            <select id="mic" className={sel} value={micId} onChange={(e) => chooseMic(e.target.value)}>
              {mics.length === 0 && <option value="">Microfone padrão</option>}
              {mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}
            </select>
          </div>
        </div>

        {controls}
        {startTogether}
        <div className="flex-grow" />
        {mainButton}
        <span className="text-center text-[12px] text-dark-muted">Mantenha esta tela aberta durante a live.</span>
        <Link href={`/admin/lives/${live.id}/central`} className="text-center text-[13px] text-accent">Abrir a Central</Link>
      </aside>
      {modals}
    </main>
  );
}
