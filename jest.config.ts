import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  preset: 'ts-jest',
  moduleFileExtensions: ['ts', 'js', 'html'],
  transform: {
    '^.+\\.(ts|html)$': 'ts-jest',
  },
  projects: await getJestProjectsAsync(),
});
