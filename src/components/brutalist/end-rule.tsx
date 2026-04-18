type Props = {
  count: number;
  total: number;
};

export function BrutalistEndRule({ count, total }: Props) {
  return (
    <footer className="bru-endrule">
      <span>
        END · {count} / {total}
      </span>
      <span>NICO / WRITING</span>
      <span>
        <a href="#top">↑ TOP</a>
      </span>
    </footer>
  );
}
