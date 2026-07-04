// Google OAuth Client ID storage. Lives in its own module (not the Settings UI
// component) so data-layer code like google.js can read it without importing a
// React component — which would otherwise create a UI↔data cycle.
const CONFIG_KEY = 'bpmf_google_config';

const readConfig = () => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const writeConfig = (config) => {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save Google config:', error);
  }
};

export const getGoogleClientId = () => {
  const id = readConfig().clientId;
  return typeof id === 'string' ? id.trim() : '';
};

export const hasGoogleClientId = () => Boolean(getGoogleClientId());
