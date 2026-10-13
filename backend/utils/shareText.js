/** Text of the tracking-link message for the wa.me share button. */
function trackingLinkText(booking, url) {
  return (
    `Follow my roadside rescue live (booking #${booking.bookingNumber}). ` +
    `No login needed: ${url}`
  );
}

/**
 * A click-to-chat link that opens WhatsApp with the message pre-filled.
 * Needs no API key, so the customer can share the link with family for free.
 */
function buildWaShareUrl(text, phone) {
  const digits = phone ? String(phone).replace(/[^\d]/g, '') : '';
  return `https://wa.me/${digits || ''}?text=${encodeURIComponent(text)}`;
}

module.exports = { trackingLinkText, buildWaShareUrl };
