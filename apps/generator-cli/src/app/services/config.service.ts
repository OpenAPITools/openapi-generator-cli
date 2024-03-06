import {Inject, Injectable} from '@nestjs/common';
import * as path from 'path';
import {LOGGER} from '../constants';
import {set, get, has, merge} from 'lodash';
import * as fs from 'fs-extra';
import { isWin } from '../helpers';

@Injectable()
export class ConfigService {

  public readonly cwd = isWin() ? process.cwd() : process.env.PWD || process.env.INIT_CWD || process.cwd()
  public readonly configFile = path.resolve(this.cwd, 'openapitools.json')

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

    return merge(
      this.defaultConfig,
      fs.readJSONSync(this.configFile, {throws: false, encoding: 'utf8'}),
    )
  }

  private write(config) {
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }

}
