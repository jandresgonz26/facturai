const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
        } else {
            if (Object.prototype.toString.call(file) === "[object String]" && file.includes('OsoPCGaming')) {
                results.push({
                    path: fullPath,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }
    });
    return results;
}

const conflictFiles = walkDir('./src');
console.log(JSON.stringify(conflictFiles, null, 2));
