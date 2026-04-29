import type { ReactNode } from "react";

type Props = {
  title: string;
  kicker?: string;
  aside?: ReactNode;
};

export function BrutalistPageHeader({ kicker, title, aside }: Props) {
  return (
    <div className="border-b-2 border-bru-line-strong pb-6">
      {kicker ? (
        <p className="bru-legend">
          {kicker}
        </p>
      ) : null}
      <div className="flex items-baseline justify-between gap-4">
        <h1
          className={`${
            kicker ? "mt-3" : ""
          } text-bru-h2 font-black uppercase tracking-tight`}
        >
          {title}
        </h1>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </div>
  );
}
