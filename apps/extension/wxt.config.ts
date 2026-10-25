import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

// Lessons come from the user's own key by default; WXT_LESSONS_MODE=hosted uses Pixel Peeper's API at WXT_API_URL.
const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'WXT_');
const hosted = env.WXT_LESSONS_MODE === 'hosted';
const apiUrl = env.WXT_API_URL || 'http://localhost:8787';

export default defineConfig({
  // Visible folder (not .output) so it is easy to pick in Chrome's "Load unpacked" dialog.
  outDir: 'dist',
  // `npm run zip:ext` → dist/pixel-peeper-<version>-chrome.zip, ready to upload to the Chrome Web Store.
  zip: { artifactTemplate: 'pixel-peeper-{{version}}-{{browser}}.zip' },
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    // unlimitedStorage: ideas keep their captures. scripting: re-inject into tabs opened before an update.
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    // Only the AI service lessons come from; page access comes from activeTab when the user clicks the action.
    host_permissions: hosted ? [`${new URL(apiUrl).origin}/*`] : ['https://api.groq.com/*', 'https://api.anthropic.com/*'],
    action: { default_title: 'Open Pixel Peeper' },
    commands: { pick: { suggested_key: { default: 'Alt+P', mac: 'Alt+P' }, description: 'Pick an element to learn from' } },
    web_accessible_resources: [{ resources: ['poses/*.svg', 'fonts/*.woff2'], matches: ['<all_urls>'] }],
  },
});
