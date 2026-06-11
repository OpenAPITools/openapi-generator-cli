/* eslint-disable */
export default {
  displayName: 'generator-cli',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[cm]?[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(proxy-agent|agent-base|http-proxy-agent|https-proxy-agent|pac-proxy-agent|socks-proxy-agent|proxy-from-env|concurrently|chalk|supports-color|yargs|shell-quote|tree-kill|rxjs)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'html'],
  coverageDirectory: '../../coverage/apps/generator-cli',
  // snapshotFormat: { escapeString: true, printBasicPrototype: true },
};
