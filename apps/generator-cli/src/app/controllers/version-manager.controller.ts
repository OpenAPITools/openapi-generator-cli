import {Controller, Inject} from '@nestjs/common';
import {COMMANDER_PROGRAM} from '../constants';
import {Command} from 'commander';
import {Version, VersionManagerService} from '../services/version-manager.service';
import {UIService} from '../services/ui.service';

@Controller()
export class VersionManagerController {

  private readonly mainCommand = this.program
    .command('version-manager')
    .alias('vm')

  private readonly listCommand = this.mainCommand
    .command('list [versionTags...]')
    .description('lists all published versions')
    .alias('li')
    .option('-j, --json', 'print as json', false)
    .action(tags => this.list(tags))

  private readonly installCommand = this.mainCommand
    .command('install [versionTags...]')
    .description('installs a version. If there are several hits, a selection is displayed')
    .action(tags => this.install(tags))

  private readonly useCommand = this.mainCommand
    .command('use [versionTags...]')
    .description('installs a version. If there are several hits, a selection is displayed')
    .action(tags => this.use(tags))

  constructor(
    @Inject(COMMANDER_PROGRAM) private readonly program: Command,
    private readonly ui: UIService,
    private readonly service: VersionManagerService,
  ) {
  }

  private list = async (versionTags: string[]) => {
    const versions = await this.service.search(versionTags).toPromise()

    if (this.listCommand.opts().json) {
      console.log(JSON.stringify(versions, null, 2))
    } else {
      await this.table(false, versions)
    }
  };

  private install = async (versionTags: string[]) => {
    const versions = await this.service.search(versionTags).toPromise()

    if (versions.length === 1) {
      await this.service.install(versions[0].version)
    } else if (versions.length > 1) {
      const version = await this.table(true, versions)
      await this.service.install(version.version)
    } else {
      throw new Error('No installation candidate found')
    }
  };

  private use = async (versionTags: string[]) => {
    const versions = await this.service.search(versionTags).toPromise()

    const success = (v: Version) => console.log(`Set version "${v.version}"`)

    if (versions.length === 1) {
      success(await this.service.set(versions[0]))
    } else if (versions.length > 1) {
      const version = await this.table(true, versions)
      success(await this.service.set(version))
    } else {
      throw new Error('No installation candidate found')
    }
  };

  private table = (interactive: boolean, versions: Version[]) => this.ui.table({
    interactive,
    printColNum: false,
    message: 'Please select a version to install',
    name: 'version',
    rows: versions.map(version => ({
      row: {
        version: version.version,
        installed: version.installed,
        versionTags: version.versionTags.sort().join(' '),
        releaseDate: version.releaseDate.toISOString(),
        jar: version.downloadLink,
      },
      short: version.version,
      value: version,
    })),
  });

}
