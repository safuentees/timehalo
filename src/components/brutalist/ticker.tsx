import { TICKER_ITEMS } from "@/lib/brutalist";

export function BrutalistTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="bru-ticker">
      <div className="bru-ticker-track">
        {items.map((t, i) => (
          <span key={i} className="bru-ticker-item">
            <span>{t}</span>
            <span className="bru-ticker-sep">+</span>
          </span>
        ))}
      </div>
    </div>
  );
}
