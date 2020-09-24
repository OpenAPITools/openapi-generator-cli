import {Injectable} from '@nestjs/common';
import {flatten, isString, upperFirst} from 'lodash';

import * as concurrently from 'concurrently';
import * as path from 'path';
import * as glob from 'glob';
import {VersionManagerService} from './version-manager.service';
import {ConfigService} from './config.service';

interface GeneratorConfig {
  glob: string
  disabled: boolean

  [key: string]: unknown
}

@Injectable()
export class GeneratorService {

  constructor(
    private readonly configService: ConfigService,
    private readonly versionManager: VersionManagerService,
  ) {
  }

  public async generate() {

    const cwd = this.configService.cwd
    const generators = this.configService.get<GeneratorConfig[]>('generator-cli.generators', [])
    const enabledGenerators = generators.filter(({disabled}) => disabled !== true)

    const commands = flatten(enabledGenerators.map(config => {
      const {glob: globPattern, disabled, ...params} = config
      return glob.sync(globPattern, {cwd}).map(spec => this.buildCommand(cwd, spec, params))
    }))

    await concurrently(commands)
  }

  private buildCommand(cwd: string, specFile: string, params: {}) {
    const absoluteSpecPath = path.resolve(cwd, specFile)

    const command = Object.entries({
      ['input-spec']: absoluteSpecPath,
      ...params,
    }).map(([k, v]) => {
      return typeof v === 'object' ? `--${k}="${Object.entries(v).map(z => z.join('=')).join(',')}"` : `--${k}="${v}"`
    }).join(' ')

    const ext = path.extname(absoluteSpecPath)
    const name = path.basename(absoluteSpecPath, ext)

    const placeholders: { [key: string]: string } = {
      name,
      Name: upperFirst(name),

      cwd,

      base: path.basename(absoluteSpecPath),
      dir: path.dirname(absoluteSpecPath),
      path: absoluteSpecPath,

      relDir: path.dirname(specFile),
      relPath: specFile,
      ext: ext.split('.').slice(-1).pop(),
    }

    return this.cmd(Object.entries(placeholders).reduce((cmd, [search, replacement]) => {
      return cmd.split(`#{${search}}`).join(replacement)
    }, command))
  }

  private cmd = (appendix: string) => [
    'java',
    process.env['JAVA_OPTS'],
    `-jar "${this.versionManager.filePath()}"`,
    'generate',
    appendix,
  ].filter(isString).join(' ');

}
