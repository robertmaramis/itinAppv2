// Parses the "Agenda" and "Bucket list" tabs of the trip sheet (as a grid of
// string rows) into the app's data shape. Mirrors the section-based layout
// used by the sheet template (see itinApp-main/CLAUDE.md + ImprovedCSVParser.swift
// for the original CSV version of this same format), generalized to not
// hardcode specific dates.

(function () {
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const DATE_RE = /^\d{1,2}\/\d{1,2}$/;
  const FLIGHT_KEYWORD_RE = /transit|flight|layover|airline/i;
  const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,9}$/;

  function cell(row, i) {
    if (!row) return '';
    const v = row[i];
    return v == null ? '' : String(v).trim();
  }

  function parseAgenda(rows) {
    const title = cell(rows[0], 2) || cell(rows[0], 0) || 'Trip';

    // --- Trip header: Travellers / Dates / Destination ---
    let headerIdx = rows.findIndex((r) => cell(r, 2) === 'Travellers');
    let travelers = [];
    let dates = '';
    let destination = '';

    if (headerIdx >= 0) {
      let r = headerIdx + 1;
      dates = cell(rows[r], 5);
      destination = cell(rows[r], 6);
      let first = true;
      while (r < rows.length && r - headerIdx <= 12) {
        const row = rows[r];
        if (DATE_RE.test(cell(row, 0))) break;
        const c2 = cell(row, 2);
        if (c2) travelers.push(c2);
        if (!first) {
          const c5 = cell(row, 5);
          if (c5) travelers.push(c5);
          const c6 = cell(row, 6);
          if (c6) travelers.push(c6);
        }
        first = false;
        r++;
      }
    }

    // --- Day blocks ---
    const days = [];
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const c0 = cell(row, 0);

      if (!DATE_RE.test(c0)) {
        i++;
        continue;
      }

      const date = c0;
      const headC3 = cell(row, 3);
      const headC6 = cell(row, 6);

      let legTitle = headC6 || '';
      let dayTitle = '';
      let dayConfirmation = '';

      if (FLIGHT_KEYWORD_RE.test(headC3)) {
        const m = headC3.match(/#(\S+)/);
        if (m) dayConfirmation = m[1];
        dayTitle = headC6 || headC3;
      } else {
        dayTitle = headC3 || headC6 || '';
      }

      let dayOfWeek = '';
      if (DOW.includes(cell(rows[i + 1], 0))) {
        dayOfWeek = cell(rows[i + 1], 0);
      }

      const day = {
        date,
        dayOfWeek,
        title: dayTitle,
        confirmation: dayConfirmation,
        flights: [],
        activities: [],
      };

      let lastEntry = null;
      let j = i + 1;

      while (j < rows.length) {
        const r = rows[j];
        const rc0 = cell(r, 0);
        if (DATE_RE.test(rc0)) break;

        const c3 = cell(r, 3);
        const c4 = cell(r, 4);
        const c5 = cell(r, 5);
        const c6 = cell(r, 6);

        // Literal header row (e.g. "Time / Label / . / Notes") — skip.
        if (c3 === 'Time' || c4 === 'Label') {
          j++;
          continue;
        }

        // Flight leg marker: the real data lives on the NEXT row.
        if (/^(Depart|Arrive)$/i.test(c3)) {
          const action = c3.charAt(0).toUpperCase() + c3.slice(1).toLowerCase();
          const data = rows[j + 1] || [];
          const time = cell(data, 3);
          const airport = cell(data, 4);
          let airportName = cell(data, 5);
          let confirmation = '';
          if (airportName && CODE_RE.test(airportName)) {
            confirmation = airportName;
            airportName = '';
          }
          const entry = {
            action,
            time,
            airport,
            airportName,
            confirmation,
            legTitle,
            notes: cell(data, 6),
          };
          day.flights.push(entry);
          lastEntry = entry;
          j += 2;
          continue;
        }

        // Connector row: "Transit - 3h 45m", "Flight - 1h 35m", "Layover", "Airline and flight #..."
        if (FLIGHT_KEYWORD_RE.test(c3)) {
          if (c6) legTitle = c6;
          lastEntry = null;
          j++;
          continue;
        }

        // Regular activity row: col3=time, col4=label (or col5 when col4 is blank
        // but col3 has a time, e.g. post-arrival ground activities).
        if (c4 || (c3 && c5)) {
          const label = c4 || c5;
          const notesParts = [];
          if (c4 && c5) notesParts.push(c5);
          if (c6) notesParts.push(c6);
          const entry = { time: c3, label, notes: notesParts.join(' · ') };
          day.activities.push(entry);
          lastEntry = entry;
        } else if ((c5 || c6) && lastEntry) {
          // Continuation of the previous entry (extra note line, terminal info, etc.)
          const extra = c5 || c6;
          if ('airportName' in lastEntry && !lastEntry.airportName) {
            lastEntry.airportName = extra;
          } else {
            lastEntry.notes = lastEntry.notes ? lastEntry.notes + ' · ' + extra : extra;
          }
        }

        j++;
      }

      days.push(day);
      i = j;
    }

    return { title, travelers, dates, destination, days };
  }

  function extractFlightLegs(days) {
    const legs = [];
    days.forEach((day) => {
      let open = null;
      day.flights.forEach((entry) => {
        if (entry.action === 'Depart') {
          open = {
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            legTitle: entry.legTitle,
            confirmation: entry.confirmation || day.confirmation || '',
            departTime: entry.time,
            departAirport: entry.airport,
            departAirportName: entry.airportName,
            departNotes: entry.notes,
            arriveTime: '',
            arriveAirport: '',
            arriveAirportName: '',
          };
        } else if (entry.action === 'Arrive' && open) {
          open.arriveTime = entry.time;
          open.arriveAirport = entry.airport;
          open.arriveAirportName = entry.airportName;
          if (!open.confirmation) open.confirmation = entry.confirmation || day.confirmation || '';
          legs.push(open);
          open = null;
        }
      });
      if (open) legs.push(open);
    });
    return legs;
  }

  function parseBucketList(rows) {
    return rows
      .map((r) => cell(r, 1))
      .filter(Boolean)
      .map((text, idx) => ({ id: 'b' + idx, text }));
  }

  window.ItinParser = { parseAgenda, extractFlightLegs, parseBucketList };
})();
