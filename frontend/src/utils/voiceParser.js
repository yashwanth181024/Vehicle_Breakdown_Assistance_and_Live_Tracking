import { SERVICE_TYPES, VEHICLE_TYPES } from './format.js';

/**
 * Pulls booking details out of a spoken sentence, in English, Hindi or Kannada.
 * It only fills what it is sure about; the person always sees and can correct the form.
 *
 *   parseBookingSpeech('My name is Ravi, phone 9876543210, flat tyre on my car near Silk Board')
 *   -> { name:'Ravi', phone:'9876543210', serviceType:'Flat Tyre', vehicleType:'Car', pickupLocation:'Silk Board', description:'...' }
 */

const SERVICE_WORDS = {
  'Flat Tyre': ['flat tyre', 'flat tire', 'puncture', 'tyre', 'tire', 'पंक्चर', 'पंचर', 'टायर', 'ಪಂಕ್ಚರ್', 'ಟೈರ್'],
  'Battery Jump Start': ['battery', 'jump start', 'jumpstart', 'dead battery', 'बैटरी', 'ಬ್ಯಾಟರಿ'],
  'Fuel Delivery': ['fuel', 'petrol', 'diesel', 'out of gas', 'पेट्रोल', 'डीजल', 'ईंधन', 'ಪೆಟ್ರೋಲ್', 'ಡೀಸೆಲ್', 'ಇಂಧನ'],
  Towing: ['tow', 'towing', 'crane', 'टो', 'क्रेन', 'ಟೋ', 'ಕ್ರೇನ್'],
  'Engine Problem': ['engine', 'overheat', 'smoke', "won't start", 'not starting', 'इंजन', 'ಇಂಜಿನ್', 'ಎಂಜಿನ್', 'स्टार्ट नहीं'],
  Lockout: ['lockout', 'locked out', 'keys inside', 'key locked', 'लॉक', 'चाबी', 'ಲಾಕ್', 'ಕೀ'],
  'Accident Recovery': ['accident', 'crash', 'collision', 'दुर्घटना', 'एक्सीडेंट', 'ಅಪಘಾತ', 'ಆಕ್ಸಿಡೆಂಟ್'],
};

const VEHICLE_WORDS = {
  Car: ['car', 'कार', 'ಕಾರ್', 'ಕಾರು'],
  Bike: ['bike', 'motorcycle', 'motorbike', 'बाइक', 'ಬೈಕ್'],
  Scooter: ['scooter', 'scooty', 'activa', 'स्कूटर', 'स्कूटी', 'ಸ್ಕೂಟರ್', 'ಸ್ಕೂಟಿ'],
  'Auto Rickshaw': ['auto', 'rickshaw', 'ऑटो', 'रिक्शा', 'ಆಟೋ'],
  Van: ['van', 'वैन', 'ವ್ಯಾನ್'],
  Truck: ['truck', 'lorry', 'ट्रक', 'लॉरी', 'ಟ್ರಕ್', 'ಲಾರಿ'],
  Bus: ['bus', 'बस', 'ಬಸ್'],
};

// Words that introduce a name or a place, per language
const NAME_PATTERNS = [
  /(?:my name is|i am|i'm|this is|name is)\s+([a-z][a-z .'-]{1,30}?)(?=[,.]|\s+(?:and|phone|number|mobile|my|i|at|near|from|in)\b|$)/i,
  /(?:मेरा नाम है|मेरा नाम|नाम)\s+([ऀ-ॿ]+)/,
  /(?:ನನ್ನ ಹೆಸರು|ಹೆಸರು)\s+([ಀ-೿]+)/,
];
const PLACE_PATTERNS = [
  /\b(?:near|opposite|beside|behind|close to|next to)\s+([a-z0-9][a-z0-9 ,.'/-]{2,70}?)(?=[,.]\s*(?:phone|my|name|please)|\s+(?:please|phone|my name|and my|help)\b|[.]?$)/i,
  /\b(?:at|in)\s+([a-z0-9][a-z0-9 ,.'/-]{2,70}?)(?=[,.]\s*(?:phone|my|name|please)|\s+(?:please|phone|my name|and my|help)\b|[.]?$)/i,
];

const NUMBER_WORDS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5', 'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
};

/** Turns spoken digits ("nine eight seven...") and Hindi/Kannada numerals into plain digits. */
function normaliseDigits(text) {
  let out = text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari digits
    .replace(/[೦-೯]/g, (d) => String(d.charCodeAt(0) - 0x0CE6)); // Kannada digits
  out = out.replace(/[\p{L}]+/gu, (w) => (NUMBER_WORDS[w.toLowerCase()] !== undefined ? NUMBER_WORDS[w.toLowerCase()] : w));
  return out;
}

function findPhone(text) {
  const digits = normaliseDigits(text);
  // allow spaces/dashes between spoken digits: "98765 43210", "9 8 7 6 5 ..."
  const m = digits.match(/(?:\+?91[\s-]*)?([6-9](?:[\s-]?\d){9})/);
  return m ? m[1].replace(/\D/g, '') : '';
}

function findByWords(text, table, allowed) {
  const lower = text.toLowerCase();
  let best = '';
  let bestAt = Infinity;
  Object.entries(table).forEach(([label, words]) => {
    if (!allowed.includes(label)) return;
    words.forEach((w) => {
      const at = lower.indexOf(w.toLowerCase());
      // Prefer the longest phrase matching earliest, so "flat tyre" beats a bare "tyre" and "towing" beats nothing
      if (at !== -1 && (at < bestAt || (at === bestAt && w.length > 0))) {
        best = label;
        bestAt = at;
      }
    });
  });
  return best;
}

function cleanName(raw) {
  return raw.replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
}

export function parseBookingSpeech(input) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (!text) return {};
  const result = {};

  const phone = findPhone(text);
  if (phone) result.phone = phone;

  for (const re of NAME_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      result.name = cleanName(m[1]);
      break;
    }
  }

  const service = findByWords(text, SERVICE_WORDS, SERVICE_TYPES);
  if (service) result.serviceType = service;
  const vehicle = findByWords(text, VEHICLE_WORDS, VEHICLE_TYPES);
  if (vehicle) result.vehicleType = vehicle;

  const en = text.match(PLACE_PATTERNS[0]) || text.match(PLACE_PATTERNS[1]);
  if (en && en[1]) {
    result.pickupLocation = en[1].replace(/[\s,]+$/, '').trim();
  } else {
    // Hindi: "<place> के पास" / Kannada: "<place> ಹತ್ತಿರ"
    const hi = text.match(/([ऀ-ॿ]+) (?:के पास|के नज़दीक|के सामने)/);
    const kn = text.match(/([ಀ-೿]+) (?:ಹತ್ತಿರ|ಬಳಿ)/);
    const place = (hi && hi[1]) || (kn && kn[1]);
    if (place) result.pickupLocation = place.trim();
  }

  result.description = text;
  return result;
}
