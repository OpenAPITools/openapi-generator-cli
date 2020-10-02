import {HttpService, Inject, Injectable} from '@nestjs/common';
import {map, switchMap} from 'rxjs/operators';
import {replace} from 'lodash';
import {Observable} from 'rxjs';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as Stream from 'stream';
import * as chalk from 'chalk';
import * as compare from 'compare-versions'
import {LOGGER} from '../constants';
import {ConfigService} from './config.service';

export interface Version {
  version: string
  versionTags: string[]
  releaseDate: Date
  installed: boolean
  downloadLink: string
}

const mvn = {
  repo: 'https://search.maven.org',
  group: 'org.openapitools',
  artifact: 'openapi-generator-cli',
}

@Injectable()
export class VersionManagerService {

  public readonly storage = path.resolve(__dirname, './versions')

  constructor(
    @Inject(LOGGER) private readonly logger: LOGGER,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
  }

  getAll(): Observable<Version[]> {
    const queryUrl = `${mvn.repo}/solrsearch/select?q=g:${mvn.group}+AND+a:${mvn.artifact}&core=gav&start=0&rows=200`;

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
        downloadLink: this.createDownloadLink(doc.v),
      }))),
      map(versions => {
        const latestVersion = this.filterVersionsByTags(versions, ['stable'])
          .sort((l, r) => compare(l.version, r.version)).pop()
        latestVersion.versionTags.push('latest') // works, because it's a reference
        return versions;
      })
    )
  }

  search(tags: string[]) {
    return this.getAll().pipe(map(versions => this.filterVersionsByTags(versions, tags)))
  }

  isSelectedVersion(versionName: string) {
    return versionName === this.getSelectedVersion()
  }

  getSelectedVersion() {
    return this.configService.get<string>('generator-cli.version')
  }

  async setSelectedVersion(versionName: string) {
    const downloaded = await this.downloadIfNeeded(versionName)
    if (downloaded) {
      this.configService.set('generator-cli.version', versionName)
      this.logger.log(chalk.green(`Did set selected version to ${versionName}`))
    }
  }

  async remove(versionName: string) {
    fs.removeSync(this.filePath(versionName))
    this.logger.log(chalk.green(`Removed ${versionName}`))
  }

  async download(versionName: string) {
    this.logger.log(chalk.yellow(`Download ${versionName} ...`))
    const downloadLink = this.createDownloadLink(versionName)
    const filePath = this.filePath(versionName)

    try {
      await this.httpService
        .get<Stream>(downloadLink, {responseType: 'stream'})
        .pipe(switchMap(res => new Promise(resolve => {
            fs.ensureDirSync(this.storage)
            const file = fs.createWriteStream(filePath);
            res.data.pipe(file)
            res.data.on('end', resolve);
          })
        )).toPromise()

      this.logger.log(chalk.green(`Downloaded ${versionName}`))
      return true
    } catch (e) {
      this.logger.log(chalk.red(`Download failed, because of: "${e.message}"`))
      return false
    }
  }

  async downloadIfNeeded(versionName: string) {
    return this.isDownloaded(versionName) || this.download(versionName)
  }

  isDownloaded(versionName: string) {
    return fs.existsSync(path.resolve(this.storage, `${versionName}.jar`))
  }

  private filterVersionsByTags(versions: Version[], tags: string[]) {
    if (tags.length < 1) {
      return versions
    }

    return versions.filter(v => tags.every(tag => {
      return v.versionTags.some(vTag => vTag.indexOf(tag) === 0)
    }))
  }

  private createDownloadLink(versionName: string) {
    const group = replace(mvn.group, '.', '/');
    const artifact = replace(mvn.artifact, '.', '/');
    return `https://repo1.maven.org/maven2/${group}/${artifact}/${versionName}/${artifact}-${versionName}.jar`
  }

  public filePath(versionName = this.getSelectedVersion()) {
    return path.resolve(this.storage, `${versionName}.jar`)
  }

}
