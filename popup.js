// Settings popup. Values are stored with chrome.storage.sync (skip, fineSkip, autoHide, mirror, enabled;
// nothing personal). Each value is clamped to a safe range before saving.

// On/off switch for the whole extension.
const power = document.getElementById('enabled');
function showPower(on) {
  power.checked = on;
  document.getElementById('powerLabel').textContent = on ? 'ReelCoach is on' : 'ReelCoach is off';
  document.getElementById('powerSub').textContent = on ? 'Turn off to hide the controls everywhere' : 'Turn on to bring the controls back';
  document.body.classList.toggle('off', !on);
}
power.addEventListener('change', () => {
  showPower(power.checked);
  chrome.storage.sync.set({ enabled: power.checked });
});
chrome.storage.sync.get({ enabled: true }, ({ enabled }) => showPower(enabled !== false));

const DEFAULTS = { skip: 5, fineSkip: 1, autoHide: 2.5 };
const LIMITS = { skip: [0.5, 60], fineSkip: [0.1, 30], autoHide: [0.5, 30] };
const edited = new Set();

function clean(key, value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return DEFAULTS[key];
  const [lo, hi] = LIMITS[key];
  return Math.min(hi, Math.max(lo, n));
}

for (const key of Object.keys(DEFAULTS)) {
  const input = document.getElementById(key);
  input.value = DEFAULTS[key];
  // Attach immediately so an edit made before stored values arrive is never lost.
  input.addEventListener('change', () => {
    edited.add(key);
    const value = clean(key, input.value);
    input.value = value;
    chrome.storage.sync.set({ [key]: value });
  });
}

chrome.storage.sync.get(DEFAULTS, (stored) => {
  for (const key of Object.keys(DEFAULTS)) {
    if (!edited.has(key)) document.getElementById(key).value = clean(key, stored[key]);
  }
});
