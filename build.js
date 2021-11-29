const fs = require('fs-extra');
const execSync = require('child_process').execSync;

const distDir = 'dist';
const filesToCopy = [ 'index.js', 'spotipack_config.yaml', 'run.cmd' ];

try {
    let version = fs.readJsonSync('package.json').version;
    fs.emptyDirSync(distDir);
    fs.copySync('bins/node_win', `${distDir}/node`);
    filesToCopy.map(copyFile);
    execSync(`cp -R node_modules ${distDir}/node_modules`);
    execSync(`zip -r ${version}.zip dist`);
} catch (err) {
    console.error(err);
}

function copyFile(file) {
    fs.copySync(file, `${distDir}/${file}`);
}