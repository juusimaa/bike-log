import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 60000,
    outputDir: `../../.local/evidence/task9/results/${Date.now()}`,
    reporter: [
        ['list'],
        [
            'html',
            {
                outputFolder: '../../.local/evidence/task9/report',
                open: 'never',
            },
        ],
    ],
    use: {
        baseURL: 'http://127.0.0.1:3000',
        timezoneId: 'Europe/Helsinki',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: process.env.BIKELOG_E2E_MANAGED
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://127.0.0.1:3000',
              reuseExistingServer: false,
              timeout: 120000,
          },
    projects: [
        ...[
            ['desktop', 1440, 1000],
            ['tablet', 768, 1024],
            ['mobile', 390, 844],
        ].map(([name, width, height]) => ({
            name: `visual-${name}`,
            testMatch: /visual\.spec\.ts/,
            use: {
                browserName: 'chromium' as const,
                viewport: { width: Number(width), height: Number(height) },
            },
        })),
        {
            name: 'live-chromium',
            testMatch: /(workflow|errors)\.spec\.ts/,
            use: { browserName: 'chromium' },
        },
        {
            name: 'live-webkit',
            testMatch: /(workflow|errors)\.spec\.ts/,
            use: { browserName: 'webkit' },
        },
    ],
});
