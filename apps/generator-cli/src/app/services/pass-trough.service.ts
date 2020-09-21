import {Inject, Injectable} from '@nestjs/common';
import {COMMANDER_PROGRAM} from '../constants';
import {Command} from 'commander';
import {startsWith, trim} from 'lodash';
import {VersionManagerService} from './version-manager.service';
import {exec, spawn} from 'child_process';

@Injectable()
export class PassTroughService {

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly versionManager: VersionManagerService,
  ) {
  }

  public async init() {

    (await this.help())
      .split('\n')
      .filter(line => startsWith(line, ' '))
      .map(trim)
      .map(line => line.match(/^([a-z\-]+)\s+(.+)/i).slice(1))
      .forEach(([command, desc]) => {
        this.program.command(command).description(desc).action((cmd: Command) => {

          if (cmd.name() === 'help' && cmd.args.length === 0) {
            console.log(this.program.helpInformation())
            return;
          }

          this.passTrough([cmd.name(), ...cmd.args])
        });
      })

  }

  public passTrough = (args: string[] = []) => spawn(this.cmd(), args, {
    stdio: 'inherit',
    shell: true
  }).on('exit', process.exit);

  private help = () => new Promise<string>((resolve, reject) => {
    exec(`${this.cmd()} help`, (error, stdout, stderr) => {
      error ? reject(stderr) : resolve(stdout)
    })
  });

  private cmd(args?: string[]) {
    const binPath = this.versionManager.filePath(this.versionManager.getSelectedVersion())
    const cmd = `java ${process.env['JAVA_OPTS'] || ''} -jar "${binPath}"`;
    return args ? `${cmd} ${args.join(' ')}` : cmd
  }

}
