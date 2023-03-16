import {Inject, Injectable} from '@nestjs/common';
import {HttpService} from '@nestjs/axios';
import {catchError, map, switchMap} from 'rxjs/operators';
import {replace} from 'lodash';
import {Observable} from 'rxjs';
import {AxiosError} from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as Stream from 'stream';
import * as chalk from 'chalk';
import * as compare from 'compare-versions';
import {LOGGER} from '../constants';
import {ConfigService} from './config.service';
import * as configSchema from '../../config.schema.json';
import {spawn, spawnSync} from 'child_process';

export interface Version {
  version: string
  versionTags: string[]
  releaseDate: Date
  installed: boolean
  downloadLink: string
}

const mvn = {
  repo: 'https://search.maven.org',
  groupId: 'org.openapitools',
  artifactId: 'openapi-generator-cli'
};

@Injectable()
export class VersionManagerService {

  private customStorageDir = this.configService.get<string>('generator-cli.storageDir');

  public readonly storage = this.customStorageDir ? path.resolve(
    this.configService.cwd,
    this.customStorageDir.replace('~', os.homedir())
  ) : path.resolve(__dirname, './versions');

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    private httpService: HttpService,
    private configService: ConfigService
  ) {
  }

  getAll(): Observable<Version[]> {
    const queryUrl = this.replacePlaceholders(
      this.configService.get<string>('generator-cli.repository.queryUrl') ||
      configSchema.properties['generator-cli'].properties.repository.queryUrl.default
    );

    return this.httpService.get(queryUrl).pipe(
      map(({data}) => data.response.docs),
      map(docs => docs.map((doc) => ({
        version: doc.v,
        versionTags: [
          ...(doc.v.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)?.concat('stable') || []),
          ...(doc.v.match(/(^[0-9]+\.[0-9]+\.[0-9]+)-(([a-z]+)[0-9]?)$/) || [])
        ],
        releaseDate: new Date(doc.timestamp),
        installed: this.isDownloaded(doc.v),
        downloadLink: this.createDownloadLink(doc.v)
      }))),
      map(versions => {
        const latestVersion = this.filterVersionsByTags(versions, ['stable'])
          .sort((l, r) => compare(l.version, r.version)).pop();
        latestVersion.versionTags.push('latest'); // works, because it's a reference
        return versions;
      }),
      catchError((e) => {
        this.logger.log(chalk.red(`Unable to query repository, because of: "${e.message}"`));
        this.printResponseError(e);
        return [];
      })
    );
  }

  search(tags: string[]) {
    return this.getAll().pipe(map(versions => this.filterVersionsByTags(versions, tags)));
  }

  isSelectedVersion(versionName: string) {
    return versionName === this.getSelectedVersion();
  }

  getSelectedVersion() {
    return this.configService.get<string>('generator-cli.version');
  }

  getDockerImageName(versionName?: string) {
    return `${this.configService.dockerImageName}:v${versionName || this.getSelectedVersion()}`;
  }

  async setSelectedVersion(versionName: string) {
    const downloaded = await this.downloadIfNeeded(versionName);
    if (downloaded) {
      this.configService.set('generator-cli.version', versionName);
      this.logger.log(chalk.green(`Did set selected version to ${versionName}`));
    }
  }

  async remove(versionName: string) {
    if (this.configService.useDocker) {
      await new Promise<void>(resolve => {
        spawn('docker', ['rmi', this.getDockerImageName(versionName)], {
          stdio: 'inherit',
          shell: true
        }).on('exit', () => resolve())
      })
    } else {
      fs.removeSync(this.filePath(versionName));
    }

    this.logger.log(chalk.green(`Removed ${versionName}`));
  }

  async download(versionName: string) {
    this.logger.log(chalk.yellow(`Download ${versionName} ...`));

    if (this.configService.useDocker) {
      await new Promise<void>(resolve => {
        spawn('docker', ['pull', this.getDockerImageName(versionName)], {
          stdio: 'inherit',
          shell: true
        }).on('exit', () => resolve())
      })

      this.logger.log(chalk.green(`Downloaded ${versionName}`));
      return;
    }

    const downloadLink = this.createDownloadLink(versionName);
    const filePath = this.filePath(versionName);

    try {
      await this.httpService
        .get<Stream>(downloadLink, {responseType: 'stream'})
        .pipe(switchMap(res => new Promise(resolve => {
            fs.ensureDirSync(this.storage);
            const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'generator-cli-'));
            const temporaryFilePath = path.join(temporaryDirectory, versionName);
            const file = fs.createWriteStream(temporaryFilePath);
            res.data.pipe(file);
            file.on('finish', content => {
              fs.moveSync(temporaryFilePath, filePath, {overwrite: true});
              resolve(content);
            });
          })
        )).toPromise();

      if (this.customStorageDir) {
        this.logger.log(chalk.green(`Downloaded ${versionName} to custom storage location ${this.storage}`));
      } else {
        this.logger.log(chalk.green(`Downloaded ${versionName}`));
      }

      return true;
    } catch (e) {
      this.logger.log(chalk.red(`Download failed, because of: "${e.message}"`));
      this.printResponseError(e);

      return false;
    }
  }

  async downloadIfNeeded(versionName: string) {
    return this.isDownloaded(versionName) || this.download(versionName);
  }

  isDownloaded(versionName: string) {
    if (this.configService.useDocker) {
      const {status} = spawnSync('docker', ['image', 'inspect', this.getDockerImageName(versionName)]);
      return status === 0;
    }

    return fs.existsSync(path.resolve(this.storage, `${versionName}.jar`));
  }

  private filterVersionsByTags(versions: Version[], tags: string[]) {
    if (tags.length < 1) {
      return versions;
    }

    return versions.filter(v => tags.every(tag => {
      return v.versionTags.some(vTag => vTag.indexOf(tag) === 0);
    }));
  }

  private createDownloadLink(versionName: string) {
    return this.replacePlaceholders((
      this.configService.get<string>('generator-cli.repository.downloadUrl') ||
      configSchema.properties['generator-cli'].properties.repository.downloadUrl.default
    ), {versionName});
  }

  private replacePlaceholders(str: string, additionalPlaceholders = {}) {
    const placeholders = {
      ...additionalPlaceholders,
      groupId: replace(mvn.groupId, '.', '/'),
      artifactId: replace(mvn.artifactId, '.', '/'),
      'group.id': mvn.groupId,
      'artifact.id': mvn.artifactId
    };

    for (const [k, v] of Object.entries(placeholders)) {
      str = str.split(`$\{${k}}`).join(v);
    }

    return str;
  }

  private printResponseError(error: AxiosError) {
    if (error.isAxiosError) {
      this.logger.log(chalk.red('\nResponse:'));
      Object.entries(error.response.headers).forEach(a => this.logger.log(...a));
      this.logger.log();
      // @ts-expect-error: TS2339
      error.response.data.on('data', data => this.logger.log(data.toString('utf8')));
    }
  }

  public filePath(versionName = this.getSelectedVersion()) {
    return path.resolve(this.storage, `${versionName}.jar`);
  }

}
