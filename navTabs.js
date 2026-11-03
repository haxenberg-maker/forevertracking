// Meniul de jos: sursă unică pentru Footer și pentru Setări (Profil → „Pagini vizibile în meniu").
// `key` = cheia din localStorage('nav_prefs'); implicit toate paginile sunt vizibile (se salvează doar ce dezactivezi).
// Acasă și Profil sunt mereu în meniu: fără Profil nu ai mai ajunge la Setări ca să le repornești.
export const NAV_ITEMS = [
  { key: null,           path: '/',            label: 'Acasă',    icon: '🏠', locked: true },
  { key: 'showNutritie', path: '/nutritie',    label: 'Nutriție', icon: '🥗', desc: 'Jurnal alimentar, alimente, mese' },
  { key: 'showSport',    path: '/sport',       label: 'Plan',     icon: '📋', desc: 'Plan, calendar, alergare, forță, statistici' },
  { key: 'showRpg',      path: '/fitness-rpg', label: 'RPG',      icon: '⚡', settingsLabel: 'Fitness RPG', desc: 'Nivel, XP, atribute, quest-uri' },
  { key: 'showCamara',   path: '/camara',      label: 'Cămară',   icon: '🧺', desc: 'Stoc alimente acasă' },
  { key: 'showBuget',    path: '/buget',       label: 'Buget',    icon: '💰', desc: 'Urmărire venituri & cheltuieli' },
  { key: null,           path: '/profil',      label: 'Profil',   icon: '👤', locked: true },
]

export function getNavPrefs() {
  try { return JSON.parse(localStorage.getItem('nav_prefs') || '{}') } catch { return {} }
}

export const isNavItemVisible = (item, prefs) => item.locked || prefs[item.key] !== false
