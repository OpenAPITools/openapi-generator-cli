import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  preset: 'ts-jest',
  projects: await getJestProjectsAsync(),
});
