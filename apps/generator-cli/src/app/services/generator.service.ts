import { Inject, Injectable } from '@nestjs/common';
import { flatten, isString, kebabCase, sortBy, upperFirst } from 'lodash';

import concurrently from 'concurrently';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as glob from 'glob';
import chalk from 'chalk';
import * as os from 'os';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';
import { LOGGER } from '../constants';
import { javaCmd } from '../helpers';

interface GeneratorConfig {
  glob: string;
  disabled: boolean;

  [key: string]: unknown;
}

@Injectable()
export class GeneratorService {
  private readonly configPath = 'generator-cli.generators';
  public readonly enabled = this.configService.has(this.configPath);

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    private readonly configService: ConfigService,
    private readonly versionManager: VersionManagerService
  ) {}

  public async generate(customGenerator?: string, ...keys: string[]) {
    const cwd = this.configService.cwd;
    const generators = Object.entries(
      this.configService.get<{ [name: string]: GeneratorConfig }>(
        this.configPath,
        {}
      )
    );
    const enabledGenerators = generators
      .filter(([key, { disabled }]) => {
        if (!disabled) return true;
        this.logger.log(
          chalk.grey(
            `[info] Skip ${chalk.yellow(
              key
            )}, because this generator is disabled`
          )
        );
        return false;
      })
      .filter(([key]) => {
        if (!keys.length || keys.includes(key)) return true;
        this.logger.log(
          chalk.grey(
            `[info] Skip ${chalk.yellow(key)}, because only ${keys
              .map((k) => chalk.yellow(k))
              .join(', ')} shall run`
          )
        );
        return false;
      });

    const globsWithNoMatches = [];

    const commands = flatten(
      enabledGenerators.map(([name, config]) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { glob: globPattern, disabled, ...params } = config;

        if (!globPattern) {
          return [
            {
              name: `[${name}] ${params.inputSpec}`,
              command: this.buildCommand(cwd, params, customGenerator),
            },
          ];
        }

        const specFiles = glob.sync(globPattern, { cwd });

        if (specFiles.length < 1) {
          globsWithNoMatches.push(globPattern);
        }

        return glob.sync(globPattern, { cwd }).map((spec) => ({
          name: `[${name}] ${spec}`,
          command: this.buildCommand(cwd, params, customGenerator, spec),
        }));
      })
    );

    const generated =
      commands.length > 0 &&
      (await (async () => {
        try {
          this.printResult(await concurrently(commands, { maxProcesses: 10 }));
          return true;
        } catch (e) {
          this.printResult(e);
          return false;
        }
      })());

    globsWithNoMatches.map((g) =>
      this.logger.log(
        chalk.yellow(`[warn] Did not found any file matching glob "${g}"`)
      )
    );
    return generated;
  }

  private printResult(
    res: { command: concurrently.CommandObj; exitCode: number }[]
  ) {
    this.logger.log(
      sortBy(res, 'command.name')
        .map(({ exitCode, command }) => {
          const failed = exitCode > 0;
          return [
            chalk[failed ? 'red' : 'green'](command.name),
            ...(failed ? [chalk.yellow(`  ${command.command}\n`)] : []),
          ].join('\n');
        })
        .join('\n')
    );
  }

  private buildCommand(
    cwd: string,
    params: Record<string, unknown>,
    customGenerator?: string,
    specFile?: string
  ) {
    const dockerVolumes = {};
    const absoluteSpecPath = specFile
      ? path.resolve(cwd, specFile)
      : String(params.inputSpec);

    const ext = path.extname(absoluteSpecPath);
    const name = path.basename(absoluteSpecPath, ext);

    const placeholders: { [key: string]: string } = {
      name,
      Name: upperFirst(name),

      cwd,

      base: path.basename(absoluteSpecPath),
      dir: specFile && path.dirname(absoluteSpecPath),
      path: absoluteSpecPath,

      relDir: specFile && path.dirname(specFile),
      relPath: specFile,
      ext: ext.split('.').slice(-1).pop(),
    };

    const command = Object.entries({
      inputSpec: absoluteSpecPath,
      ...params,
    })
      .map(([k, v]) => {
        const key = kebabCase(k);
        const value = (() => {
          switch (typeof v) {
            case 'object':
              return `"${Object.entries(v)
                .map((z) => z.join('='))
                .join(',')}"`;
            case 'number':
            case 'bigint':
              return `${v}`;
            case 'boolean':
              return undefined;
            default:
              if (this.configService.useDocker) {
                v = this.replacePlaceholders(placeholders, v);

                if (key === 'output') {
                  fs.ensureDirSync(v);
                }

                if (fs.existsSync(v)) {
                  dockerVolumes[`/local/${key}`] = path.resolve(cwd, v);
                  return `"/local/${key}"`;
                }
              }

              return `"${v}"`;
          }
        })();

        return value === undefined ? `--${key}` : `--${key}=${value}`;
      })
      .join(' ');

    return this.cmd(
      customGenerator,
      this.replacePlaceholders(placeholders, command),
      dockerVolumes
    );
  }

  private replacePlaceholders(
    placeholders: Record<string, string>,
    input: string
  ) {
    return Object.entries(placeholders)
      .filter(([, replacement]) => !!replacement)
      .reduce((acc, [search, replacement]) => {
        return acc.split(`#{${search}}`).join(replacement);
      }, input);
  }

  private cmd = (
    customGenerator: string | undefined,
    appendix: string,
    dockerVolumes = {}
  ) => {
    if (this.configService.useDocker) {
      const volumes = Object.entries(dockerVolumes)
        .map(([k, v]) => `-v "${v}:${k}"`)
        .join(' ');
      const userInfo = os.userInfo();
      const userArg =
        userInfo.uid !== -1 ? `--user ${userInfo.uid}:${userInfo.gid}` : ``;

      return [
        `docker run --rm`,
        userArg,
        volumes,
        this.versionManager.getDockerImageName(),
        'generate',
        appendix,
      ].join(' ');
    }

    const cliPath = this.versionManager.filePath();
    const subCmd = customGenerator
      ? `-cp "${[cliPath, customGenerator].join(
          this.isWin() ? ';' : ':'
        )}" org.openapitools.codegen.OpenAPIGenerator`
      : `-jar "${cliPath}"`;

    return [
      `"`,
      javaCmd,
      process.env['JAVA_OPTS'],
      subCmd,
      'generate',
      appendix,
      `"`,
    ]
      .filter(isString)
      .join(' ');
  };

  private isWin = () => process.platform === 'win32';
}
