import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

// The hosted API. Set WXT_API_URL in apps/extension/.env.production for builds; local dev uses the dev server.
const apiUrl = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'WXT_').WXT_API_URL || 'http://localhost:8787';

export default defineConfig({
  // Visible folder (not .output) so it is easy to pick in Chrome's "Load unpacked" dialog.
  outDir: 'dist',
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    // unlimitedStorage: ideas keep their captures. scripting: re-inject into tabs opened before an update.
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    // Only Pixel Peeper's own API; page access comes from activeTab when the user clicks the action.
    host_permissions: [`${new URL(apiUrl).origin}/*`],
    action: { default_title: 'Open Pixel Peeper' },
    commands: { pick: { suggested_key: { default: 'Alt+P', mac: 'Alt+P' }, description: 'Pick an element to learn from' } },
    web_accessible_resources: [{ resources: ['detective-poses.png'], matches: ['<all_urls>'] }],
  },
});
