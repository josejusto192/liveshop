import { describe, expect, it } from 'vitest';
import { can } from '@/lib/permissions';

describe('papéis', () => {
  it('financeiro não cria live nem mexe em produtos', () => {
    expect(can('finance', 'lives:write')).toBe(false);
    expect(can('finance', 'products:write')).toBe(false);
    expect(can('finance', 'orders:status')).toBe(true);
    expect(can('finance', 'orders:export')).toBe(true);
  });
  it('operador não mexe em Configurações, Equipe nem Marcas', () => {
    expect(can('operator', 'settings:write')).toBe(false);
    expect(can('operator', 'team:write')).toBe(false);
    expect(can('operator', 'brands:write')).toBe(false);
    expect(can('operator', 'lives:write')).toBe(true);
    expect(can('operator', 'products:write')).toBe(true);
    expect(can('operator', 'orders:status')).toBe(false);
  });
  it('dona pode tudo', () => {
    for (const p of ['lives:write', 'products:write', 'settings:write', 'team:write', 'brands:write', 'orders:status'] as const) {
      expect(can('owner', p)).toBe(true);
    }
  });
});
