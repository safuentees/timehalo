
interface Props {
  visible: boolean;
  label?: string;
}

export function OhTopProgressBar({
  visible,
  label = "Switching workspace",
}: Props) {
  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className="oh-progress-bar"
    />
  );
}
