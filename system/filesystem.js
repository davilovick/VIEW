
var fs = require('fs');

var homePath = process.env.HOME + '/Desktop/view';
var tmpViewPath = "/tmp/ViewTL";


var dbPath = homePath + '/db';
var tlPath = homePath + '/tl';
var tmpPath = homePath + '/tmp';
var timelapseIndexFile = tlPath + '/index.txt';

VerifyFolder(homePath);
VerifyFolder(dbPath);
VerifyFolder(tlPath);
VerifyFolder(tmpPath);
VerifyFolder(tmpViewPath);
VerifyFile(timelapseIndexFile, 1);

function VerifyFolder(folderPath)
{
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
    }
}

function VerifyFile(filePath, initContent)
{
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, initContent);
    }
}

exports.homePath = homePath;
exports.dbPath = dbPath;
exports.timelapsePath = tlPath;
exports.tmpPath = tmpPath;
exports.tmpViewPath = tmpViewPath;
exports.timelapseIndexFile = timelapseIndexFile;