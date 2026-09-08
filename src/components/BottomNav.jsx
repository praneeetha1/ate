import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/',        icon: '🏠', label: 'Home'    },
  { to: '/search',  icon: '🔍', label: 'Search'  },
  { to: '/saved',   icon: '♥',  label: 'Saved'   },
  { to: '/friends', icon: '👥', label: 'Friends' },
  { to: '/profile', icon: '👤', label: 'Profile' },
]

export default function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 bg-paper border-t-[1.5px] border-rim flex z-[300] shadow-[0_-2px_12px_rgba(100,70,30,0.12)] pb-safe"
      style={{ height: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))' }}
    >
      {TABS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-[3px] text-[0.6rem] font-bold uppercase tracking-[0.08em] transition-colors pb-2 pt-1.5 no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
              isActive ? 'text-accent' : 'text-muted'
            }`
          }
        >
          <span className="text-[1.35rem] leading-none" aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
