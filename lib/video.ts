// Endereços do vídeo. O caminho no MediaMTX é live/{id da live}: a stream_key nunca aparece.
export function hlsUrlFor(liveId: string) {
  return hlsUrlsFor(liveId).primary;
}

/**
 * O caminho "-aac" é a mesma transmissão com o áudio convertido de Opus para AAC (toca no Safari do iPhone).
 * Se ele não aparecer (navegador que mandou VP9 em vez de H.264), o player cai para o caminho original.
 */
export function hlsUrlsFor(liveId: string) {
  const base = (process.env.HLS_BASE_URL || 'http://localhost:8888').replace(/\/$/, '');
  const raw = `${base}/live/${liveId}/index.m3u8`;
  if (process.env.HLS_AUDIO_AAC === '0') return { primary: raw, fallback: null as string | null };
  return { primary: `${base}/live/${liveId}-aac/index.m3u8`, fallback: raw as string | null };
}

export function whipUrlFor(liveId: string) {
  const base = (process.env.WHIP_BASE_URL || 'http://localhost:8889').replace(/\/$/, '');
  return `${base}/live/${liveId}/whip`;
}

export function iceServers(): RTCIceServer[] {
  // simplificação: sem TURN, adicionar coturn se apresentadores em redes restritas não conseguirem conectar
  const url = process.env.TURN_URL;
  if (!url) return [];
  return [{ urls: url.split(',').map((u) => u.trim()), username: process.env.TURN_USER || undefined, credential: process.env.TURN_PASS || undefined }];
}

type RTCIceServer = { urls: string | string[]; username?: string; credential?: string };
