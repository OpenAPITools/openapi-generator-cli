import path from 'path';

export const isWin = () => process.platform === 'win32';

/**
 * If JAVA_HOME is set, it returns `$JAVA_HOME/bin/java`
 * otherwise it returns `java` and it has to be in the `PATH`
 */
export const javaCmd: string = process.env['JAVA_HOME']
  ? isWin()
    ? `"${path.join(process.env['JAVA_HOME'], 'bin', 'java')}"`
    : `${path.join(process.env['JAVA_HOME'], 'bin', 'java')}`
  : 'java';
