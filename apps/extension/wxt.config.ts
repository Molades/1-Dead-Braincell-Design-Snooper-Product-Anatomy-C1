import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    permissions: ['activeTab', 'storage'],
    action: { default_title: 'Open Pixel Peeper' },
    web_accessible_resources: [{ resources: ['detective-poses.png'], matches: ['<all_urls>'] }],
  },
});
