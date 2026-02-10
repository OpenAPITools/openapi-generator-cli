import { Test } from '@nestjs/testing';
import chalk from 'chalk';
import { Command, createCommand } from 'commander';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import { GeneratorService } from './generator.service';
import { PassThroughService } from './pass-through.service';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';

jest.mock('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = jest.mocked(require('child_process'));

describe('PassThroughService', () => {
  let fixture: PassThroughService;
  let program: Command;

  const log = jest.fn();
  const generate = jest.fn().mockResolvedValue(true);
  const getSelectedVersion = jest.fn().mockReturnValue('4.2.1');
  const filePath = jest.fn().mockReturnValue(`/some/path/to/4.2.1.jar`);
  const configServiceMock = {
    useDocker: false,
    get: jest.fn(),
    cwd: '/foo/bar',
  };

  const getCommand = (name: string) =>
    program.commands.find((c) => c.name() === name);

  beforeEach(async () => {
    program = createCommand();
    jest.spyOn(program, 'helpInformation');

    const moduleRef = await Test.createTestingModule({
      providers: [
        PassThroughService,
        {
          provide: VersionManagerService,
          useValue: {
            filePath,
            getSelectedVersion,
            getDockerImageName: (v) =>
              `openapitools/openapi-generator-cli:v${
                v || getSelectedVersion()
              }`,
          },
        },
        { provide: GeneratorService, useValue: { generate, enabled: true } },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: COMMANDER_PROGRAM, useValue: program },
        { provide: LOGGER, useValue: { log } },
      ],
    }).compile();

    fixture = moduleRef.get(PassThroughService);

    childProcess.spawn.mockReset().mockReturnValue({ on: jest.fn() });
    configServiceMock.get.mockClear();
    configServiceMock.get.mockReset();
    configServiceMock.useDocker = false;
  });

  describe('API', () => {
    describe('init', () => {
      describe('the help command failed', () => {
        let error: Error;

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) =>
            cb(true, undefined, 'Some error')
          );
          try {
            await fixture.init();
          } catch (e) {
            error = e;
          }
        });

        it('throws the error', () => {
          expect(error.message).toEqual('Some error');
        });

        it('adds no commands', () => {
          expect(program.commands).toHaveLength(0);
        });
      });

      describe('the help command works', () => {
        const helpText = [
          'usage: openapi-generator-cli <command> [<args>]',
          '',
          'The most commonly used openapi-generator-cli commands are:',
          '    author        Utilities for authoring generators or customizing templates.',
          '    config-help   Config help for chosen lang',
          '    generate      Generate code with the specified generator.',
          '    help          Display help information about openapi-generator',
          '    list          Lists the available generators',
          '    meta          MetaGenerator. Generator for creating a new template set and configuration for Codegen.  The output will be based on the language you specify, and includes default templates to include.',
          '    validate      Validate specification',
          '    version       Show version information used in tooling',
          '',
          `See 'openapi-generator-cli help <command>' for more information on a specific`,
          'command.',
        ].join('\n');

        const completionText = [
          '  list',
          '  generate',
          '  meta',
          '  help',
          '  config-help',
          '  validate',
          '  version',
          '  completion',
          '  batch',
          '  --version',
          '  --help',
        ].join('\n');

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => {
            if (cmd.endsWith('"/some/path/to/4.2.1.jar" help')) {
              cb(undefined, helpText);
            }

            if (cmd.endsWith('"/some/path/to/4.2.1.jar" completion')) {
              cb(undefined, completionText);
            }
          });
          await fixture.init();
        });

        it('adds 10 commands', () => {
          expect(program.commands).toHaveLength(10);
        });

        describe.each([
          [
            'author',
            'Utilities for authoring generators or customizing templates.',
          ],
          ['config-help', 'Config help for chosen lang'],
          ['generate', 'Generate code with the specified generator.'],
          ['help', 'Display help information about openapi-generator'],
          ['list', 'Lists the available generators'],
          [
            'meta',
            'MetaGenerator. Generator for creating a new template set and configuration for Codegen.  The output will be based on the language you specify, and includes default templates to include.',
          ],
          ['validate', 'Validate specification'],
          ['version', 'Show version information used in tooling'],
          ['batch', ''],
          ['completion', ''],
        ])('%s', (name, desc) => {
          let cmd: Command;
          const argv = ['foo', 'baz'];

          beforeEach(() => {
            cmd = getCommand(name);
            delete process.env['JAVA_OPTS'];
          });

          it('adds the correct description', () => {
            expect(cmd.description()).toEqual(desc);
          });

          it('allows unknown options', () => {
            expect(cmd['_allowUnknownOption']).toBeTruthy();
          });

          describe('useDocker is true', () => {
            beforeEach(() => {
              configServiceMock.useDocker = true;
            });

            it('delegates to docker', async () => {
              await program.parseAsync([name, ...argv], { from: 'user' });
              expect(childProcess.spawn).toHaveBeenNthCalledWith(
                1,
                `docker run --rm -v "/foo/bar:/local" openapitools/openapi-generator-cli:v4.2.1 ${name} ${argv.join(' ')}`,
                {
                  stdio: 'inherit',
                  shell: true,
                }
              );
            });
          });

          it('can delegate', async () => {
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              `java -jar "/some/path/to/4.2.1.jar" ${name} ${argv.join(' ')}`,
              {
                stdio: 'inherit',
                shell: true,
              }
            );
          });

          it('can delegate with JAVA_OPTS', async () => {
            process.env['JAVA_OPTS'] = 'java-opt-1=1';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              `java java-opt-1=1 -jar "/some/path/to/4.2.1.jar" ${name} ${argv.join(' ')}`,
              {
                stdio: 'inherit',
                shell: true,
              }
            );
          });

          it('can delegate with custom jar', async () => {
            await program.parseAsync(
              [name, ...argv, '--custom-generator=../some/custom.jar'],
              { from: 'user' }
            );
            const cpDelimiter = process.platform === 'win32' ? ';' : ':';

            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              `java -cp "${[
                '/some/path/to/4.2.1.jar',
                '../some/custom.jar',
              ].join(cpDelimiter)}" org.openapitools.codegen.OpenAPIGenerator ${name} ${argv.join(' ')}`,
              {
                stdio: 'inherit',
                shell: true,
              }
            );
          });

          if (name === 'generate') {
            it('can delegate with custom jar to generate command', async () => {
              await program.parseAsync(
                [
                  name,
                  ...argv,
                  '--generator-key=genKey',
                  '--custom-generator=../some/custom.jar',
                ],
                { from: 'user' }
              );

              expect(generate).toHaveBeenNthCalledWith(
                1,
                '../some/custom.jar',
                'genKey'
              );
            });
          }
        });

        describe('command behavior', () => {
          describe('help', () => {
            const programHelp = () =>
              chalk.cyanBright(program.helpInformation());
            const commandHelp = (name: string) => () =>
              chalk.cyanBright(getCommand(name).helpInformation());

            describe.each`
              cmd                | helpText                   | spawn
              ${'help'}          | ${programHelp}             | ${undefined}
              ${'help generate'} | ${commandHelp('generate')} | ${'a'}
              ${'help author'}   | ${commandHelp('author')}   | ${'b'}
              ${'help hidden'}   | ${undefined}               | ${'c'}
            `('$cmd', ({ cmd, helpText, spawn }) => {
              let spy: jest.SpyInstance;

              beforeEach(async () => {
                spy = jest
                  .spyOn(console, 'log')
                  .mockClear()
                  .mockImplementation();
                await program.parseAsync(cmd.split(' '), { from: 'user' });
              });

              describe('help text', () => {
                it(`logs ${helpText ? 1 : 0} times`, () => {
                  expect(spy).toHaveBeenCalledTimes(helpText ? 1 : 0);
                });

                helpText &&
                  it('prints the correct help text', () => {
                    expect(spy).toHaveBeenCalledWith(helpText());
                  });
              });

              describe('process spawn', () => {
                it(`spawns ${spawn ? 1 : 0} times`, () => {
                  expect(childProcess.spawn).toHaveBeenCalledTimes(
                    spawn ? 1 : 0
                  );
                });

                spawn &&
                  it('spawns the correct process', () => {
                    expect(childProcess.spawn).toHaveBeenNthCalledWith(
                      1,
                      `java -jar "/some/path/to/4.2.1.jar" ${cmd}`,
                      { stdio: 'inherit', shell: true }
                    );
                  });
              });
            });
          });
        });
      });
    });
  });
});
