import { callCal, send, DEFAULT_TZ } from './_cal.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const { eventTypeId, startTime, endTime, timeZone } = req.query;
  if (!eventTypeId || !startTime || !endTime) {
    return send(res, 400, { error: 'eventTypeId, startTime and endTime are required.' });
  }

  try {
    // v2 /slots — uses `start` / `end` (not `startTime`/`endTime`)
    const { ok, status, data } = await callCal('/slots', {
      apiVersion: '2024-09-04',
      params: {
        eventTypeId,
        start: startTime,
        end: endTime,
        timeZone: timeZone || DEFAULT_TZ
      }
    });

    if (!ok) return send(res, status, data);

    // Normalize many possible shapes to: { slots: { "YYYY-MM-DD": [{time: "ISO"}] } }
    const payload = data?.data ?? data;
    const slotsByDay = {};

    // Shape A: { "YYYY-MM-DD": [{start: "ISO"} | "ISO" | {time: "ISO"}] }
    // Shape B: { slots: { ... same as A ... } }
    const days = (payload && typeof payload === 'object' && payload.slots && typeof payload.slots === 'object')
      ? payload.slots
      : payload;

    if (days && typeof days === 'object') {
      for (const [day, arr] of Object.entries(days)) {
        if (!Array.isArray(arr)) continue;
        slotsByDay[day] = arr.map(s => {
          if (typeof s === 'string') return { time: s };
          return { time: s.time || s.start || s.startTime || s.dateTime || null };
        }).filter(x => x.time);
      }
    }

    send(res, 200, { slots: slotsByDay });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}