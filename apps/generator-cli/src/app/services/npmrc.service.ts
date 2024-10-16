import { Injectable } from "@nestjs/common";
import path from "path";
import * as os from 'os';
import * as fs from 'fs-extra';

class BaseUrl {

    constructor(public protocol: string, public hostname: string, public port: string) {
    }

    static fromUrl(url: string): BaseUrl | null {
        try {
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol;
            const hostname = parsedUrl.hostname;
            const port = parsedUrl.port || (protocol === 'https:' ? '443' : '80');
            return new BaseUrl(protocol, hostname, port);
        } catch (error) {
            console.debug('Error parsing URL:', error);
            return null;
        }
    }

    public equals(other: BaseUrl): boolean {
        return this.protocol === other.protocol && this.hostname === other.hostname && this.port === other.port;
    }
}

@Injectable()
export class NpmrcService {

    private _npmrc: string | null | undefined;
    private get npmrc(): string | null {
        if (this._npmrc === undefined) {
            this._npmrc = this.readNpmrc();
        }
        return this._npmrc;
    }

    public getStrictSsl(): boolean {
        for (const line of this.npmrcLines) {
            const [key, value] = line.split('=');
            if (key.trim() === 'strict-ssl') {
                return !(value.trim() === 'false');
            }
        }
        return true;
    }

    public getAuthToken(url: string): string | null {
        const baseUrl = BaseUrl.fromUrl(url);

        if (baseUrl === null) {
            return null;
        }

        for (const line of this.npmrcLines) {
            // Skip comment lines
            if (line.trim().startsWith('#')) {
                continue;
            }
            const [key, value] = line.split('=');
            // Only process lines referring to _authToken (syntax //host/:)
            if (!key.trim().endsWith('/:_authToken')) {
                continue;
            }
            // in some cases, maven repository and npm repository are handled by the same server
            // and the auth token can be reused on both
            // so we need to check if the baseurl matches the key
            let currentUrl = key.trim().replace(/\/:_authToken$/, '');
            if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
                currentUrl = `https:${currentUrl}`;
            }
            if (baseUrl.equals(BaseUrl.fromUrl(currentUrl))) {
                return value.trim();
            }
        }
        return null;
    }

    /** for testing purposes */
    public clear() {
        this._npmrc = undefined;
    }

    private get npmrcLines(): string[] {
        const rawLines = this.npmrc ? this.npmrc.split('\n') : [];
        return rawLines.filter(line => !line.trim().startsWith('#'));
    }

    private readNpmrc(): string | null {
        try {
            // Check for .npmrc in the current directory
            const currentDirNpmrcPath = path.resolve(process.cwd(), '.npmrc');
            if (fs.existsSync(currentDirNpmrcPath)) {
                return fs.readFileSync(currentDirNpmrcPath, 'utf-8');
            }

            // Fallback to .npmrc in the user's home directory
            const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
            const homeDirNpmrcPath = path.resolve(homeDir, '.npmrc');
            if (fs.existsSync(homeDirNpmrcPath)) {
                return fs.readFileSync(homeDirNpmrcPath, 'utf-8');
            }

            return null;
        } catch (error) {
          console.error('Error reading .npmrc file:', error);
          return null;
        }
    }
}