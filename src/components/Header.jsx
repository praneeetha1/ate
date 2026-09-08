import { Link } from 'react-router-dom'

export default function Header() {
  // py keeps the header at --header-h (72px) now that the tagline is gone —
  // the sticky filter bars in Home/Search offset by that exact value.
  return (
    <header className="bg-paper border-b-2.5 border-ink px-5 py-[19px] text-center sticky top-0 z-[100]">
      <Link to="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
        <h1 className="font-display text-[2rem] font-bold text-ink leading-none tracking-tight">
          ate<span className="text-accent">.</span>
        </h1>
      </Link>
    </header>
  )
}
