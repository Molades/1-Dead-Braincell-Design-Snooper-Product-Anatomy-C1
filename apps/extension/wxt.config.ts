import { defineConfig } from 'wxt';

export default defineConfig({
  // Visible folder (not .output) so it is easy to pick in Chrome's "Load unpacked" dialog.
  outDir: 'dist',
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    // unlimitedStorage: ideas keep their captures. scripting: re-inject into tabs opened before an update.
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    // Only the AI providers; page access comes from activeTab when the user clicks the action.
    host_permissions: ['https://api.groq.com/*', 'https://api.anthropic.com/*'],
    action: { default_title: 'Open Pixel Peeper' },
    commands: { pick: { suggested_key: { default: 'Alt+P', mac: 'Alt+P' }, description: 'Pick an element to learn from' } },
    web_accessible_resources: [{ resources: ['poses/*.svg', 'fonts/*.woff2'], matches: ['<all_urls>'] }],
  },
});
