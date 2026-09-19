const paths = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  commercial: 'M8 6V4h8v2M3 7h18v14H3ZM3 12l9 3 9-3M12 13v4',
  works: 'M3 21V7l6-3 6 3 6-3v14l-6 3-6-3ZM9 4v14M15 7v14',
  resources: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  admin: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM8 12l3 3 5-6',
  inbox: 'M3 14 6 4h12l3 10v6H3ZM3 14h5l2 3h4l2-3h5',
  estimate: 'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  helmet: 'M4 16v-3a8 8 0 0 1 16 0v3M9 5v6M15 5v6M2 16h20v4H2Z',
  catalog: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
  users: 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-3a5 5 0 0 1 5-5h4M17 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6M17 18v4M17 21h3',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l4 2',
} as const;

export type NavigationIconName = keyof typeof paths;

export function NavigationIcon({ name }: { name?: NavigationIconName }) {
  if (!name) return null;
  return <svg className="navigation-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
