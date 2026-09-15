/**
 * The icon set, inlined.
 *
 * Twenty-odd 24px strokes weigh less than the request it would take to fetch an
 * icon library, and they inherit `currentColor` so they follow the token system
 * for free. Anything not on this list is not used by the theme.
 */
const PATHS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 1 1-8 0',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  close: 'M18 6 6 18M6 6l12 12',
  menu: 'M3 12h18M3 6h18M3 18h18',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  check: 'm20 6-11 11-5-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2Z',
  truck: 'M14 17V5a1 1 0 0 0-1-1H2v13h12ZM14 8h4l4 4v5h-8M7.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  refresh: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  building: 'M3 21h18M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M8 7h4M8 11h4M8 15h4',
  lock: 'M5 11h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM8 11V7a4 4 0 0 1 8 0v4',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5L22 3Z',
  package: 'm7.5 4.3 9 5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7 12 12l8.7-5M12 22V12',
  'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'log-out': 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  github:
    'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 5.1a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C7 1.2 5.9 1.5 5.9 1.5A4.9 4.9 0 0 0 5.8 5a5.2 5.2 0 0 0-1.4 3.7c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22',
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5ZM16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4ZM17.5 6.5h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  droplet: 'M12 2.7 6.7 8a7.5 7.5 0 1 0 10.6 0L12 2.7Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  wind: 'M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8a7 7 0 0 1-10 10ZM2 21c0-3 1.9-5.7 4.5-7.5C9 11.7 11 11 13 10',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.2 13.9 7 22l5-3 5 3-1.2-8.1',
  ruler: 'M16 2 22 8 8 22 2 16 16 2ZM7.5 10.5l2 2M11 7l2 2M4 14l2 2',
  recycle: 'M7 19H4.8a2 2 0 0 1-1.7-3l1.6-2.7M6.4 9 4.7 6.3a2 2 0 0 1 1.7-3H9M14.5 3.3 16.2 6M17 5h2.2a2 2 0 0 1 1.7 3l-1.6 2.7M19.3 15l1.7 2.7a2 2 0 0 1-1.7 3H17M9.5 20.7 7.8 18M10 22h4',
  thermometer: 'M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z',
}

/** Whether the set has an icon by this name: names in content from the backend fall back to one it has. */
export const hasIcon = (name) => typeof name === 'string' && Object.hasOwn(PATHS, name)

export default function Icon({ name, size = 20, className = '', filled = false, strokeWidth = 1.5, ...rest }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}
