// Publicação WebRTC por WHIP para o MediaMTX (tela Transmitir).
export type PublishCreds = { whipUrl: string; token: string; expiresAt: number; iceServers: RTCIceServer[] };
export type Quality = 'good' | 'unstable' | 'bad';

export const MAX_BITRATE = 2_500_000;

/** H.264 primeiro (o HLS precisa dele); VP9 como alternativa; nunca VP8 (o HLS não aceita). */
export function preferVideoCodecs(transceiver: RTCRtpTransceiver) {
  const caps = typeof RTCRtpSender !== 'undefined' && RTCRtpSender.getCapabilities ? RTCRtpSender.getCapabilities('video') : null;
  if (!caps || typeof transceiver.setCodecPreferences !== 'function') return;
  const mime = (c: RTCRtpCodec) => c.mimeType.toLowerCase();
  const score = (c: RTCRtpCodec) => {
    const f = c.sdpFmtpLine ?? '';
    return (f.includes('packetization-mode=1') ? 2 : 0) + (/profile-level-id=42e0/i.test(f) ? 1 : 0);
  };
  const h264 = caps.codecs.filter((c) => mime(c) === 'video/h264').sort((a, b) => score(b) - score(a));
  const vp9 = caps.codecs.filter((c) => mime(c) === 'video/vp9');
  const extras = caps.codecs.filter((c) => /rtx|red|ulpfec|flexfec/.test(mime(c)));
  const primary = [...h264, ...vp9];
  if (!primary.length) return;
  try {
    transceiver.setCodecPreferences([...primary, ...extras]);
  } catch {
    /* navegador sem suporte: segue com o padrão */
  }
}

export function supportsHlsCodec(): boolean {
  const caps = typeof RTCRtpSender !== 'undefined' && RTCRtpSender.getCapabilities ? RTCRtpSender.getCapabilities('video') : null;
  if (!caps) return true;
  return caps.codecs.some((c) => /video\/(h264|vp9)/i.test(c.mimeType));
}

function waitIceGathering(pc: RTCPeerConnection, timeoutMs: number) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(t);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class WhipError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type WhipSession = { pc: RTCPeerConnection; resourceUrl: string | null; video: RTCRtpSender; audio: RTCRtpSender | null };

/** Cria a conexão, negocia por WHIP e devolve a sessão. Não espera a mídia conectar. */
export async function whipPublish(stream: MediaStream, creds: PublishCreds): Promise<WhipSession> {
  const pc = new RTCPeerConnection({ iceServers: creds.iceServers, bundlePolicy: 'max-bundle' });
  const vTrack = stream.getVideoTracks()[0];
  const aTrack = stream.getAudioTracks()[0];
  const vt = pc.addTransceiver(vTrack, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: MAX_BITRATE }] });
  preferVideoCodecs(vt);
  const at = aTrack ? pc.addTransceiver(aTrack, { direction: 'sendonly', streams: [stream] }) : null;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceGathering(pc, 2500);
    const res = await fetch(creds.whipUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.token}` },
      body: pc.localDescription!.sdp,
    });
    if (res.status !== 201 && res.status !== 200) {
      const text = await res.text().catch(() => '');
      throw new WhipError(text || `WHIP ${res.status}`, res.status);
    }
    const answer = await res.text();
    const loc = res.headers.get('Location');
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    await limitBitrate(vt.sender);
    return { pc, resourceUrl: loc ? new URL(loc, creds.whipUrl).toString() : null, video: vt.sender, audio: at?.sender ?? null };
  } catch (e) {
    pc.close();
    throw e;
  }
}

export async function limitBitrate(sender: RTCRtpSender, max = MAX_BITRATE) {
  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = max;
    await sender.setParameters(p);
  } catch {
    /* alguns navegadores não deixam antes de conectar; o sendEncodings já limitou */
  }
}

export async function whipStop(s: WhipSession | null, token: string | null) {
  if (!s) return;
  try {
    s.pc.close();
  } catch {
    /* já fechada */
  }
  if (s.resourceUrl) {
    fetch(s.resourceUrl, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {}, keepalive: true }).catch(() => {});
  }
}

type Prev = { bytes: number; at: number; lost: number; received: number } | null;

/** Lê getStats e classifica a conexão. */
export async function readQuality(pc: RTCPeerConnection, prev: Prev): Promise<{ quality: Quality; kbps: number; next: Prev; limitedBy: string | null }> {
  const stats = await pc.getStats();
  let bytes = 0;
  let limitedBy: string | null = null;
  let rtt: number | null = null;
  let lost = 0;
  let received = 0;
  let frac: number | null = null;
  stats.forEach((r) => {
    if (r.type === 'outbound-rtp' && r.kind === 'video') {
      bytes += r.bytesSent ?? 0;
      if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') limitedBy = r.qualityLimitationReason;
    }
    if (r.type === 'remote-inbound-rtp' && r.kind === 'video') {
      if (typeof r.roundTripTime === 'number') rtt = r.roundTripTime;
      if (typeof r.fractionLost === 'number') frac = r.fractionLost;
      lost += r.packetsLost ?? 0;
    }
    if (r.type === 'outbound-rtp' && r.kind === 'video') received += r.packetsSent ?? 0;
    if (r.type === 'candidate-pair' && r.nominated && typeof r.currentRoundTripTime === 'number' && rtt === null) rtt = r.currentRoundTripTime;
  });
  const now = performance.now();
  const kbps = prev && now > prev.at ? Math.max(0, Math.round(((bytes - prev.bytes) * 8) / (now - prev.at))) : 0;
  const lossRatio = frac ?? (prev && received > prev.received ? Math.max(0, (lost - prev.lost) / (received - prev.received)) : 0);
  let quality: Quality = 'good';
  const r = rtt ?? 0;
  // A taxa sozinha engana (começa baixa e cai com a câmera desligada); o que pesa é perda, atraso e limite de banda.
  if (lossRatio > 0.1 || r > 0.6 || (limitedBy === 'bandwidth' && kbps < 300)) quality = 'bad';
  else if (lossRatio > 0.03 || r > 0.3 || limitedBy === 'bandwidth' || limitedBy === 'cpu') quality = 'unstable';
  return { quality, kbps, next: { bytes, at: now, lost, received }, limitedBy };
}
