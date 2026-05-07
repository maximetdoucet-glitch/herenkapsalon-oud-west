import { callCal, send, DEFAULT_TZ } from './_cal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const incoming = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});

  // Translate our v1-shaped client payload into the v2 booking shape.
  const tz = incoming.timeZone || DEFAULT_TZ;
  const lang = incoming.language || 'nl';
  const responses = incoming.responses || {};

  const v2Body = {
    start: incoming.start,
    eventTypeId: Number(incoming.eventTypeId),
    attendee: {
      name: responses.name || '',
      email: responses.email || '',
      timeZone: tz,
      language: lang,
      ...(responses.phone ? { phoneNumber: responses.phone } : {})
    },
    metadata: incoming.metadata || {},
    bookingFieldsResponses: {
      ...(responses.notes ? { notes: responses.notes } : {})
    }
  };

  try {
    const { ok, status, data } = await callCal('/bookings', {
      method: 'POST',
      apiVersion: '2024-08-13',
      body: v2Body
    });
    send(res, ok ? 200 : status, data);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}