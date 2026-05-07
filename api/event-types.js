import { callCal, send } from './_cal.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    // v2 returns the authenticated user's event types.
    const { ok, status, data } = await callCal('/event-types', { apiVersion: '2024-06-14' });
    if (!ok) return send(res, status, data);

    // Defensive: v2 has used a few response shapes — try them all.
    let raw = [];
    if (Array.isArray(data?.data?.eventTypes)) raw = data.data.eventTypes;
    else if (Array.isArray(data?.data)) raw = data.data;
    else if (Array.isArray(data?.eventTypes)) raw = data.eventTypes;
    else if (Array.isArray(data)) raw = data;
    // Some shapes nest one level deeper: data.eventTypeGroups[i].eventTypes
    else if (Array.isArray(data?.data?.eventTypeGroups)) {
      raw = data.data.eventTypeGroups.flatMap(g => g.eventTypes || []);
    }

    const list = raw.map(et => ({
      id: et.id,
      slug: et.slug,
      title: et.title,
      length: et.lengthInMinutes ?? et.length ?? et.duration,
      price: et.price,
      currency: et.currency
    })).filter(et => et.id && et.slug);

    send(res, 200, { eventTypes: list });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}