import { googleAccounts } from './google-user';

export type CalEvent = { account: string; start: string; end: string; allDay: boolean; title: string; location?: string; attendees?: number; link?: string };

/** Today's events across every connected Google account that granted calendar.readonly. */
export const todaysEvents = async (uid: string, tz: string, dayOffset = 0): Promise<{ events: CalEvent[]; accounts: number; missingScope: string[] }> => {
  const accounts = await googleAccounts(uid);
  const withCal = accounts.filter((a) => a.calendar);
  const missingScope = accounts.filter((a) => !a.calendar).map((a) => a.email);
  const now = new Date(); now.setUTCDate(now.getUTCDate() + dayOffset);
  const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // yyyy-mm-dd in tz
  const events: CalEvent[] = [];
  for (const a of withCal) {
    try {
      const tok = await a.token();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date(`${dayStr}T00:00:00`).toISOString())}&timeMax=${encodeURIComponent(new Date(`${dayStr}T23:59:59`).toISOString())}&timeZone=${encodeURIComponent(tz)}&maxResults=50`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
      const j: any = await r.json();
      if (!r.ok) { events.push({ account: a.email, start: '', end: '', allDay: true, title: `(calendar error: ${j.error?.message ?? r.status})` }); continue; }
      for (const e of j.items ?? []) if (e.status !== 'cancelled') events.push({ account: a.email, start: e.start?.dateTime ?? e.start?.date ?? '', end: e.end?.dateTime ?? e.end?.date ?? '', allDay: !e.start?.dateTime, title: e.summary ?? '(no title)', location: e.location, attendees: e.attendees?.length, link: e.htmlLink });
    } catch (e) { events.push({ account: a.email, start: '', end: '', allDay: true, title: `(calendar unavailable: ${String(e).slice(0, 80)})` }); }
  }
  events.sort((x, y) => x.start.localeCompare(y.start));
  return { events, accounts: withCal.length, missingScope };
};

export const fmtEvents = (ev: CalEvent[], tz: string) => ev.length ? ev.map((e) => `- ${e.allDay ? 'all day' : `${new Date(e.start).toLocaleTimeString('en-NZ', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}–${new Date(e.end).toLocaleTimeString('en-NZ', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}`} ${e.title}${e.location ? ` @ ${e.location}` : ''}${e.attendees ? ` (${e.attendees} people)` : ''} [${e.account}]`).join('\n') : '(no events)';
