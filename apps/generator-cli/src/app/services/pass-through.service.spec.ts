import { Test } from '@nestjs/testing';
import chalk from 'chalk';
import { Command, createCommand } from 'commander';
import { EventEmitter } from 'events';
import { COMMANDER_PROGRAM, LOGGER } from '../constants';
import { GeneratorService } from './generator.service';
import { PassThroughService } from './pass-through.service';
import { VersionManagerService } from './version-manager.service';
import { ConfigService } from './config.service';

jest.mock('child_process');
jest.mock('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = jest.mocked(require('child_process'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = jest.mocked(require('fs'));

const makeChildProcess = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
};

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

    childProcess.spawn
      .mockReset()
      .mockImplementation(() => makeChildProcess());
    fs.existsSync.mockReset().mockReturnValue(true);
    configServiceMock.get.mockClear();
    configServiceMock.get.mockReset();
    configServiceMock.useDocker = false;
  });

  describe('API', () => {
    describe('init', () => {
      describe('the help command failed', () => {
        let error: Error;

        beforeEach(async () => {
          childProcess.spawn.mockImplementation(() => {
            const child = makeChildProcess();
            setImmediate(() => {
              child.stderr.emit('data', 'Some error');
              child.emit('close', 1);
            });
            return child;
          });
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
          childProcess.spawn.mockImplementation((command: string, args) => {
            const child = makeChildProcess();
            const invoked = [command, ...(args ?? [])].join(' ');
            const output = invoked.endsWith('/some/path/to/4.2.1.jar help')
              ? helpText
              : invoked.endsWith('/some/path/to/4.2.1.jar completion')
                ? completionText
                : undefined;

            setImmediate(() => {
              if (output !== undefined) {
                child.stdout.emit('data', output);
                child.emit('close', 0);
              }
            });
            return child;
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
                3,
                'docker',
                [
                  'run',
                  '--rm',
                  '-v',
                  '/foo/bar:/local',
                  'openapitools/openapi-generator-cli:v4.2.1',
                  name,
                  ...argv,
                ],
                {
                  stdio: 'inherit',
                  shell: false,
                }
              );
            });
          });

          it('can delegate', async () => {
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              ['-jar', '/some/path/to/4.2.1.jar', name, ...argv],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          it('can delegate with JAVA_OPTS', async () => {
            process.env['JAVA_OPTS'] = 'java-opt-1=1';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              ['java-opt-1=1', '-jar', '/some/path/to/4.2.1.jar', name, ...argv],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          it('passes JAVA_OPTS with a pipe character through as a single argument', async () => {
            process.env['JAVA_OPTS'] = '-Dhttp.nonProxyHosts=127.*|localhost';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              [
                '-Dhttp.nonProxyHosts=127.*|localhost',
                '-jar',
                '/some/path/to/4.2.1.jar',
                name,
                ...argv,
              ],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          it('splits quoted JAVA_OPTS into separate arguments without a shell', async () => {
            process.env['JAVA_OPTS'] =
              '-Dhttp.nonProxyHosts="127.*|localhost|*.local" -Dsome.opt=\'a b\'';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              [
                '-Dhttp.nonProxyHosts=127.*|localhost|*.local',
                '-Dsome.opt=a b',
                '-jar',
                '/some/path/to/4.2.1.jar',
                name,
                ...argv,
              ],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          // Unlike a POSIX shell, an unquoted backslash is NOT an escape
          // character here: JAVA_OPTS on Windows typically carries paths such
          // as C:\certs\client.jks, and shell-style escape handling would
          // silently strip the separators (C:certsclient.jks). Since the args
          // are handed to java verbatim (no shell in between), java itself
          // does not interpret the backslashes either, so keeping them is
          // always the faithful transfer of JAVA_OPTS. Escaping is only
          // interpreted inside double quotes, see the escaped quote tests
          // below.
          it('keeps backslashes of unquoted JAVA_OPTS verbatim', async () => {
            process.env['JAVA_OPTS'] =
              '-Djavax.net.ssl.keyStore=C:\\certs\\client.jks';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              [
                '-Djavax.net.ssl.keyStore=C:\\certs\\client.jks',
                '-jar',
                '/some/path/to/4.2.1.jar',
                name,
                ...argv,
              ],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          // Inside double quotes the backslash keeps its typical shell
          // meaning and escapes exactly the characters a shell would let it
          // escape (" \ $ `), so the \" of -Dfoo="a\"b" is passed to java as
          // a literal quote instead of ending the quoted segment early (and
          // the rest of JAVA_OPTS being parsed as unquoted input). Inside
          // single quotes a backslash has no special meaning at all.
          it('passes escaped quotes inside double-quoted JAVA_OPTS through to java', async () => {
            // runtime JAVA_OPTS: -Dfoo="a\"b" -Dbaz="c\\d" -Dqux='e\"f'
            process.env['JAVA_OPTS'] =
              '-Dfoo="a\\"b" -Dbaz="c\\\\d" -Dqux=\'e\\"f\'';
            await program.parseAsync([name, ...argv], { from: 'user' });
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              [
                '-Dfoo=a"b',
                '-Dbaz=c\\d',
                '-Dqux=e\\"f',
                '-jar',
                '/some/path/to/4.2.1.jar',
                name,
                ...argv,
              ],
              {
                stdio: 'inherit',
                shell: false,
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
              3,
              'java',
              [
                '-cp',
                ['/some/path/to/4.2.1.jar', '../some/custom.jar'].join(
                  cpDelimiter
                ),
                'org.openapitools.codegen.OpenAPIGenerator',
                name,
                ...argv,
              ],
              {
                stdio: 'inherit',
                shell: false,
              }
            );
          });

          it('can delegate with custom jar only when standard jar is missing', async () => {
            fs.existsSync.mockReturnValue(false);
            await program.parseAsync(
              [name, ...argv, '--custom-generator=../some/custom.jar'],
              { from: 'user' }
            );

            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              3,
              'java',
              ['-jar', '../some/custom.jar', name, ...argv],
              {
                stdio: 'inherit',
                shell: false,
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
                  // init() already spawned help and completion discovery
                  expect(childProcess.spawn).toHaveBeenCalledTimes(
                    spawn ? 3 : 2
                  );
                });

                spawn &&
                  it('spawns the correct process', () => {
                    expect(childProcess.spawn).toHaveBeenNthCalledWith(
                      3,
                      'java',
                      ['-jar', '/some/path/to/4.2.1.jar', ...cmd.split(' ')],
                      { stdio: 'inherit', shell: false }
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
