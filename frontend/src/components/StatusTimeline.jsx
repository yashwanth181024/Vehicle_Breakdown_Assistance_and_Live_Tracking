/**
 * The journey of a booking, drawn as a road with a stop for every step.
 *   timeline: [{ status, remark, at }]   what has happened so far, oldest first (from the server)
 *   status:   the booking's current status
 * Steps that have not happened yet are shown faded, unless the booking ended in Rejected or Cancelled.
 */
const LABELS = {
  Pending: 'Request received',
  Approved: 'Request approved',
  Assigned: 'Driver assigned',
  'On The Way': 'Driver is on the way',
  Completed: 'Job completed',
  Rejected: 'Request rejected',
  Cancelled: 'Booking cancelled',
};
const UPCOMING = ['Assigned', 'On The Way', 'Completed'];
const ENDED_BADLY = ['Rejected', 'Cancelled'];

export function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${time}, ${day}`;
}

export default function StatusTimeline({ timeline = [], status }) {
  const steps = timeline.map((t, i) => ({
    key: `${t.status}-${i}`,
    title: LABELS[t.status] || t.status,
    note: t.remark,
    time: formatTime(t.at),
    state: i === timeline.length - 1 ? 'current' : 'done',
  }));

  // Show what is still to come while the job is live
  if (steps.length && !ENDED_BADLY.includes(status) && status !== 'Completed') {
    const reached = new Set(timeline.map((t) => t.status));
    UPCOMING.filter((s) => !reached.has(s)).forEach((s) =>
      steps.push({ key: `next-${s}`, title: LABELS[s], note: '', time: '', state: 'todo' })
    );
  }
  if (status === 'Completed' && steps.length) steps[steps.length - 1].state = 'done';

  if (!steps.length) {
    return <p className="muted">No updates yet. This page refreshes by itself when something changes.</p>;
  }

  return (
    <ol className="timeline" aria-label="Booking progress">
      {steps.map((s) => (
        <li key={s.key} className={s.state === 'todo' ? '' : s.state} aria-current={s.state === 'current' ? 'step' : undefined} style={s.state === 'todo' ? { opacity: 0.55 } : undefined}>
          <span className="timeline-dot" aria-hidden="true" />
          <div className="timeline-title">{s.title}</div>
          {s.note && s.note !== s.title && <div className="small muted">{s.note}</div>}
          {s.time && <div className="timeline-time">{s.time}</div>}
        </li>
      ))}
    </ol>
  );
}
