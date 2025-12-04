import { Inject, Injectable } from '@nestjs/common';
import * as path from 'path';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import * as fs from 'fs-extra';
import { Command } from 'commander';

@Injectable()
export class ConfigService {

  public readonly cwd = process.env.PWD || process.env.INIT_CWD || process.cwd();
  public readonly configFile = this.configFileOrDefault();

  private configFileOrDefault() {
    this.program.parseOptions(process.argv);
    const conf = this.program.opts().openapitools;

    if (!conf) {
      return path.resolve(this.cwd, 'openapitools.json');
    }

    return path.isAbsolute(conf) ? conf : path.resolve(this.cwd, conf);
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

    const result = getPath(this.read(), path.split('.')) as T;
    return result !== undefined ? result : defaultValue;
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

    fs.ensureFileSync(this.configFile);

    const config = deepMerge(
      this.defaultConfig,
      fs.readJSONSync(this.configFile, { throws: false, encoding: 'utf8' }),
    );

    return this.replacePlaceholders(config);
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
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }
}
