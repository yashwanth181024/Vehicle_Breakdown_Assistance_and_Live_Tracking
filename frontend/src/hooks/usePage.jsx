import { useEffect, useState } from 'react';
import api from '../api/axios';

/** Text for the About and Contact pages, which an admin can edit. Falls back to built-in text when the server has none. */
export default function usePage(type, fallback) {
  const [page, setPage] = useState(fallback);
  useEffect(() => {
    let alive = true;
    api
      .get(`/admin/pages/${type}`)
      .then((res) => {
        const d = res.data.data;
        if (alive && d && (d.content || d.body)) setPage({ title: d.title || fallback.title, content: d.content || d.body });
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  return page;
}

/** Plain text split into paragraphs. Never inserted as HTML, so admin-entered text cannot inject anything. */
export function Paragraphs({ text }) {
  return String(text || '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{p}</p>);
}
