/** Stylized bat silhouette (2:1 aspect ratio), filled with currentColor. */
export function BatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 50" fill="currentColor" aria-hidden="true">
      <path d="M2 14Q20 6 38 12L41 3L45 11H55L59 3L62 12Q80 6 98 14Q86 18 84 28Q76 22 68 30Q58 32 50 46Q42 32 32 30Q24 22 16 28Q14 18 2 14Z" />
    </svg>
  );
}
