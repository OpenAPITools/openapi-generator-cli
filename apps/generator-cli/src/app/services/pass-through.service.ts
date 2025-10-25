import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { exec, spawn } from 'child_process';
import { Command } from 'commander';
import * as os from 'os';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import { GeneratorService } from './generator.service';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';

@Injectable()
export class PassThroughService {
  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
    private readonly configService: ConfigService,
    private readonly generatorService: GeneratorService
  ) {}

  public async init() {
    this.program
      .allowUnknownOption()
      .option('--custom-generator <generator>', 'Custom generator jar');

    const commands = (await this.getCommands()).reduce((acc, [name, desc]) => {
      return acc.set(
        name,
        this.program
          .command(name, { hidden: !desc })
          .description(desc)
          .allowUnknownOption()
          .action((_, c) => this.passThrough(c))
      );
    }, new Map<string, ReturnType<Command['createCommand']>>());

    /*
     * Overwrite help command
     */
    commands.get('help').action((_, cmd) => {
      if (!cmd.args.length) {
        this.printHelp(this.program);
        return;
      }

      const [helpCmd] = cmd.args;
      if (commands.has(helpCmd)) {
        this.printHelp(commands.get(helpCmd));
      }

      this.passThrough(cmd);
    });

    /*
     * Overwrite generate command
     */
    commands
      .get('generate')
      .option(
        '--generator-key <generator...>',
        'Run generator by key. Separate by comma to run many generators'
      )
      .action(async (_, cmd) => {
        if (cmd.args.length === 0 || cmd.opts().generatorKey) {
          const customGenerator = this.program.opts()?.customGenerator;
          const generatorKeys = cmd.opts().generatorKey || [];

          if (this.generatorService.enabled) {
            // @todo cover by unit test
            if (
              !(await this.generatorService.generate(
                customGenerator,
                ...generatorKeys
              ))
            ) {
              this.logger.log(chalk.red('Code generation failed'));
              process.exit(1);
            }
            return;
          }
        }

        this.passThrough(cmd);
      });
  }

  public passThrough = (cmd: Command) => {
    const args = [cmd.name(), ...cmd.args];

    spawn(this.cmd(), args, {
      stdio: 'inherit',
      shell: true,
    }).on('exit', process.exit);
  };

  private getCommands = async (): Promise<[string, string | undefined][]> => {
    const [help, completion] = await Promise.all([
      this.run('help'),
      this.run('completion').catch(() => ''),
    ]);

    const commands = help
      .split('\n')
      .filter((line) => line.startsWith(' '))
      .map((line) =>
        line
          .trim()
          .match(/^([a-z-]+)\s+(.+)/i)
          .slice(1),
      )
      .reduce((acc, [cmd, desc]) => ({ ...acc, [cmd]: desc }), {});

    const allCommands = completion
      .split('\n')
      .map<string>((line) => line.trim())
      .filter((c) => c.length > 0 && c.indexOf('--') !== 0);

    for (const cmd of allCommands) {
      commands[cmd] = commands[cmd] || '';
    }

    return Object.entries(commands);
  };

  private run = (subCmd: string) =>
    new Promise<string>((resolve, reject) => {
      exec(`${this.cmd()} ${subCmd}`, (error, stdout, stderr) => {
        error ? reject(new Error(stderr)) : resolve(stdout);
      });
    });

  private cmd() {
    if (this.configService.useDocker) {
      const userInfo = os.userInfo();
      const userArg =
        userInfo.uid !== -1 ? `--user ${userInfo.uid}:${userInfo.gid}` : '';

      return [
        `docker run --rm`,
        userArg,
        `-v "${this.configService.cwd}:/local"`,
        this.versionManager.getDockerImageName(),
      ].join(' ');
    }

    const customGenerator = this.program.opts()?.customGenerator;
    const cliPath = this.versionManager.filePath();

    const subCmd = customGenerator
      ? `-cp "${[cliPath, customGenerator].join(
          this.isWin() ? ';' : ':'
        )}" org.openapitools.codegen.OpenAPIGenerator`
      : `-jar "${cliPath}"`;

    return ['java', process.env['JAVA_OPTS'], subCmd]
      .filter((str): str is string => str != null && typeof str === 'string')
      .join(' ');
  }

  private printHelp(cmd: Pick<Command, 'helpInformation'>) {
    console.log(chalk.cyanBright(cmd.helpInformation()));
  }

  private isWin = () => process.platform === 'win32';
}
