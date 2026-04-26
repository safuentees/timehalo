
type Props = {
  title: string;
  kicker?: string;
};

export function BrutalistPageHeader({ kicker, title }: Props) {
  return (
    <div className="border-b-2 border-bru-line-strong pb-6">
      {kicker ? (
        <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
          {kicker}
        </p>
      ) : null}
      <h1 className={`${kicker ? "mt-3" : ""} text-bru-h2 font-black uppercase tracking-tight`}>
        {title}
      </h1>
    </div>
  );
}
