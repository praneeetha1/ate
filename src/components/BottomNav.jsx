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
      className="fixed bottom-0 left-0 right-0 bg-card border-t-[2.5px] border-ink flex z-[300] pb-safe"
      style={{ height: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))' }}
    >
      {TABS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-[3px] font-display text-[0.6rem] font-semibold uppercase tracking-[0.07em] transition-colors pb-2 pt-1.5 no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
              isActive ? 'text-accent-dk' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {/* The active tab's icon sits in an outlined coral badge — the
                  same ink-outline rule as every other tappable thing. */}
              <span
                aria-hidden="true"
                className={`text-[1.1rem] leading-none w-7 h-7 grid place-items-center rounded-full transition-all ${
                  isActive ? 'border-2 border-ink bg-accent shadow-pop -translate-y-[1px]' : ''
                }`}
              >{icon}</span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
