// Ícones em traço copiados dos protótipos.
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconPlay = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}><path d="M7 4l13 8-13 8z" /></svg>
);
export const IconArrow = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconMail = ({ size = 24, className }: P) => (
  <svg {...base(size)} strokeWidth={1.8} className={className}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 8l9 6 9-6" /></svg>
);
export const IconCheck = ({ size = 30, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconClose = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const IconSearch = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const IconGrid = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
);
export const IconBroadcast = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" /></svg>
);
export const IconBox = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
);
export const IconClipboard = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4" /></svg>
);
export const IconBuilding = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" /></svg>
);
export const IconTag = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);
export const IconGear = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
);
export const IconLogout = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>
);
