import { Inject, Injectable } from '@nestjs/common';
import * as path from 'path';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import * as fs from 'fs-extra';
import { Command } from 'commander';

/**
 * Result of scanning argv for the global config options.
 */
export interface GlobalConfigArgs {
  /**
   * The value of the global `-c/--config <path>` option, if it was used before
   * the command name; `undefined` otherwise.
   */
  configPath: string | undefined;
  /**
   * The given argv without the global `-c/--config <path>` options, so they are
   * not seen (and not passed on) by the invoked command.
   */
  argvWithoutGlobalConfigArgs: string[];
}

/**
 * Extracts the global `-c/--config <path>` occurrences from `argv`.
 *
 * Only occurrences placed BEFORE the first positional argument (the command
 * name) belong to the CLI itself. Afterwards, `-c` and `--config` are options
 * of the invoked command — e.g. the Java generator defines its own
 * `generate -c, --config <config file>` — so the scan stops there and those
 * arguments are returned untouched.
 */
export function extractGlobalConfigArgs(argv: string[]): GlobalConfigArgs {
  const args = argv.slice(2); // skip the node executable and the script path
  const occurrences: Array<{ index: number; hasSeparateValue: boolean }> = [];

  let index = 0;
  while (index < args.length) {
    const arg = args[index];

    if (arg === '--openapitools') {
      // global option with a separate value, skip it and its value
      index += 2;
      continue;
    }
    if (arg.startsWith('--openapitools=')) {
      index += 1;
      continue;
    }
    if (arg === '-c' || arg === '--config') {
      occurrences.push({ index, hasSeparateValue: true });
      index += 2;
      continue;
    }
    if (arg.startsWith('--config=')) {
      occurrences.push({ index, hasSeparateValue: false });
      index += 1;
      continue;
    }
    if (arg.startsWith('-c') && arg.length > 2) {
      // attached value, e.g. -cfoo.json
      occurrences.push({ index, hasSeparateValue: false });
      index += 1;
      continue;
    }

    // the command name or an option of the invoked command:
    // everything from here on belongs to the command
    break;
  }

  if (occurrences.length === 0) {
    return { configPath: undefined, argvWithoutGlobalConfigArgs: argv };
  }

  const configArgs = new Set<number>();
  let configPath: string | undefined;
  for (const { index, hasSeparateValue } of occurrences) {
    configArgs.add(index);
    if (hasSeparateValue) {
      configArgs.add(index + 1);
      configPath = args[index + 1];
    } else if (args[index].startsWith('--config=')) {
      configPath = args[index].slice('--config='.length);
    } else {
      configPath = args[index].slice(2);
    }
  }

  return {
    configPath,
    argvWithoutGlobalConfigArgs: [
      ...argv.slice(0, 2),
      ...args.filter((_, i) => !configArgs.has(i)),
    ],
  };
}

@Injectable()
export class ConfigService {
  /**
   * Environment variable pointing to an openapitools.json outside of the cwd.
   * Precedence: cli option (-c/--config or --openapitools) > env var > ./openapitools.json
   */
  public static readonly envConfigVariable = 'OPENAPI_GENERATOR_CLI_CONFIG';

  public readonly cwd =
    process.env.PWD || process.env.INIT_CWD || process.cwd();
  public readonly configFile = this.configFileOrDefault();

  private configFileOrDefault() {
    this.program.parseOptions(process.argv);
    const opts = this.program.opts();
    const globalConfigArgs = extractGlobalConfigArgs(process.argv);
    const explicitConfigPath =
      opts.openapitools ||
      globalConfigArgs.configPath ||
      process.env[ConfigService.envConfigVariable];

    if (!explicitConfigPath) {
      return path.resolve(this.cwd, 'openapitools.json');
    }

    const configPath = path.isAbsolute(explicitConfigPath)
      ? explicitConfigPath
      : path.resolve(this.cwd, explicitConfigPath);

    if (!fs.existsSync(configPath)) {
      this.logger.error(
        `Config file not found at "${configPath}". It was set via ${
          opts.openapitools || globalConfigArgs.configPath
            ? 'the -c/--config or --openapitools option'
            : `the ${ConfigService.envConfigVariable} environment variable`
        }. Please make sure the file exists, or unset it to use the default ./openapitools.json.`,
      );
      process.exit(1);
    }

    return configPath;
  }

  public get useDocker() {
    return this.get('generator-cli.useDocker', false);
  }

  public get dockerImageName() {
    return this.get('generator-cli.dockerImageName', 'openapitools/openapi-generator-cli');
  }

  private readonly defaultConfig = {
    $schema:
      './node_modules/@openapitools/openapi-generator-cli/config.schema.json',
    spaces: 2,
    'generator-cli': {
      version: undefined,
    },
  };

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
  ) {}

  get<T = unknown>(path: string, defaultValue?: T): T {
    const getPath = (
      obj: Record<string, unknown> | unknown,
      keys: string[],
    ): unknown => {
      if (!obj || keys.length === 0) return obj;

      const [head, ...tail] = keys;

      if (tail.length === 0) {
        return obj[head];
      }

      return getPath(obj[head], tail);
    };

    const raw = getPath(this.read(), path.split('.')) as Record<
      string,
      unknown
    >;

    const resolved = this.replacePlaceholders(raw) as T;

    return resolved !== undefined ? resolved : defaultValue;
  }

  has(path: string) {
    const hasPath = (
      obj: Record<string, unknown> | unknown,
      keys: string[],
    ): boolean => {
      if (!obj || keys.length === 0) return false;

      const [head, ...tail] = keys;

      if (tail.length === 0) {
        return Object.prototype.hasOwnProperty.call(obj, head);
      }

      return hasPath(obj[head] as Record<string, unknown>, tail);
    };

    return hasPath(this.read(), path.split('.'));
  }

  set(path: string, value: unknown) {
    const setPath = (
      obj: object,
      keys: string[],
      val: unknown,
    ): object => {
      const [head, ...tail] = keys;

      if (tail.length === 0) {
        obj[head] = val;
        return obj;
      }

      if (!obj[head] || typeof obj[head] !== 'object') {
        obj[head] = {};
      }

      setPath(obj[head] as Record<string, unknown>, tail, val);
      return obj;
    };

    const config = this.read();
    this.write(setPath(config, path.split('.'), value));
    return this;
  }

  private read() {
    const deepMerge = (
      target: Record<string, unknown>,
      source: object,
    ): Record<string, unknown> => {
      if (!source || typeof source !== 'object') return target;

      const result = { ...target };

      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key])
          ) {
            const value = (result[key] || {}) as Record<string, unknown>;
            result[key] = deepMerge(value, source[key]);
          } else {
            result[key] = source[key];
          }
        }
      }

      return result;
    };

    const fileConfig =
      fs.readJSONSync(this.configFile, { throws: false, encoding: 'utf8' }) ??
      {};

    return deepMerge(this.defaultConfig, fileConfig);
  }

  private replacePlaceholders(config: Record<string, unknown>): Record<string, unknown> {
    const replacePlaceholderInString = (inputString: string): string => {
      return inputString.replace(/\${(.*?)}/g, (fullMatch, placeholderKey) => {
        const environmentVariableKey = placeholderKey.startsWith('env.')
          ? placeholderKey.substring(4)
          : placeholderKey;

        const environmentVariableValue = process.env[environmentVariableKey];

        if (environmentVariableValue === undefined) {
          this.logger.error(
            `Environment variable for placeholder '${environmentVariableKey}' not found.`,
          );
          return fullMatch;
        }

        return environmentVariableValue;
      });
    };

    const traverseConfigurationObject = (
      configurationValue: unknown,
    ): unknown => {
      if (typeof configurationValue === 'string') {
        return replacePlaceholderInString(configurationValue);
      }
      if (Array.isArray(configurationValue)) {
        return configurationValue.map(traverseConfigurationObject);
      }
      if (configurationValue && typeof configurationValue === 'object') {
        return Object.fromEntries(
          Object.entries(configurationValue as Record<string, unknown>).map(
            ([propertyKey, propertyValue]) => [
              propertyKey,
              traverseConfigurationObject(propertyValue),
            ],
          ),
        );
      }
      return configurationValue;
    };

    return traverseConfigurationObject(config) as Record<string, unknown>;
  }

  private write(config) {
    fs.ensureFileSync(this.configFile);
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }
}
