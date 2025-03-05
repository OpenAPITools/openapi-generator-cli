import {Inject, Injectable} from '@nestjs/common';
import * as path from 'path';
import {COMMANDER_PROGRAM, LOGGER} from '../constants';
import {set, get, has, merge} from 'lodash';
import * as fs from 'fs-extra';
import { Command } from 'commander';

@Injectable()
export class ConfigService {

  public readonly cwd = process.env.PWD || process.env.INIT_CWD || process.cwd()
  public readonly configFile = this.configFileOrDefault();

  private configFileOrDefault() {
    this.program.parseOptions(process.argv);
    const conf = this.program.opts().openapitools;

    if(!conf) {
      return path.resolve(this.cwd, 'openapitools.json');
    }

    return path.isAbsolute(conf) ? conf : path.resolve(this.cwd, conf);
  }

  public get useDocker()  {
    return this.get('generator-cli.useDocker', false);
  }

  public get dockerImageName()  {
    return this.get('generator-cli.dockerImageName', 'openapitools/openapi-generator-cli');
  }

  private readonly defaultConfig = {
    $schema: './node_modules/@openapitools/openapi-generator-cli/config.schema.json',
    spaces: 2,
    'generator-cli': {
      version: undefined,
    },
  }

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
  ) {
  }

  get<T = unknown>(path: string, defaultValue?: T): T {
    return get(this.read(), path, defaultValue)
  }

  has(path) {
    return has(this.read(), path)
  }

  set(path: string, value: unknown) {
    this.write(set(this.read(), path, value))
    return this
  }

  private read() {
    fs.ensureFileSync(this.configFile)

    const config = merge(
      this.defaultConfig,
      fs.readJSONSync(this.configFile, {throws: false, encoding: 'utf8'}),
    )

    return this.replacePlaceholders(config)
  }

  private write(config) {
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }

  private replacePlaceholders(config: any): any {
    const envVariables = Object.fromEntries(
      Object.entries(process.env).map(([key, value]) => [`env.${key}`, value])
    );
    const placeholders = {
      ...envVariables
    };
    const replacePlaceholderInString = (str: string): string => {
      return str.replace(/\${(.*?)}/g, (match, p1) => {
          const key = p1.trim();
          return placeholders[key] !== undefined ? placeholders[key] : match;
      });
    };
    const traverseAndReplace = (obj: any): any => {
        if (typeof obj === 'string') {
            return replacePlaceholderInString(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(item => traverseAndReplace(item));
        } else if (obj !== null && typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [key, traverseAndReplace(value)])
            );
        }
        return obj; // Return the value as is if it's not a string, array, or object
    };
    return traverseAndReplace(config);
  }
}
