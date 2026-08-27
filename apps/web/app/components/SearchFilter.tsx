'use client'

interface SearchFilterProps {
  search: string
  onSearchChange: (v: string) => void
  placeholder?: string
  filters?: { label: string; value: string; active: boolean }[]
  onFilterToggle?: (value: string) => void
}

export default function SearchFilter({
  search,
  onSearchChange,
  placeholder = 'Search…',
  filters,
  onFilterToggle,
}: SearchFilterProps) {
  return (
    <div>
      <div className="search-bar">
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M12 12l-2.5-2.5" />
        </svg>
        <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={placeholder} />
      </div>
      {filters && filters.length > 0 && (
        <div className="filter-bar">
          {filters.map((f) => (
            <button
              key={f.value}
              className={`chip ${f.active ? 'active' : ''}`}
              onClick={() => onFilterToggle?.(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
