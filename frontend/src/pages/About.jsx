import usePage, { Paragraphs } from '../hooks/usePage';
import { useTranslation } from 'react-i18next';

const FALLBACK = {
  title: 'About us',
  content:
    'Vehicle Breakdown Assistant connects people stuck on the road with trained recovery drivers nearby. Tell us what went wrong and where you are, and the closest available driver is asked to come to you.\n\nYou do not need an account. Book in a minute, follow your driver on the map and chat with them until they arrive.\n\nOur drivers are verified, and every job is recorded so you can always check what happened and when.',
};

export default function About() {
  const { t } = useTranslation();

  const FALLBACK = {
    title: t('About us'),
    content: t('Vehicle Breakdown Assistant connects people stuck on the road with trained recovery drivers nearby. Tell us what went wrong and where you are, and the closest available driver is asked to come to you.\n\nYou do not need an account. Book in a minute, follow your driver on the map and chat with them until they arrive.\n\nOur drivers are verified, and every job is recorded so you can always check what happened and when.')
  };

  const page = usePage('about', FALLBACK);
  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>{page.title}</h1></div>
      <div className="card">
        <Paragraphs text={page.content} />
      </div>
      <div className="grid-3" style={{ marginTop: 20 }}>
        <div className="card"><h3>{t('Nearest driver first')}</h3><p className="muted">{t('Requests go to the closest online driver. If they cannot take it, the next one is asked.')}</p></div>
        <div className="card"><h3>{t('See it happen')}</h3><p className="muted">{t('Live map, arrival time and a private chat with your driver.')}</p></div>
        <div className="card"><h3>{t('No sign-up')}</h3><p className="muted">{t('Your booking number and phone number are all you need to come back.')}</p></div>
      </div>
    </div>
  );
}
