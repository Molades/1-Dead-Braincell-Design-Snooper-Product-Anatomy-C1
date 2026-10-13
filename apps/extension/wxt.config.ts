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
    web_accessible_resources: [{ resources: ['detective-poses.png'], matches: ['<all_urls>'] }],
  },
});
