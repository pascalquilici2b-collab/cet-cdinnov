import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
const root=fileURLToPath(new URL('./',import.meta.url));
export default {
  root:resolve(root,'integration'),base:'./',publicDir:false,
  resolve:{alias:{'@':root}},plugins:[react()],
  css:{postcss:{plugins:[tailwind({base:root})]}},
  // Keep previously published assets for users with an already open tab.
  build:{outDir:resolve(root,'../../budgets-projets'),emptyOutDir:false},
};
