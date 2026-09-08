import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="bg-paper border-b-2 border-rim px-5 py-[18px] text-center sticky top-0 z-[100] shadow-warm">
      <Link to="/" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
        <h1 className="font-display text-[2rem] font-semibold text-accent-dk leading-none tracking-wide">
          ate<span className="italic font-normal text-accent">.</span>
        </h1>
        <p className="text-[0.75rem] text-muted tracking-[0.12em] uppercase mt-[3px]">
          Your cozy recipe companion
        </p>
      </Link>
    </header>
  )
}
