// Inline SVG icon set (Lucide-style stroke icons). No emoji, no icon fonts.

const PATHS = {
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h5a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h5"/>',
  car: '<path d="M3 13.2 4.8 8a2 2 0 0 1 1.9-1.4h10.6A2 2 0 0 1 19.2 8L21 13.2V18a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-1H6.6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3.4 13.2h17.2"/><circle cx="7.3" cy="15.4" r="1.1"/><circle cx="16.7" cy="15.4" r="1.1"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="m15.2 17.5-3.2-9.4-3 9.4M12 8.1h3.4l1.6 3.2M9.4 8.1H6.2"/>',
  auto: '<path d="M4 17V11a3 3 0 0 1 3-3h4l4 4h2a2 2 0 0 1 2 2v3"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/><path d="M8.5 18h7"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  navigation: '<path d="m3 11 18-8-8 18-2-8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.4A5.6 5.6 0 0 1 21.5 20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.3 2"/>',
  shield: '<path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
  leaf: '<path d="M20 4c0 9-5.5 14-12 14a6 6 0 0 1 0-12c4.5 0 6.5-2 12-2z"/><path d="M4 20c3-4.5 6.5-7.5 11-9.5"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1"/><path d="M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6H6a3 3 0 0 1-3-3.5z"/><circle cx="16.5" cy="14" r="1.1"/>',
  ticket: '<path d="M4 8V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V8a2.5 2.5 0 0 0 0 8v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V16a2.5 2.5 0 0 0 0-8z"/><path d="M12 8v1.5M12 14.5V16"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5V14h5v6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.8 4.4 4.4L19 7.6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowRight: '<path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
  star: '<path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.1"/>',
  phone: '<path d="M6 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.7 2 2 0 0 1 6 3.5z"/>',
  sparkles: '<path d="m12 3 1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5 19.4 18l2.6.9-2.6 1-1 2.6-.9-2.6-2.5-1 2.5-.9z"/>',
  gauge: '<path d="M4.5 17a9 9 0 1 1 15 0"/><path d="m12 13 3.5-3.5"/><circle cx="12" cy="14" r="1.4"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.7-5.1L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5.1L20 16"/><path d="M20 20v-4h-4"/>',
  crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play: '<path d="M8 5.6a.6.6 0 0 1 .93-.5l8.4 5.9a.7.7 0 0 1 0 1.15l-8.4 5.9A.6.6 0 0 1 8 17.5z"/>',
  pause: '<path d="M9.5 5.5v13M14.5 5.5v13"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  bellOff: '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M18.7 13A6 6 0 0 0 18 8M6 8a6 6 0 0 0 .3 1.9M2 2l20 20M3 17h14"/>',
  checkCheck: '<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  creditCard: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  package: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
};

export function icon(name, size = 20, extraClass = '') {
  const path = PATHS[name] || PATHS.alert;
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

export const vehicleIconName = (type) =>
  type === 'bike' ? 'bike' : type === 'auto' ? 'auto' : 'car';
