// Pulls the Agenda + Bucket list tabs from the trip's Google Sheet via its
// public gviz JSON endpoint (works for any sheet shared as "anyone with the
// link can view" — no API key needed) and turns the response into the app's
// data shape via ItinParser. Called on load (when online) and from the Sync
// button; the service worker caches the same request URLs so the most recent
// successful response is replayed when the device is offline.

(function () {
  const SHEET_ID = '1GeHDoVKSgkWWruZnLPN-ld2KvZCTqEd8gd_9HdB8HSc';

  function gvizUrl(sheetName) {
    return (
      'https://docs.google.com/spreadsheets/d/' +
      SHEET_ID +
      '/gviz/tq?tqx=out:json&headers=0&sheet=' +
      encodeURIComponent(sheetName)
    );
  }

  function parseGvizResponse(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('Unexpected sheet response');
    const json = JSON.parse(text.slice(start, end + 1));
    if (json.status !== 'ok') {
      throw new Error('Sheet query failed: ' + (json.errors ? JSON.stringify(json.errors) : json.status));
    }
    const colCount = (json.table.cols || []).length || 9;
    return json.table.rows.map((row) => {
      const cells = (row.c || []).map((c) => (c && c.v != null ? c.v : ''));
      while (cells.length < colCount) cells.push('');
      return cells;
    });
  }

  async function fetchSheetRows(sheetName) {
    const res = await fetch(gvizUrl(sheetName), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    return parseGvizResponse(text);
  }

  async function syncFromSheet() {
    const [agendaRows, bucketRows] = await Promise.all([
      fetchSheetRows('Agenda'),
      fetchSheetRows('Bucket list'),
    ]);

    const agenda = ItinParser.parseAgenda(agendaRows);
    const bucketList = ItinParser.parseBucketList(bucketRows);

    const data = {
      meta: { syncedAt: new Date().toISOString(), source: 'sheet' },
      trip: {
        title: agenda.title,
        travelers: agenda.travelers,
        dates: agenda.dates,
        destination: agenda.destination,
      },
      days: agenda.days,
      bucketList,
    };

    ItinStore.save(data);
    return data;
  }

  window.SheetSync = { syncFromSheet };
})();
