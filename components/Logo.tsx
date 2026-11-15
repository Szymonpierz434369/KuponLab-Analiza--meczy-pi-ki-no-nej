/** Znak Kursora: litera K, której ramiona wychodzą z piłki. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <rect className="logo-tile" width="256" height="256" rx="64" />
      <g className="logo-k" transform="translate(29 32) scale(0.75)">
        <path d="M40 28 H88 V228 H40 Z M173.6 113.9 L238.9 28.0 L181.1 28.0 L137.0 86.1 A42 42 0 0 1 173.6 113.9 Z M137.0 169.9 L181.1 228.0 L238.9 228.0 L173.6 142.1 A42 42 0 0 1 137.0 169.9 Z" />
        <circle className="logo-ball" cx="134" cy="128" r="28" />
      </g>
    </svg>
  );
}
