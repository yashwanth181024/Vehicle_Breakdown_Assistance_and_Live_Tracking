import { useCallback, useEffect, useRef, useState } from 'react';

/** Languages the voice assistant offers. `code` is a standard language tag. */
export const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
];

const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

const ERROR_TEXT = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone in your browser settings and try again.',
  'service-not-allowed': 'Voice input is not allowed on this browser.',
  'no-speech': 'I did not hear anything. Tap the microphone and speak again.',
  'audio-capture': 'No microphone was found on this device.',
  network: 'Voice input needs an internet connection.',
  'language-not-supported': 'This browser cannot listen in that language. Choose another language or type instead.',
};

/**
 * Speech to text and text to speech, using the browser's own voice features (free, no API key).
 * Voice input works in Chrome and Edge, and only on https:// or localhost.
 *
 *   const speech = useSpeech();
 *   speech.start('hi-IN', (finalText) => fillForm(finalText));
 *   speech.speak('Your driver is on the way', 'en-IN');
 */
export default function useSpeech() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  const supported = Boolean(SpeechRecognition);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stop = useCallback(() => {
    if (recognitionRef.current) recognitionRef.current.stop();
  }, []);

  /** Starts listening. `onFinal` receives the full sentence once the person stops talking. */
  const start = useCallback(
    (lang = 'en-IN', onFinal) => {
      if (!SpeechRecognition) {
        setError('Voice input is not supported in this browser. Please use Chrome or Edge, or type instead.');
        return;
      }
      if (recognitionRef.current) recognitionRef.current.abort();

      const rec = new SpeechRecognition();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      let finalText = '';
      setError('');
      setTranscript('');
      setInterim('');

      rec.onstart = () => setListening(true);
      rec.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        setTranscript(finalText.trim());
        setInterim(interimText);
      };
      rec.onerror = (event) => {
        if (event.error !== 'aborted') setError(ERROR_TEXT[event.error] || 'Voice input stopped working. Please try again.');
      };
      rec.onend = () => {
        setListening(false);
        setInterim('');
        recognitionRef.current = null;
        const text = finalText.trim();
        if (text && onFinal) onFinal(text);
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch {
        setError('Could not start the microphone. Please try again.');
      }
    },
    []
  );

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError('');
  }, []);

  const cancelSpeech = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  /** Reads text aloud. Picks a voice for the language when the device has one. */
  const speak = useCallback(
    (text, lang = 'en-IN') => {
      if (!ttsSupported || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang) ||
        window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.split('-')[0]));
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [ttsSupported]
  );

  // Stop the microphone and any speech when the page using this hook goes away
  useEffect(
    () => () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (ttsSupported) window.speechSynthesis.cancel();
    },
    [ttsSupported]
  );

  return { supported, ttsSupported, listening, speaking, transcript, interim, error, start, stop, reset, speak, cancelSpeech };
}
