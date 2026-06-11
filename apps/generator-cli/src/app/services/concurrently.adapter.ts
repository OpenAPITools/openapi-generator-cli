import concurrently, {
  type ConcurrentlyCommandInput,
  type ConcurrentlyOptions,
  type ConcurrentlyResult,
} from 'concurrently';

export const runConcurrently = (
  commands: ConcurrentlyCommandInput[],
  options?: Partial<ConcurrentlyOptions>
): ConcurrentlyResult => concurrently(commands, options);
