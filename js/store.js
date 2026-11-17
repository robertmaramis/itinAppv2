// Thin localStorage wrapper. Every read/write is wrapped in try/catch —
// storage can throw or come back empty in a private window, with site data
// cleared, or during a thumbnail/preview capture.

(function () {
  const DATA_KEY = 'maramisJapan2027:data';
  const CHECK_KEY = 'maramisJapan2027:bucketChecked';

  function safeGet(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  function save(data) {
    safeSet(DATA_KEY, data);
  }

  function load() {
    return safeGet(DATA_KEY);
  }

  function getChecked() {
    return safeGet(CHECK_KEY) || {};
  }

  function setChecked(id, checked) {
    const state = getChecked();
    if (checked) state[id] = true;
    else delete state[id];
    safeSet(CHECK_KEY, state);
    return state;
  }

  window.ItinStore = { save, load, getChecked, setChecked };
})();
