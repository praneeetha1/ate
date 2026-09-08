import { NavLink } from 'react-router-dom'
import Icon from './Icon'

const TABS = [
  { to: '/',        icon: 'home',   label: 'Home'    },
  { to: '/search',  icon: 'search', label: 'Search'  },
  { to: '/saved',   icon: 'heart',  label: 'Saved'   },
  { to: '/friends', icon: 'users',  label: 'Friends' },
  { to: '/profile', icon: 'user',   label: 'Profile' },
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
              isActive ? 'text-ink' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {/* The active tab's icon sits in an outlined coral badge — the
                  same ink-outline rule as every other tappable thing. */}
              <span
                className={`w-7 h-7 grid place-items-center rounded-full transition-all ${
                  isActive ? 'border-2 border-ink bg-accent shadow-pop -translate-y-[1px]' : ''
                }`}
              >
                <Icon name={icon} size={17} filled={isActive && icon === 'heart'} />
              </span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
