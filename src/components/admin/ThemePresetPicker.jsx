/**
 * The ready-made looks as cards, each drawn in its own colours with its fonts, so a merchant picks by eye. The fonts
 * are named rather than loaded: twelve families would be a heavy page for a picker.
 */
export default function ThemePresetPicker({ presets = [], value, changed = false, onChange, disabled = false }) {
  if (!presets.length) return null
  return (
    <div>
      {value && changed && (
        <p className="mb-2 text-[12px] text-faint">Changed in Odoo since this look was picked. Picking it again goes back to it.</p>
      )}
      <div role="radiogroup" aria-label="Ready-made looks" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {presets.map((preset) => {
          const c = preset.colors
          const on = preset.id === value
          const radius = Math.min(preset.radius ?? 2, 12)
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-preset={preset.id}
              disabled={disabled}
              title={preset.description}
              onClick={() => onChange(preset.id)}
              className={`overflow-hidden rounded-xs border text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                on ? 'border-ink shadow-[0_0_0_2px_rgb(var(--ink))]' : 'border-line hover:border-ink'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="block p-3" style={{ background: c.page, color: c.ink }}>
                <span className="flex items-center justify-between">
                  <span className="text-[18px] leading-none" style={{ fontFamily: `"${preset.fonts.heading}", serif` }}>Aa</span>
                  <span className="flex gap-1" aria-hidden="true">
                    {['surface', 'muted', 'accent', 'sale'].map((token) => (
                      <span key={token} className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: c[token] }} />
                    ))}
                  </span>
                </span>
                <span className="mt-2 block h-1.5 w-3/4 rounded-full opacity-60" style={{ background: c.muted }} />
                <span className="mt-2 inline-block px-2 py-1 text-[11px]" style={{ background: c.accent, color: c.accentInk, borderRadius: radius }}>
                  Add to bag
                </span>
              </span>
              <span className="block border-t border-line bg-surface px-3 py-2">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  {preset.name}
                  {on && <span className="rounded-full bg-ink px-1.5 text-[10px] text-page">In use</span>}
                </span>
                <span className="block text-[11px] text-faint">
                  {preset.industries}
                  {preset.dark ? ' · dark, needs a light logo' : ''}
                </span>
                <span className="block text-[11px] text-faint">{preset.fonts.heading} / {preset.fonts.body}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
