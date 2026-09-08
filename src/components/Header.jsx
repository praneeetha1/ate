import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="bg-paper border-b-2.5 border-ink px-5 py-[14px] text-center sticky top-0 z-[100]">
      <Link to="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
        <h1 className="font-display text-[2rem] font-bold text-ink leading-none tracking-tight">
          ate<span className="text-accent">.</span>
        </h1>
        <p className="text-[0.68rem] font-extrabold text-muted tracking-[0.14em] uppercase mt-[5px]">
          Your cozy recipe companion
        </p>
      </Link>
    </header>
  )
}
