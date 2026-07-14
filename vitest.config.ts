import { defineConfig } from 'vitest/config'

// 獨立於 vite.config.ts:測試不需要 PWA/build 插件，避免它們在測試環境下互相干擾
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
