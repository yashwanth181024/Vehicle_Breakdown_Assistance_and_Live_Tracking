import { useState } from 'react';
import useSpeech, { LANGUAGES } from '../hooks/useSpeech';
import { parseBookingSpeech } from '../utils/voiceParser';

/**
 * "Speak your problem" panel for the booking form. Press the microphone, say something like
 * "My name is Ravi, flat tyre on my car near Silk Board", and the form fills itself in.
 *   onResult(fields): receives only the fields that were understood, for the page to merge into its form
 */
export default function VoiceAssistant({ onResult }) {
  const speech = useSpeech();
  const [lang, setLang] = useState('en-IN');
  const [heard, setHeard] = useState('');
  const [filled, setFilled] = useState([]);

  const labels = { name: 'name', phone: 'phone', serviceType: 'service', vehicleType: 'vehicle', pickupLocation: 'location' };

  const handleFinal = (text) => {
    const fields = parseBookingSpeech(text);
    setHeard(text);
    setFilled(Object.keys(labels).filter((k) => fields[k]).map((k) => labels[k]));
    onResult(fields);
  };

  const toggle = () => {
    if (speech.listening) speech.stop();
    else {
      setHeard('');
      setFilled([]);
      speech.start(lang, handleFinal);
    }
  };

  if (!speech.supported) {
    return (
      <div className="voice-panel">
        <p className="small muted" style={{ margin: 0 }}>
          Voice input works in Chrome and Edge. You can type the details below instead.
        </p>
      </div>
    );
  }

  return (
    <div className="voice-panel" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <button
        type="button"
        className={`mic-btn${speech.listening ? ' listening' : ''}`}
        onClick={toggle}
        aria-pressed={speech.listening}
        aria-label={speech.listening ? 'Stop listening' : 'Speak your problem'}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <strong>{speech.listening ? 'Listening…' : 'Speak your problem'}</strong>
          <select aria-label="Language to speak in" value={lang} onChange={(e) => setLang(e.target.value)} disabled={speech.listening} style={{ width: 'auto' }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        {speech.listening && (speech.interim || speech.transcript) && (
          <p className="voice-result" aria-live="polite">{speech.transcript} {speech.interim}</p>
        )}
        {!speech.listening && heard && (
          <p className="voice-result">
            “{heard}”
            <span className="small muted" style={{ display: 'block' }}>
              {filled.length ? `Filled in: ${filled.join(', ')}. Please check the form.` : 'I could not pick out any details. Please try again or type them.'}
            </span>
          </p>
        )}
        {!speech.listening && !heard && !speech.error && (
          <p className="small muted" style={{ margin: '4px 0 0' }}>Tap the microphone and say your name, problem, vehicle and where you are.</p>
        )}
        {speech.error && <p className="small" role="alert" style={{ margin: '4px 0 0', color: 'var(--danger)' }}>{speech.error}</p>}
      </div>
    </div>
  );
}
