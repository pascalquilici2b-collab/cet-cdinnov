import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('./integration',import.meta.url)),base:'/feuilles/',publicDir:false,plugins:[react()],build:{outDir:fileURLToPath(new URL('../../feuilles',import.meta.url)),emptyOutDir:false,target:'es2022'}});
