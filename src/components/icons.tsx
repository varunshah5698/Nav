import type { ReactNode } from "react";

/** Shared 18px stroke icons for the shell chrome (nav, search, header actions). */
const ic = (children: ReactNode) => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    {children}
  </svg>
);

export const navIcons: Record<string, ReactNode> = {
  dashboard: ic(<><rect x="2.6" y="2.6" width="5.4" height="5.4" rx="1.7" /><rect x="10" y="2.6" width="5.4" height="5.4" rx="1.7" /><rect x="2.6" y="10" width="5.4" height="5.4" rx="1.7" /><rect x="10" y="10" width="5.4" height="5.4" rx="1.7" /></>),
  canvas: ic(<><circle cx="4.6" cy="12.7" r="2.1" /><circle cx="9" cy="4.6" r="2.1" /><circle cx="13.8" cy="12.7" r="2.1" /><path d="M6.5 11.3 7.9 6.5M10.6 6l2.4 4.7M6.7 12.7h5" /></>),
  analyst: ic(<><path d="M8.4 2.8 9.8 6.6l3.8 1.4-3.8 1.4-1.4 3.8-1.4-3.8L3.2 8l3.8-1.4Z" /><path d="m13.9 11.4.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" /></>),
  sources: ic(<><path d="M4.6 3.2h6.1l3 3v8.5a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1Z" /><path d="M10.4 3.4V6.5h3" /><path d="M6.2 9.5h5M6.2 12h3.4" /></>),
  agents: ic(<><path d="M9 2.5 14.7 5.7v6.6L9 15.5 3.3 12.3V5.7Z" /><circle cx="9" cy="9" r="2" /><path d="M9 2.5v2.4M9 13.1v2.4M3.6 6.2 5.7 7.4M12.3 10.6l2.1 1.2" /></>),
  experiments: ic(<><path d="M7.3 2.6h3.4M8.2 2.6v4.3L5 12.6a1.7 1.7 0 0 0 1.4 2.6h5.2a1.7 1.7 0 0 0 1.4-2.6L9.8 6.9V2.6" /><path d="M6.4 11.2h5.2" /></>),
  memory: ic(<><path d="M9 2.8 15.2 6 9 9.2 2.8 6Z" /><path d="m3.4 9.2 5.6 2.9 5.6-2.9M3.4 12.3l5.6 2.9 5.6-2.9" /></>),
  discovery: ic(<><circle cx="7.9" cy="7.9" r="4.9" /><path d="m11.6 11.6 3.5 3.5" /><path d="m6.1 8.1 1.8-1.8 1.8 1.8" /></>),
  share: ic(<><path d="M9 11.4V2.9M6.3 5.6 9 2.9l2.7 2.7" /><path d="M3.4 11v3.1a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V11" /></>),
  search: ic(<><circle cx="8" cy="8" r="4.7" /><path d="m11.5 11.5 3.4 3.4" /></>),
  menu: ic(<><path d="M3.2 5.4h11.6M3.2 9h11.6M3.2 12.6h11.6" /></>),
  bell: ic(<><path d="M5.5 7.6a3.5 3.5 0 0 1 7 0c0 3 1.2 4.2 1.2 4.2H4.3s1.2-1.2 1.2-4.2Z" /><path d="M7.9 14.2a1.35 1.35 0 0 0 2.2 0" /></>),
};
