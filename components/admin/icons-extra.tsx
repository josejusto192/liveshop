type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconBack = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const IconCheckSmall = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconGrip = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
);
export const IconArrowUpRight = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M7 17L17 7M8 7h9v9" /></svg>
);
export const IconBell = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const IconCalendar = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
);
export const IconPhone = ({ size = 34 }: P) => (
  <svg {...base(size)} strokeWidth={1.4}><rect x="7" y="2" width="10" height="20" rx="3" /><path d="M11 18h2" /></svg>
);
export const IconCamera = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
);
export const IconCameraOff = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10M1 1l22 22" /></svg>
);
export const IconMic = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" /></svg>
);
export const IconMicOff = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3M8 22h8" /></svg>
);
export const IconFlip = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M20 7h-3.5L15 5H9L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M9 13.5a3 3 0 0 1 5-2.2M15 12.5a3 3 0 0 1-5 2.2M14 10v1.5h1.5M10 16v-1.5H8.5" /></svg>
);
export const IconUsers = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const IconQr = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4M20 17v3" /></svg>
);
export const IconSignal = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" /></svg>
);
export const IconDownload = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
export const IconChevronDown = ({ size = 12 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconWhatsapp = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /></svg>
);
export const IconMailBox = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={1.8}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 8l9 6 9-6" /></svg>
);
export const IconPaperclip = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>
);
