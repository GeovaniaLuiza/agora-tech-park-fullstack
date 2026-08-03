export default function StatCard({ label, value, icon, change, tone = 'blue' }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      {change && <span className="stat-change">↗ {change}</span>}
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}
