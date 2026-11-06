// Service worker: manages toolbar badge state reflecting on/off switch.

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled === false ? 'OFF' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#3A3940' });
}

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => updateBadge(enabled));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) updateBadge(changes.enabled.newValue);
});
