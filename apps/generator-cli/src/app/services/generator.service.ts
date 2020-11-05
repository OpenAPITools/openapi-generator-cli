import { Inject, Injectable } from '@nestjs/common';
import { flatten, isString, kebabCase, sortBy, upperFirst } from 'lodash';

import * as concurrently from 'concurrently';
import * as path from 'path';
import * as glob from 'glob';
import * as chalk from 'chalk';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';
import { LOGGER } from '../constants';

interface GeneratorConfig {
  glob: string
  disabled: boolean

  [key: string]: unknown
}

@Injectable()
export class GeneratorService {

  private readonly configPath = 'generator-cli.generators';
  public readonly enabled = this.configService.has(this.configPath)

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    private readonly configService: ConfigService,
    private readonly versionManager: VersionManagerService,
  ) {
  }

  public async generate() {

    const cwd = this.configService.cwd
    const generators = Object.entries(this.configService.get<{ [name: string]: GeneratorConfig }>(this.configPath, {}))
    const enabledGenerators = generators.filter(([, {disabled}]) => disabled !== true)

    const globsWithNoMatches = []

    const commands = flatten(enabledGenerators.map(([name, config]) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {glob: globPattern, disabled, ...params} = config
      const specFiles = glob.sync(globPattern, {cwd})

      if (specFiles.length < 1) {
        globsWithNoMatches.push(globPattern)
      }

      return glob.sync(globPattern, {cwd}).map(spec => ({
        name: `[${name}] ${spec}`,
        command: this.buildCommand(cwd, spec, params),
      }))
    }))

    const generated = commands.length > 0 && await (async () => {
      try {
        this.printResult(await concurrently(commands, {maxProcesses: 10}))
        return true
      } catch (e) {
        this.printResult(e);
        return false
      }
    })()

    globsWithNoMatches.map(g => this.logger.log(chalk.yellow(`[warn] Did not found any file matching glob "${g}"`)))
    return generated

  }

  private printResult(res: { command: concurrently.CommandObj, exitCode: number }[]) {
    this.logger.log(sortBy(res, 'command.name').map(({exitCode, command}) => {
      const failed = exitCode > 0
      return [
        chalk[failed ? 'red' : 'green'](command.name),
        ...(failed ? [chalk.yellow(`  ${command.command}\n`)] : []),
      ].join('\n')
    }).join('\n'))
  }

  private buildCommand(cwd: string, specFile: string, params: Record<string, unknown>) {
    const absoluteSpecPath = path.resolve(cwd, specFile)

    const command = Object.entries({
      ['input-spec']: absoluteSpecPath,
      ...params,
    }).map(([k, v]) => {

      const key = kebabCase(k)
      const value = (() => {
        switch (typeof v) {
          case 'object':
            return `"${Object.entries(v).map(z => z.join('=')).join(',')}"`
          case 'number':
          case 'bigint':
            return `${v}`
          case 'boolean':
            return undefined
          default:
            return `"${v}"`
        }
      })()

      return value === undefined ? `--${key}` : `--${key}=${value}`
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
