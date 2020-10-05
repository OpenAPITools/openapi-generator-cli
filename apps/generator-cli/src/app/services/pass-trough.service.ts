import {Inject, Injectable} from '@nestjs/common';
import {COMMANDER_PROGRAM, LOGGER} from '../constants';
import {Command} from 'commander';
import {isString, startsWith, trim} from 'lodash';
import * as chalk from 'chalk';
import {VersionManagerService} from './version-manager.service';
import {exec, spawn} from 'child_process';
import {GeneratorService} from './generator.service';

@Injectable()
export class PassTroughService {

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly generatorService: GeneratorService,
  ) {
  }

  public async init() {

    (await this.completion())
      .split('\n')
      .map(trim)
      .forEach(([command, desc]) => {
        this.program.command(command).allowUnknownOption().description(desc).action(async (cmd: Command) => {

          if (cmd.args.length === 0) {
            switch (cmd.name()) {
              case 'help':
                console.log(this.program.helpInformation())
                return
              case 'generate':
                if (this.generatorService.enabled) {
                  if (!await this.generatorService.generate()) {
                    this.logger.log(chalk.red('Code generation failed'))
                    process.exit(1)
                  }
                  return
                }
            }
          }

          this.passTrough([cmd.name(), ...cmd.args])
        });
      })

  }

  public passTrough = (args: string[] = []) => spawn(this.cmd(), args, {
    stdio: 'inherit',
    shell: true
  }).on('exit', process.exit);

  private completion = () => new Promise<string>((resolve, reject) => {
    exec(`${this.cmd()} completion`, (error, stdout, stderr) => {
      error ? reject(new Error(stderr)) : resolve(stdout)
    })
  });

  private cmd() {
    return ['java', process.env['JAVA_OPTS'], `-jar "${this.versionManager.filePath()}"`].filter(isString).join(' ');
  }

}
