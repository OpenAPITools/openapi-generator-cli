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

  public useNpmrc()  {
    return this.get('generator-cli.useNpmrc', false);
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
    this.write(set(this.read(false), path, value))
    return this
  }

  private read(replaceEnvVars: boolean = true) {
    fs.ensureFileSync(this.configFile)

    const config =  merge(
      this.defaultConfig,
      fs.readJSONSync(this.configFile, {throws: false, encoding: 'utf8'}),
    )

    return replaceEnvVars ? replaceEnvPlaceholders(config) : config
  }

  private write(config) {
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }

}

function replaceEnvPlaceholders(config: any): any {
  const envPlaceholderPattern = /\${(\w+)}/g;

  const replacePlaceholders = (value: any): any => {
    if (typeof value === 'string') {
      return value.replace(envPlaceholderPattern, (_, varName) => {
        return process.env[varName] || `\${${varName}}`;
      });
    } else if (Array.isArray(value)) {
      return value.map(replacePlaceholders);
    } else if (typeof value === 'object' && value !== null) {
      return Object.keys(value).reduce((acc, key) => {
        acc[key] = replacePlaceholders(value[key]);
        return acc;
      }, {});
    }
    return value;
  };

  return replacePlaceholders(config);
}