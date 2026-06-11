/* eslint-disable */
export default {
  displayName: 'generator-cli',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[cm]?[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(glob|minimatch|path-scurry|lru-cache|jackspeak|package-json-from-dist|foreground-child|cross-spawn|signal-exit|which|proxy-agent|agent-base|http-proxy-agent|https-proxy-agent|pac-proxy-agent|socks-proxy-agent|proxy-from-env)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'html'],
  coverageDirectory: '../../coverage/apps/generator-cli',
  // snapshotFormat: { escapeString: true, printBasicPrototype: true },
};
