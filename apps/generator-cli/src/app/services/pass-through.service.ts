import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
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
    const [command, ...args] = [...this.cmd(), cmd.name(), ...cmd.args];

    // Spawned as an args array without a shell so that characters which are
    // meaningful to a shell (e.g. the `|` in -Dhttp.nonProxyHosts=127.*|localhost
    // coming from JAVA_OPTS) reach the java process verbatim. This also avoids
    // the Node deprecation warning DEP0190.
    spawn(command, args, {
      stdio: 'inherit',
      shell: false,
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
      const [command, ...args] = [...this.cmd(), subCmd];
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, { shell: false });
      // decode the streams as utf8 so that a multi-byte character split
      // across two chunks is reassembled instead of being emitted as
      // replacement characters in the middle of the output
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child
        .on('error', reject)
        .on('close', (code) =>
          code === 0 ? resolve(stdout) : reject(new Error(stderr))
        );
    });

  /**
   * Returns the command which should be spawned as a proper argv array.
   * JAVA_OPTS is split into separate arguments so that a shell is not needed
   * (and must not misinterpret characters like `|` or `*`, see #1213).
   */
  private cmd(): string[] {
    if (this.configService.useDocker) {
      return [
        'docker',
        'run',
        '--rm',
        '-v',
        `${this.configService.cwd}:/local`,
        this.versionManager.getDockerImageName(),
      ];
    }

    const customGenerator =
      this.program.opts()?.customGenerator ||
      this.getCustomGeneratorFromArgs();
    const cliPath = this.versionManager.filePath();

    let subCmd: string[];
    if (customGenerator) {
      subCmd = fs.existsSync(cliPath)
        ? [
            '-cp',
            [cliPath, customGenerator].join(this.isWin() ? ';' : ':'),
            'org.openapitools.codegen.OpenAPIGenerator',
          ]
        : ['-jar', customGenerator];
    } else {
      subCmd = ['-jar', cliPath];
    }

    return ['java', ...this.splitArgs(process.env['JAVA_OPTS']), ...subCmd];
  }

  /**
   * Splits a string into arguments the way a shell tokenizes them, respecting
   * single and double quotes. A `|` inside JAVA_OPTS (legitimate for
   * -Dhttp.nonProxyHosts) therefore stays part of its argument instead of
   * splitting the command.
   *
   * Unlike a POSIX shell, a backslash is kept verbatim in unquoted tokens:
   * JAVA_OPTS on Windows regularly carries paths such as C:\certs\client.jks,
   * and treating the backslash as an escape character outside of quotes would
   * strip those separators (C:certsclient.jks). Backslash escapes are only
   * interpreted inside double quotes, where they follow the typical shell
   * rules (see below).
   */
  private splitArgs(input?: string): string[] {
    if (!input) {
      return [];
    }

    const args: string[] = [];
    let arg = '';
    let hasArg = false;
    let quote: '"' | "'" | undefined;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (quote) {
        // inside double quotes a backslash escapes exactly the characters a
        // typical shell would let it escape, so the `\"` of -Dfoo="a\"b"
        // becomes a literal quote instead of ending the quoted segment early
        if (
          char === '\\' &&
          quote === '"' &&
          ['"', '\\', '$', '`'].includes(input[i + 1])
        ) {
          arg += input[++i];
        } else if (char === quote) {
          quote = undefined;
        } else {
          arg += char;
        }
        continue;
      }

      switch (char) {
        case '"':
        case "'":
          quote = char;
          hasArg = true;
          break;
        case '\\':
          // keep backslashes verbatim in unquoted tokens so Windows paths in
          // JAVA_OPTS (e.g. C:\certs\client.jks) reach java unmodified; the
          // backslash is only an escape character inside double quotes
          arg += char;
          hasArg = true;
          break;
        default:
          if (/\s/.test(char)) {
            if (hasArg) {
              args.push(arg);
            }
            arg = '';
            hasArg = false;
          } else {
            arg += char;
            hasArg = true;
          }
      }
    }

    if (hasArg) {
      args.push(arg);
    }

    return args;
  }

  private printHelp(cmd: Pick<Command, 'helpInformation'>) {
    console.log(chalk.cyanBright(cmd.helpInformation()));
  }

  private getCustomGeneratorFromArgs(): string | undefined {
    for (let i = 0; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === '--custom-generator' && i + 1 < process.argv.length) {
        return process.argv[i + 1];
      }
      if (arg.startsWith('--custom-generator=')) {
        return arg.substring('--custom-generator='.length);
      }
    }
    return undefined;
  }

  private isWin = () => process.platform === 'win32';
}
