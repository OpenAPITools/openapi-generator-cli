/* eslint-disable */
export default {
  displayName: 'generator-cli',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[cm]?[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(concurrently|glob|minimatch|path-scurry|lru-cache|jackspeak|package-json-from-dist|foreground-child|cross-spawn|signal-exit|which|proxy-agent|agent-base|http-proxy-agent|https-proxy-agent...))',
  ],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'html'],
  coverageDirectory: '../../coverage/apps/generator-cli',
};
