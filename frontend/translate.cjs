const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, 'src', 'i18n.js');
let i18nContent = fs.readFileSync(i18nPath, 'utf8');

const enTrack = `
      // TrackBooking
      "Track your booking": "Track your booking",
      "Enter your booking number (digits only).": "Enter your booking number (digits only).",
      "Enter the 10-digit mobile number you booked with.": "Enter the 10-digit mobile number you booked with.",
      "Mobile number": "Mobile number",
      "The number you gave when you booked.": "The number you gave when you booked.",
      "Looking…": "Looking…",
      "Tap a star to rate.": "Tap a star to rate.",
      "Comment": "Comment",
      "optional": "optional",
      "Sending…": "Sending…",
      "Send rating": "Send rating",
      "Thank you for your feedback.": "Thank you for your feedback.",
      "Finding your booking": "Finding your booking",
      "No booking matches that number and phone. Please check both.": "No booking matches that number and phone. Please check both.",
      "EMERGENCY SOS:": "EMERGENCY SOS:",
      "High priority response activated.": "High priority response activated.",
      "Track another": "Track another",
      "We are finding the nearest driver. You can leave this page open; it updates by itself.": "We are finding the nearest driver. You can leave this page open; it updates by itself.",
      "Sorry, we could not take this request": "Sorry, we could not take this request",
      ". Please try again or call a local service.": ". Please try again or call a local service.",
      "This booking was cancelled.": "This booking was cancelled.",
      "Pickup:": "Pickup:",
      "Your driver": "Your driver",
      "Call": "Call",
      "How was the service?": "How was the service?",
      "Receipt": "Receipt",
      "Download a PDF receipt for this booking.": "Download a PDF receipt for this booking.",
      "Download Receipt": "Download Receipt",
      "Progress": "Progress",
      "Chat with your driver": "Chat with your driver",
      "Chat opens as soon as a driver is assigned.": "Chat opens as soon as a driver is assigned.",
      "Let someone follow along": "Let someone follow along",
      "Cancel this booking": "Cancel this booking",
      "Cancel this request? Any driver on the way will be told.": "Cancel this request? Any driver on the way will be told.",
      "Cancelling…": "Cancelling…",
      "Yes, cancel": "Yes, cancel",
      "Keep it": "Keep it",
`;

const hiTrack = `
      "Track your booking": "अपनी बुकिंग ट्रैक करें",
      "Enter your booking number (digits only).": "अपना बुकिंग नंबर दर्ज करें (केवल अंक)।",
      "Enter the 10-digit mobile number you booked with.": "वह 10-अंकीय मोबाइल नंबर दर्ज करें जिससे आपने बुक किया था।",
      "Mobile number": "मोबाइल नंबर",
      "The number you gave when you booked.": "वह नंबर जो आपने बुक करते समय दिया था।",
      "Looking…": "खोज रहे हैं…",
      "Tap a star to rate.": "रेट करने के लिए स्टार पर टैप करें।",
      "Comment": "टिप्पणी",
      "optional": "वैकल्पिक",
      "Sending…": "भेज रहे हैं…",
      "Send rating": "रेटिंग भेजें",
      "Thank you for your feedback.": "आपकी प्रतिक्रिया के लिए धन्यवाद।",
      "Finding your booking": "आपकी बुकिंग ढूंढ रहे हैं",
      "No booking matches that number and phone. Please check both.": "उस नंबर और फोन से कोई बुकिंग मेल नहीं खाती। कृपया दोनों की जाँच करें।",
      "EMERGENCY SOS:": "आपातकालीन एसओएस:",
      "High priority response activated.": "उच्च प्राथमिकता प्रतिक्रिया सक्रिय।",
      "Track another": "एक और ट्रैक करें",
      "We are finding the nearest driver. You can leave this page open; it updates by itself.": "हम निकटतम ड्राइवर ढूंढ रहे हैं। आप इस पृष्ठ को खुला छोड़ सकते हैं; यह अपने आप अपडेट हो जाता है।",
      "Sorry, we could not take this request": "क्षमा करें, हम यह अनुरोध नहीं ले सके",
      ". Please try again or call a local service.": ". कृपया पुनः प्रयास करें या स्थानीय सेवा को कॉल करें।",
      "This booking was cancelled.": "यह बुकिंग रद्द कर दी गई थी।",
      "Pickup:": "पिकअप:",
      "Your driver": "आपका ड्राइवर",
      "Call": "कॉल करें",
      "How was the service?": "सेवा कैसी थी?",
      "Receipt": "रसीद",
      "Download a PDF receipt for this booking.": "इस बुकिंग के लिए एक पीडीएफ रसीद डाउनलोड करें।",
      "Download Receipt": "रसीद डाउनलोड करें",
      "Progress": "प्रगति",
      "Chat with your driver": "अपने ड्राइवर के साथ चैट करें",
      "Chat opens as soon as a driver is assigned.": "जैसे ही ड्राइवर असाइन होता है चैट खुल जाती है।",
      "Let someone follow along": "किसी को साथ चलने दें",
      "Cancel this booking": "इस बुकिंग को रद्द करें",
      "Cancel this request? Any driver on the way will be told.": "इस अनुरोध को रद्द करें? रास्ते में किसी भी ड्राइवर को बता दिया जाएगा।",
      "Cancelling…": "रद्द कर रहे हैं…",
      "Yes, cancel": "हाँ, रद्द करें",
      "Keep it": "इसे रखें",
`;

const knTrack = `
      "Track your booking": "ನಿಮ್ಮ ಬುಕಿಂಗ್ ಅನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ",
      "Enter your booking number (digits only).": "ನಿಮ್ಮ ಬುಕಿಂಗ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ (ಅಂಕಿಗಳು ಮಾತ್ರ).",
      "Enter the 10-digit mobile number you booked with.": "ನೀವು ಬುಕ್ ಮಾಡಿದ 10-ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.",
      "Mobile number": "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ",
      "The number you gave when you booked.": "ನೀವು ಬುಕ್ ಮಾಡುವಾಗ ನೀಡಿದ ಸಂಖ್ಯೆ.",
      "Looking…": "ಹುಡುಕಲಾಗುತ್ತಿದೆ…",
      "Tap a star to rate.": "ರೇಟ್ ಮಾಡಲು ನಕ್ಷತ್ರವನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.",
      "Comment": "ಕಾಮೆಂಟ್",
      "optional": "ಐಚ್ಛಿಕ",
      "Sending…": "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
      "Send rating": "ರೇಟಿಂಗ್ ಕಳುಹಿಸಿ",
      "Thank you for your feedback.": "ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಗೆ ಧನ್ಯವಾದಗಳು.",
      "Finding your booking": "ನಿಮ್ಮ ಬುಕಿಂಗ್ ಅನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ",
      "No booking matches that number and phone. Please check both.": "ಆ ಸಂಖ್ಯೆ ಮತ್ತು ಫೋನ್‌ಗೆ ಯಾವುದೇ ಬುಕಿಂಗ್ ಹೊಂದಿಕೆಯಾಗುವುದಿಲ್ಲ. ದಯವಿಟ್ಟು ಎರಡನ್ನೂ ಪರಿಶೀಲಿಸಿ.",
      "EMERGENCY SOS:": "ತುರ್ತು ಎಸ್.ಒ.ಎಸ್:",
      "High priority response activated.": "ಹೆಚ್ಚಿನ ಆದ್ಯತೆಯ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.",
      "Track another": "ಇನ್ನೊಂದನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ",
      "We are finding the nearest driver. You can leave this page open; it updates by itself.": "ನಾವು ಹತ್ತಿರದ ಚಾಲಕನನ್ನು ಹುಡುಕುತ್ತಿದ್ದೇವೆ. ನೀವು ಈ ಪುಟವನ್ನು ತೆರೆದಿಡಬಹುದು; ಅದು ತಾನಾಗಿಯೇ ನವೀಕರಿಸಲ್ಪಡುತ್ತದೆ.",
      "Sorry, we could not take this request": "ಕ್ಷಮಿಸಿ, ನಾವು ಈ ವಿನಂತಿಯನ್ನು ತೆಗೆದುಕೊಳ್ಳಲಾಗಲಿಲ್ಲ",
      ". Please try again or call a local service.": ". ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಸ್ಥಳೀಯ ಸೇವೆಗೆ ಕರೆ ಮಾಡಿ.",
      "This booking was cancelled.": "ಈ ಬುಕಿಂಗ್ ಅನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.",
      "Pickup:": "ಪಿಕಪ್:",
      "Your driver": "ನಿಮ್ಮ ಚಾಲಕ",
      "Call": "ಕರೆ",
      "How was the service?": "ಸೇವೆ ಹೇಗಿತ್ತು?",
      "Receipt": "ರಶೀದಿ",
      "Download a PDF receipt for this booking.": "ಈ ಬುಕಿಂಗ್‌ಗಾಗಿ ಪಿಡಿಎಫ್ ರಶೀದಿಯನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ.",
      "Download Receipt": "ರಶೀದಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
      "Progress": "ಪ್ರಗತಿ",
      "Chat with your driver": "ನಿಮ್ಮ ಚಾಲಕನೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ",
      "Chat opens as soon as a driver is assigned.": "ಚಾಲಕನನ್ನು ನಿಯೋಜಿಸಿದ ತಕ್ಷಣ ಚಾಟ್ ತೆರೆಯುತ್ತದೆ.",
      "Let someone follow along": "ಯಾರಾದರೂ ಅನುಸರಿಸಲು ಬಿಡಿ",
      "Cancel this booking": "ಈ ಬುಕಿಂಗ್ ಅನ್ನು ರದ್ದುಗೊಳಿಸಿ",
      "Cancel this request? Any driver on the way will be told.": "ಈ ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಬೇಕೆ? ದಾರಿಯಲ್ಲಿರುವ ಯಾವುದೇ ಚಾಲಕನಿಗೆ ತಿಳಿಸಲಾಗುವುದು.",
      "Cancelling…": "ರದ್ದುಗೊಳಿಸಲಾಗುತ್ತಿದೆ…",
      "Yes, cancel": "ಹೌದು, ರದ್ದುಗೊಳಿಸಿ",
      "Keep it": "ಅದನ್ನು ಇರಿಸಿ",
`;

i18nContent = i18nContent.replace('"step3_text": "Watch the driver on the map with an arrival time, and chat if you need to."', '"step3_text": "Watch the driver on the map with an arrival time, and chat if you need to.",' + enTrack);
i18nContent = i18nContent.replace('"step3_text": "आगमन समय के साथ मैप पर ड्राइवर को देखें, और आवश्यकता पड़ने पर चैट करें।"', '"step3_text": "आगमन समय के साथ मैप पर ड्राइवर को देखें, और आवश्यकता पड़ने पर चैट करें।",' + hiTrack);
i18nContent = i18nContent.replace('"step3_text": "ಆಗಮನದ ಸಮಯದೊಂದಿಗೆ ನಕ್ಷೆಯಲ್ಲಿ ಚಾಲಕನನ್ನು ವೀಕ್ಷಿಸಿ ಮತ್ತು ಅಗತ್ಯವಿದ್ದರೆ ಚಾಟ್ ಮಾಡಿ."', '"step3_text": "ಆಗಮನದ ಸಮಯದೊಂದಿಗೆ ನಕ್ಷೆಯಲ್ಲಿ ಚಾಲಕನನ್ನು ವೀಕ್ಷಿಸಿ ಮತ್ತು ಅಗತ್ಯವಿದ್ದರೆ ಚಾಟ್ ಮಾಡಿ.",' + knTrack);

fs.writeFileSync(i18nPath, i18nContent);

const trackPath = path.join(__dirname, 'src', 'pages', 'TrackBooking.jsx');
let trackContent = fs.readFileSync(trackPath, 'utf8');

trackContent = trackContent.replace("import { useNavigate, useSearchParams } from 'react-router-dom';", "import { useNavigate, useSearchParams } from 'react-router-dom';\nimport { useTranslation } from 'react-i18next';");

trackContent = trackContent.replace("function LookupForm({ initialNumber, initialPhone, error, busy, onSubmit }) {", "function LookupForm({ initialNumber, initialPhone, error, busy, onSubmit }) {\n  const { t } = useTranslation();");
trackContent = trackContent.replace(/>Track your booking</g, ">{t('Track your booking')}<");
trackContent = trackContent.replace(/>Booking number</g, ">{t('Booking number')}<");
trackContent = trackContent.replace(/>Mobile number</g, ">{t('Mobile number')}<");
trackContent = trackContent.replace(/>The number you gave when you booked.</g, ">{t('The number you gave when you booked.')}<");
trackContent = trackContent.replace(/{busy \? 'Looking…' : 'Track'}/g, "{busy ? t('Looking…') : t('Track')}");
trackContent = trackContent.replace(/'Enter your booking number \(digits only\).'/g, "t('Enter your booking number (digits only).')");
trackContent = trackContent.replace(/'Enter the 10-digit mobile number you booked with.'/g, "t('Enter the 10-digit mobile number you booked with.')");

trackContent = trackContent.replace("function RatingForm({ bookingNumber, phone, existing, onDone }) {", "function RatingForm({ bookingNumber, phone, existing, onDone }) {\n  const { t } = useTranslation();");
trackContent = trackContent.replace(/>You rated this service <strong>{existing} out of 5<\/strong>\. Thank you!</, ">{t('You rated this service')} <strong>{existing} out of 5</strong>. {t('Thank you for your feedback.')}<");
trackContent = trackContent.replace(/'Tap a star to rate.'/g, "t('Tap a star to rate.')");
trackContent = trackContent.replace(/'Thank you for your feedback.'/g, "t('Thank you for your feedback.')");
trackContent = trackContent.replace('>Comment <span className="optional">(optional)</span><', `>{t('Comment')} <span className="optional">({t('optional')})</span><`);
trackContent = trackContent.replace(/{busy \? 'Sending…' : 'Send rating'}/g, "{busy ? t('Sending…') : t('Send rating')}");

trackContent = trackContent.replace("export default function TrackBooking() {", "export default function TrackBooking() {\n  const { t } = useTranslation();");
trackContent = trackContent.replace(/'No booking matches that number and phone\. Please check both.'/g, "t('No booking matches that number and phone. Please check both.')");
trackContent = trackContent.replace(/'Your booking was cancelled.'/g, "t('This booking was cancelled.')");
trackContent = trackContent.replace(/>Finding your booking</, ">{t('Finding your booking')}<");
trackContent = trackContent.replace(/>EMERGENCY SOS:</, ">{t('EMERGENCY SOS:')}<");
trackContent = trackContent.replace(/>High priority response activated\.</, ">{t('High priority response activated.')}<");
trackContent = trackContent.replace(/>Track another</, ">{t('Track another')}<");
trackContent = trackContent.replace(/>We are finding the nearest driver\. You can leave this page open; it updates by itself\.</, ">{t('We are finding the nearest driver. You can leave this page open; it updates by itself.')}<");
trackContent = trackContent.replace(/>Sorry, we could not take this request/, ">{t('Sorry, we could not take this request')}");
trackContent = trackContent.replace(/\. Please try again or call a local service\.</, "{t('. Please try again or call a local service.')}<");
trackContent = trackContent.replace(/>This booking was cancelled\.</, ">{t('This booking was cancelled.')}<");
trackContent = trackContent.replace(/>Pickup: /, ">{t('Pickup:')} ");
trackContent = trackContent.replace(/>Your driver</, ">{t('Your driver')}<");
trackContent = trackContent.replace(/>Call /, ">{t('Call')} ");
trackContent = trackContent.replace(/>How was the service\?</, ">{t('How was the service?')}<");
trackContent = trackContent.replace(/>Receipt</, ">{t('Receipt')}<");
trackContent = trackContent.replace(/>Download a PDF receipt for this booking\.</, ">{t('Download a PDF receipt for this booking.')}<");
trackContent = trackContent.replace(/>Download Receipt</, ">{t('Download Receipt')}<");
trackContent = trackContent.replace(/>Progress</, ">{t('Progress')}<");
trackContent = trackContent.replace(/>Chat with your driver</, ">{t('Chat with your driver')}<");
trackContent = trackContent.replace(/>Chat opens as soon as a driver is assigned\.</, ">{t('Chat opens as soon as a driver is assigned.')}<");
trackContent = trackContent.replace(/>Let someone follow along</, ">{t('Let someone follow along')}<");
trackContent = trackContent.replace(/>Cancel this booking</, ">{t('Cancel this booking')}<");
trackContent = trackContent.replace(/>Cancel this request\? Any driver on the way will be told\.</, ">{t('Cancel this request? Any driver on the way will be told.')}<");
trackContent = trackContent.replace(/{cancelling \? 'Cancelling…' : 'Yes, cancel'}/, "{cancelling ? t('Cancelling…') : t('Yes, cancel')}");
trackContent = trackContent.replace(/>Keep it</, ">{t('Keep it')}<");

fs.writeFileSync(trackPath, trackContent);
console.log('Translations applied successfully!');
