import { Test } from '@nestjs/testing'
import * as chalk from 'chalk'
import { Command, createCommand } from 'commander'
import { mocked } from 'ts-jest/utils'
import { COMMANDER_PROGRAM, LOGGER } from '../constants'
import { GeneratorService } from './generator.service'
import { PassThroughService } from './pass-through.service'
import { VersionManagerService } from './version-manager.service'

jest.mock('child_process')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = mocked(require('child_process'), true)

describe('PassThroughService', () => {

  let fixture: PassThroughService
  let program: Command

  const log = jest.fn()
  const generate = jest.fn().mockResolvedValue(true)
  const getSelectedVersion = jest.fn().mockReturnValue('4.2.1')
  const filePath = jest.fn().mockReturnValue(`/some/path/to/4.2.1.jar`)

  const getCommand = (name: string) => program.commands.find(c => c.name() === name);

  beforeEach(async () => {
    program = createCommand()
    jest.spyOn(program, 'helpInformation')

    const moduleRef = await Test.createTestingModule({
      providers: [
        PassThroughService,
        { provide: VersionManagerService, useValue: { filePath, getSelectedVersion } },
        { provide: GeneratorService, useValue: { generate, enabled: true } },
        { provide: COMMANDER_PROGRAM, useValue: program },
        { provide: LOGGER, useValue: { log } },
      ],
    }).compile()

    fixture = moduleRef.get(PassThroughService)

    childProcess.spawn.mockReset().mockReturnValue({ on: jest.fn() })

  })

  describe('API', () => {

    describe('init', () => {

      describe('the help command failed', () => {

        let error: Error

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => cb(true, undefined, 'Some error'))
          try {
            await fixture.init()
          } catch (e) {
            error = e
          }
        })

        it('throws the error', () => {
          expect(error.message).toEqual('Some error')
        })

        it('adds no commands', () => {
          expect(program.commands).toHaveLength(0)
        })
      })

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
          'command.'
        ].join('\n')

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
        ].join('\n')

        beforeEach(async () => {
          childProcess.exec.mockImplementation((cmd: string, cb) => {
            if (cmd.endsWith('"/some/path/to/4.2.1.jar" help')) {
              cb(undefined, helpText)
            }

            if (cmd.endsWith('"/some/path/to/4.2.1.jar" completion')) {
              cb(undefined, completionText)
            }
          })
          await fixture.init()
        })

        it('adds 10 commands', () => {
          expect(program.commands).toHaveLength(10)
        })

        describe.each([
          ['author', 'Utilities for authoring generators or customizing templates.'],
          ['config-help', 'Config help for chosen lang'],
          ['generate', 'Generate code with the specified generator.'],
          ['help', 'Display help information about openapi-generator'],
          ['list', 'Lists the available generators'],
          ['meta', 'MetaGenerator. Generator for creating a new template set and configuration for Codegen.  The output will be based on the language you specify, and includes default templates to include.'],
          ['validate', 'Validate specification'],
          ['version', 'Show version information used in tooling'],
          ['batch', ''],
          ['completion', ''],
        ])('%s', (name, desc) => {

          let cmd: Command
          const argv = ['foo', 'baz']

          beforeEach(() => {
            cmd = getCommand(name);
            delete process.env['JAVA_OPTS']
          })

          it('adds the correct description', () => {
            expect(cmd.description()).toEqual(desc)
          })

          it('allows unknown options', () => {
            expect(cmd['_allowUnknownOption']).toBeTruthy()
          })

          it('can delegate', async () => {
            await program.parseAsync([name, ...argv], { from: 'user' })
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              'java -jar "/some/path/to/4.2.1.jar"',
              [name, ...argv],
              {
                stdio: 'inherit',
                shell: true
              }
            )
          })

          it('can delegate with JAVA_OPTS', async () => {
            process.env['JAVA_OPTS'] = 'java-opt-1=1'
            await program.parseAsync([name, ...argv], { from: 'user' })
            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              'java java-opt-1=1 -jar "/some/path/to/4.2.1.jar"',
              [name, ...argv],
              {
                stdio: 'inherit',
                shell: true
              }
            )
          })

          it('can delegate with custom jar', async () => {
            await program.parseAsync([name, ...argv, '--custom-generator=../some/custom.jar'], { from: 'user' })
            const cpDelimiter = process.platform === 'win32' ? ';' : ':'

            expect(childProcess.spawn).toHaveBeenNthCalledWith(
              1,
              `java -cp "${['/some/path/to/4.2.1.jar', '../some/custom.jar'].join(cpDelimiter)}" org.openapitools.codegen.OpenAPIGenerator`,
              [name, ...argv],
              {
                stdio: 'inherit',
                shell: true
              }
            )
          })

          if (name === 'generate') {
            it('can delegate with custom jar to generate command', async () => {
              await program.parseAsync([name, ...argv, '--generator-key=genKey', '--custom-generator=../some/custom.jar'], { from: 'user' })
  
              expect(generate).toHaveBeenNthCalledWith(
                1,
                '../some/custom.jar',
                'genKey'
              )
            })
          }

          // if (name === 'help') {
          //   it('prints the help info and does not delegate, if args length = 0', async () => {
          //     childProcess.spawn.mockReset()
          //     cmd.args = []
          //     const logSpy = jest.spyOn(console, 'log').mockImplementation(noop)
          //     await program.parseAsync([name], { from: 'user' })
          //     expect(childProcess.spawn).toBeCalledTimes(0)
          //     expect(program.helpInformation).toBeCalledTimes(1)
          //     // expect(logSpy).toHaveBeenCalledTimes(2)
          //     expect(logSpy).toHaveBeenNthCalledWith(1, 'some help text')
          //     expect(logSpy).toHaveBeenNthCalledWith(2, 'has custom generator')
          //   })
          // }
          //
          // if (name === 'generate') {
          //   it('generates by using the generator config', async () => {
          //     childProcess.spawn.mockReset()
          //     await program.parseAsync([name], { from: 'user' })
          //     expect(childProcess.spawn).toBeCalledTimes(0)
          //     expect(generate).toHaveBeenNthCalledWith(1)
          //   })
          // }

        })

        describe('command behavior', () => {

          describe('help', () => {

            const programHelp = () => chalk.cyanBright(program.helpInformation());
            const commandHelp = (name: string) => () => chalk.cyanBright(getCommand(name).helpInformation());

            describe.each`
              cmd                | helpText                         | spawn
              ${'help'}          | ${programHelp}                   | ${undefined}
              ${'help generate'} | ${commandHelp('generate')} | ${'a'}
              ${'help author'}   | ${commandHelp('author')}   | ${'b'}
              ${'help hidden'}   | ${undefined}                     | ${'c'}
            `('$cmd', ({ cmd, helpText, spawn }) => {

              let spy: jest.SpyInstance;

              beforeEach(async () => {
                spy = jest.spyOn(console, 'log').mockClear().mockImplementation();
                await program.parseAsync(cmd.split(' '), { from: 'user' })
              })

              describe('help text', () => {
                it(`logs ${helpText ? 1 : 0} times`, () => {
                  expect(spy).toHaveBeenCalledTimes(helpText ? 1 : 0);
                })

                helpText && it('prints the correct help text', () => {
                  expect(spy).toHaveBeenCalledWith(helpText())
                })
              })

              describe('process spawn', () => {
                it(`spawns ${spawn ? 1 : 0} times`, () => {
                  expect(childProcess.spawn).toHaveBeenCalledTimes(spawn ? 1 : 0);
                })

                spawn && it('spawns the correct process', () => {

                  expect(childProcess.spawn).toHaveBeenNthCalledWith(
                    1,
                    'java -jar "/some/path/to/4.2.1.jar"',
                    cmd.split(' '),
                    {stdio: 'inherit', shell: true}
                  );

                })

              })

            })

          })

        })

      })

    })

  })

})
