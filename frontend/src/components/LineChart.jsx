import { useId } from 'react';

export default function LineChart({ color = '#2f5bd3', compact = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={`chart ${compact ? 'compact' : ''}`}>
      <svg viewBox="0 0 600 170" preserveAspectRatio="none">
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor={color} stopOpacity=".18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d="M0 150 L52 137 L105 128 L158 108 L210 97 L263 103 L315 77 L368 59 L420 49 L473 37 L525 21 L600 3 L600 170 L0 170Z" fill={`url(#${id})`} />
        <path d="M0 150 L52 137 L105 128 L158 108 L210 97 L263 103 L315 77 L368 59 L420 49 L473 37 L525 21 L600 3" fill="none" stroke={color} strokeWidth="3" />
      </svg>
      <div className="months">{['Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan','Fev'].map(m => <span key={m}>{m}</span>)}</div>
    </div>
  );
}
