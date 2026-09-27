import { describe, expect, it } from 'vitest';
import { signPublishToken, verifyPublishToken } from '@/lib/publish-token';

const live = { id: '08734941-48f1-48bf-8609-0c94bdc67e02', streamKey: 'segredo-da-live' };
const admin = 'cb693754-08d6-4b8d-858c-424a26a11993';

describe('token de publicação', () => {
  it('é curto o bastante para a URL RTSP do FFmpeg e volta o admin', () => {
    const { token } = signPublishToken(live, admin, 1_000_000);
    expect(token.length).toBeLessThan(64);
    expect(verifyPublishToken(token, live, 1_000_000)).toEqual({ adminUserId: admin });
  });
  it('recusa token expirado, de outra live, de outra chave ou adulterado', () => {
    const { token } = signPublishToken(live, admin, 1_000_000, 60);
    expect(verifyPublishToken(token, live, 1_000_000 + 60_000)).toBeNull();
    expect(verifyPublishToken(token, { ...live, id: '18734941-48f1-48bf-8609-0c94bdc67e02' }, 1_000_000)).toBeNull();
    expect(verifyPublishToken(token, { ...live, streamKey: 'outra' }, 1_000_000)).toBeNull();
    const [b, s] = token.split('.');
    expect(verifyPublishToken(`${b.slice(0, -2)}AA.${s}`, live, 1_000_000)).toBeNull();
    expect(verifyPublishToken('lixo', live)).toBeNull();
  });
});
