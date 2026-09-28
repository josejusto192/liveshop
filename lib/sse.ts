// Resposta Server-Sent Events para route handlers. Mantém a conexão viva e limpa tudo ao fechar.
export type Send = (event: string, data: unknown) => void;
export type SendFrame = (bytes: Uint8Array) => void;

export function sseResponse(req: Request, open: (send: Send, sendFrame: SendFrame) => Promise<(() => void) | void> | (() => void) | void) {
  const enc = new TextEncoder();
  let closed = false;
  let cleanup: (() => void) | void;
  let ping: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const finish = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    try {
      cleanup?.();
    } catch {
      /* ignorar */
    }
    try {
      controllerRef?.close();
    } catch {
      /* já fechado */
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      const writeBytes = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          finish();
        }
      };
      const write = (chunk: string) => writeBytes(enc.encode(chunk));
      req.signal.addEventListener('abort', finish);
      write('retry: 3000\n\n');
      const send: Send = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      ping = setInterval(() => write(': ping\n\n'), 15_000);
      try {
        const c = await open(send, writeBytes);
        if (closed) c?.();
        else cleanup = c;
      } catch (e) {
        console.error('[sse] erro ao abrir', e);
        finish();
      }
    },
    cancel() {
      finish();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
