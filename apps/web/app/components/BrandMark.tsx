export default function BrandMark({ size = 28 }: { size?: number }) {
  const s = Math.round(size * 0.72)
  return (
    <div className="brand-mark" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" fill="none" width={s} height={s}>
        <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="7" />
        <path
          d="M47.42 13.61 A 24 24 0 1 0 47.42 50.39"
          stroke="var(--brand-c)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
