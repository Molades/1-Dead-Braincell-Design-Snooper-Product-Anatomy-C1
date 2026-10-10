import { defineConfig } from 'wxt';

export default defineConfig({
  // Visible folder (not .output) so it is easy to pick in Chrome's "Load unpacked" dialog.
  outDir: 'dist',
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    permissions: ['activeTab', 'storage'],
    // Only the AI provider; page access comes from activeTab when the user clicks the action.
    host_permissions: ['https://api.anthropic.com/*'],
    action: { default_title: 'Open Pixel Peeper' },
    web_accessible_resources: [{ resources: ['detective-poses.png'], matches: ['<all_urls>'] }],
  },
});
