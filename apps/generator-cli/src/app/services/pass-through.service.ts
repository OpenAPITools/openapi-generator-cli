import { Inject, Injectable } from '@nestjs/common';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import { Command } from 'commander';
import { isString, startsWith, trim } from 'lodash';
import * as chalk from 'chalk';
import { VersionManagerService } from './version-manager.service';
import { exec, spawn } from 'child_process';
import { GeneratorService } from './generator.service';

@Injectable()
export class PassThroughService {

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly generatorService: GeneratorService
  ) {
  }

  public async init() {

    (await this.getCommands()).forEach(([command, desc]) => {
      this.program
        .command(command, { hidden: !desc })
        .allowUnknownOption()
        .option("--custom-generator <generator>", "Custom generator to use alongside 'generate'", "")
        .description(desc)
        .action(async (cmd: Command) => {
          const args = cmd.parseOptions(cmd.args).unknown;
          if (args.length === 0) {
            switch (cmd.name()) {
              case 'help':
                console.log(this.program.helpInformation());
                console.log(cmd.helpInformation());
                return;
              case 'generate':
                if (this.generatorService.enabled) {
                  if (!await this.generatorService.generate()) {
                    this.logger.log(chalk.red('Code generation failed'));
                    process.exit(1);
                  }
                  return;
                }
            }
          }

          this.passThrough([cmd.name(), ...args], cmd.opts().customGenerator);
        });
    });

  }

  public passThrough = (args: string[] = [], customGenerator: string) =>
    spawn(this.cmd(customGenerator), args, {
      stdio: 'inherit',
      shell: true
    }).on('exit', process.exit);

  private getCommands = async (): Promise<[string, string | undefined][]> => {

    const [help, completion] = (await Promise.all([
      this.run('help'),
      this.run('completion').catch(() => '')
    ]));

    const commands = help.split('\n')
      .filter(line => startsWith(line, ' '))
      .map<string>(trim)
      .map(line => line.match(/^([a-z-]+)\s+(.+)/i).slice(1))
      .reduce((acc, [cmd, desc]) => ({ ...acc, [cmd]: desc }), {});

    const allCommands = completion.split('\n')
      .map<string>(trim)
      .filter(c => c.length > 0 && c.indexOf('--') !== 0);

    for (const cmd of allCommands) {
      commands[cmd] = commands[cmd] || '';
    }

    return Object.entries(commands);

  };

  private run = (subCmd: string) => new Promise<string>((resolve, reject) => {
    exec(`${this.cmd()} ${subCmd}`, (error, stdout, stderr) => {
      error ? reject(new Error(stderr)) : resolve(stdout);
    });
  });

  private cmd(customJarPath = '') {
    const cliPath = this.versionManager.filePath();
    const cpDelimiter = process.platform === "win32" ? ';' : ':';
    const subCmd = customJarPath
      ? `-cp "${[cliPath, customJarPath].join(cpDelimiter)}" org.openapitools.codegen.OpenAPIGenerator`
      : `-jar "${cliPath}"`;
    return ['java', process.env['JAVA_OPTS'], subCmd].filter(isString).join(' ');
  }

}
