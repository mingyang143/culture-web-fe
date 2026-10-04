import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return defineConfig({
    plugins: [react()],
    define: {
      'process.env': JSON.stringify(env),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        assets: path.resolve(__dirname, 'src/assets'),
        components: path.resolve(__dirname, 'src/components'),
        configs: path.resolve(__dirname, 'src/configs'),
        contexts: path.resolve(__dirname, 'src/contexts'),
        pages: path.resolve(__dirname, 'src/pages'),
        types: path.resolve(__dirname, 'src/types'),
        utils: path.resolve(__dirname, 'src/utils'),
        data: path.resolve(__dirname, 'src/data'),
        services: path.resolve(__dirname, 'src/services'),
        themeStyles: path.resolve(__dirname, 'src/themeStyles')  // Add the alias for themeStyles
      },
    },
  });
};
