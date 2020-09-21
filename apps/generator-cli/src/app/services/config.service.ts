import {Inject, Injectable} from '@nestjs/common';
import * as path from 'path';
import {LOGGER} from '../constants';
import {set, get} from 'lodash';
import * as fs from 'fs-extra';

@Injectable()
export class ConfigService {

  public readonly configFile = path.resolve(process.env.INIT_CWD || process.cwd(), 'openapitools.json')

  private readonly defaultConfig = {
    $schema: 'node_modules/@openapitools/openapi-generator-cli/config.schema.json',
    spaces: 2,
    'generator-cli': {
      version: undefined,
    },
  }

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
  ) {
  }

  get<T = any>(path: string): T {
    return get(this.read(), path)
  }

  set(path: string, value: any) {
    this.write(set(this.read(), path, value))
    return this
  }

  private read() {
    fs.ensureFileSync(this.configFile)
    return fs.readJSONSync(this.configFile, {throws: false, encoding: 'utf8'}) || this.defaultConfig
  }

  private write(config) {
    fs.ensureFileSync(this.configFile)
    fs.writeJSONSync(this.configFile, config, {encoding: 'utf8', spaces: config.spaces || 2})
  }

}
