import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Pixel Peeper',
    description: 'Turn any live webpage into a design lesson.',
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage'],
    action: { default_title: 'Open Pixel Peeper' },
  },
});
