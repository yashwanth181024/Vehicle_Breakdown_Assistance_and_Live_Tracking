import { Link } from 'react-router-dom';
import usePage, { Paragraphs } from '../hooks/usePage';
import { useTranslation } from 'react-i18next';

export default function Contact() {
  const { t } = useTranslation();
  
  const FALLBACK = {
    title: t('Contact us'),
    content: `${t('In an emergency, request help from the Get help page. It is the fastest way to reach a driver.')}\n\n${t('For questions about a past booking, keep your booking number and phone number ready.')}`,
  };

  const page = usePage('contact', FALLBACK);
  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>{page.title}</h1></div>
      <div className="card">
        <Paragraphs text={page.content} />
      </div>
      <div className="row" style={{ marginTop: 20, gap: 12, flexWrap: 'wrap' }}>
        <Link to="/book" className="btn btn-signal">{t('Get help now')}</Link>
        <Link to="/track" className="btn btn-outline">{t('Track a booking')}</Link>
      </div>
      <p className="small muted" style={{ marginTop: 16 }} dangerouslySetInnerHTML={{ __html: t('If anyone is injured or in danger, call the national emergency number <strong>112</strong> first.') }} />
    </div>
  );
}
