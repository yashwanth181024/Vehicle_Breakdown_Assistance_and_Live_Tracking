import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { getErrorMessage } from '../../api/axios';
import { dayLabel, listOf, num, seriesOf } from '../../utils/adapt';

const BLUE = '#0b4f9e';
const AMBER = '#d99a00';

function Panel({ title, note, children, empty }) {
  return (
    <section className="card" aria-label={title}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {note && <p className="small muted" style={{ marginTop: -6 }}>{note}</p>}
      {empty ? <p className="muted">Not enough data yet.</p> : <div style={{ width: '100%', height: 260 }}>{children}</div>}
    </section>
  );
}

function BarPanel({ title, data, color = BLUE, note }) {
  return (
    <Panel title={title} note={note} empty={data.length === 0}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" interval={0} tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: 'rgba(127,127,127,.12)' }} />
          <Bar dataKey="value" name="Requests" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.get('/analytics/overview', { params: { days } }),
      api.get('/analytics/drivers', { params: { days } }).catch(() => ({ data: { data: [] } })),
    ])
      .then(([o, d]) => {
        if (!alive) return;
        setOverview(o.data.data || {});
        setDrivers(listOf(d.data.data, 'drivers'));
        setError('');
      })
      .catch((err) => alive && setError(getErrorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [days]);

  const o = overview || {};
  const daily = seriesOf(o.daily || o.perDay || o.byDay || o.trend || o.requestsPerDay).map((p) => ({ ...p, name: dayLabel(p.name) }));
  const byService = seriesOf(o.byService || o.services || o.serviceTypes);
  const byStatus = seriesOf(o.byStatus || o.statuses || o.statusCounts);
  const byVehicle = seriesOf(o.byVehicle || o.vehicleTypes);

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Analytics</h1><p className="muted">Where requests come from and how fast they are handled.</p></div>
        <div className="chips" role="group" aria-label="Period">
          {[7, 30, 90].map((d) => <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : (
        <div className="stack" style={{ gap: 18 }}>
          <Panel title="Requests per day" empty={daily.length === 0}>
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" name="Requests" stroke={BLUE} strokeWidth={3} dot={daily.length < 15} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid-2">
            <BarPanel title="By service" data={byService} />
            <BarPanel title="By status" data={byStatus} color={AMBER} />
            {byVehicle.length > 0 && <BarPanel title="By vehicle" data={byVehicle} color={AMBER} />}
          </div>

          <section className="card" aria-label="Drivers">
            <h2 style={{ marginTop: 0 }}>Drivers</h2>
            {drivers.length === 0 ? <p className="muted">No driver activity in this period.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Driver</th><th>Jobs done</th><th>Average rating</th><th>Average response</th></tr></thead>
                  <tbody>
                    {drivers.map((d, i) => {
                      const rating = d.averageRating ?? d.avgRating ?? d.rating;
                      const resp = d.avgResponseSeconds ?? d.avgResponse ?? d.averageResponseSeconds;
                      return (
                        <tr key={d._id || d.id || i}>
                          <td>{d.name || d.driverName || d._id}</td>
                          <td>{num(d.completed ?? d.jobs ?? d.count ?? d.completedJobs)}</td>
                          <td>{rating != null && Number.isFinite(Number(rating)) ? `${Number(rating).toFixed(1)} ★` : '—'}</td>
                          <td>{resp != null && Number.isFinite(Number(resp)) ? `${Math.round(Number(resp))} s` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
