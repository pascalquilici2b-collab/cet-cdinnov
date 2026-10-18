// Display projection only: stored requests, approvals and balances are never changed.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const addDay = day => new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();
const key = (...parts) => JSON.stringify(parts);

export function leavePeriods(raw = []) {
  const groups = new Map();
  const insert = c => {
    if (!validDate(c.date) || !['AM', 'PM'].includes(c.half) || ['Refusé', 'Annulé'].includes(c.statut)) return;
    const id = key(c.matricule, c.date, c.type, c.statut);
    if (!groups.has(id)) groups.set(id, {matricule:c.matricule, date:c.date, type:c.type, statut:c.statut, halves:new Set()});
    groups.get(id).halves.add(c.half);
  };
  for (const c of raw) {
    if (c.date && c.half) insert(c);
    else if (validDate(c.dateDebut) && validDate(c.dateFin) && c.dateFin >= c.dateDebut) {
      for (let day = c.dateDebut; day <= c.dateFin; day = addDay(day)) {
        if (![0, 6].includes(weekday(day))) for (const half of ['AM', 'PM']) insert({...c, date:day, half});
      }
    }
  }
  const daily = [...groups.values()].map(c => ({...c, halves:[...c.halves].sort(), days:c.halves.size / 2}));
  const occupied = new Set(daily.map(c => key(c.matricule, c.date)));
  // Preserve the portal's existing Saturday convention after a full Friday of paid leave.
  const fridays = new Map();
  for (const c of daily.filter(c => c.type === 'Congés payés' && weekday(c.date) === 5)) {
    const id = key(c.matricule, c.date);
    if (!fridays.has(id)) fridays.set(id, []);
    fridays.get(id).push(c);
  }
  for (const items of fridays.values()) {
    if (new Set(items.flatMap(c => c.halves)).size !== 2) continue;
    const first = items.find(c => c.statut !== 'Validé') || items[0], date = addDay(first.date);
    if (occupied.has(key(first.matricule, date))) continue;
    daily.push({...first, date, halves:['AM', 'PM'], days:1, countedSaturday:true});
    occupied.add(key(first.matricule, date));
  }
  const compatible = new Map();
  for (const c of daily) {
    const id = key(c.matricule, c.type, c.statut);
    if (!compatible.has(id)) compatible.set(id, []);
    compatible.get(id).push(c);
  }
  const result = [];
  for (const entries of compatible.values()) {
    entries.sort((a,b) => a.date.localeCompare(b.date));
    let period;
    for (const entry of entries) {
      const previous = period?.entries.at(-1);
      let joins = !!previous && previous.halves.includes('PM') && entry.halves.includes('AM');
      if (joins) {
        for (let day = addDay(previous.date); day < entry.date; day = addDay(day)) {
          if (![0,6].includes(weekday(day)) || occupied.has(key(entry.matricule, day))) { joins = false; break; }
        }
      }
      if (!joins) {
        period = {id:'leave:' + key(entry.matricule, entry.date, entry.type, entry.statut),
          matricule:entry.matricule, type:entry.type, statut:entry.statut,
          start:entry.date, end:entry.date, days:0, entries:[]};
        result.push(period);
      }
      period.end = entry.date;
      period.days += entry.days;
      period.entries.push(entry);
    }
  }
  return result.sort((a,b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
