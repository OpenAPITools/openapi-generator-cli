/* eslint-disable */
export default {
  displayName: 'generator-cli',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/generator-cli',
  // snapshotFormat: { escapeString: true, printBasicPrototype: true },
};
