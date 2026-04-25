import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
  alt?: string;
};

export function HalftoneMark({ size = 28, className, alt = "Officehours" }: Props) {
  return (
    <Image
      src="/halftone-mark.svg"
      width={size}
      height={size}
      alt={alt}
      className={className}
      priority
    />
  );
}
