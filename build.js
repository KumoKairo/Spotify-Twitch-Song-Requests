const isWin = process.platform === 'win32';
const zipCommand = isWin ? '7z a -tzip' : 'zip -r';

const fs = require('fs-extra');
const execSync = require('child_process').execSync;

const distDir = 'dist';
const filesToCopy = [   'index.js', 
                        'twitchcontroller.js',
                        'spotipack_config.yaml',
                        'package.json', 
                        'run.cmd' ];

try {
    let version = fs.readJsonSync('package.json').version;
    fs.emptyDirSync(distDir);
    fs.copySync('bins/node_win', `${distDir}/node`);
    fs.copySync('node_modules', `${distDir}/node_modules`);
    filesToCopy.map(copyFile);
    execSync(`${zipCommand} ${version}.zip dist`);
} catch (err) {
    console.error(err);
}

function copyFile(file) {
    fs.copySync(file, `${distDir}/${file}`);
}