const fs = require('fs');
const path = require('path');

const replacements = [
  { src: "src/app/clients/page-OsoPCGaming.tsx", dest: "src/app/clients/page.tsx" },
  { src: "src/app/globals-OsoPCGaming.css", dest: "src/app/globals.css" },
  { src: "src/app/invoices/page-OsoPCGaming-2.tsx", dest: "src/app/invoices/page.tsx" },
  { src: "src/app/layout-OsoPCGaming.tsx", dest: "src/app/layout.tsx" },
  { src: "src/app/month-end/page-OsoPCGaming.tsx", dest: "src/app/month-end/page.tsx" },
  { src: "src/app/page-OsoPCGaming.tsx", dest: "src/app/page.tsx" },
  { src: "src/components/features/Feed-OsoPCGaming.tsx", dest: "src/components/features/Feed.tsx" },
  { src: "src/components/features/QuickEntry-OsoPCGaming.tsx", dest: "src/components/features/QuickEntry.tsx" },
  { src: "src/lib/invoice-generator-OsoPCGaming.ts", dest: "src/lib/invoice-generator.ts" },
  { src: "src/types/index-OsoPCGaming.ts", dest: "src/types/index.ts" }
];

// Verify all source files exist
for (const item of replacements) {
    if (!fs.existsSync(item.src)) {
        console.error("Missing:", item.src);
        process.exit(1);
    }
}

// Copy source back to target
console.log("Starting restoration...");
for (const item of replacements) {
    fs.copyFileSync(item.src, item.dest);
    console.log(`Restored: ${item.dest}`);
}

// Optionally, delete the OsoPCGaming files
console.log("\nCleaning up OneDrive conflict files...");
function cleanDir(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            cleanDir(fullPath);
        } else {
            if (file.includes('OsoPCGaming')) {
                fs.unlinkSync(fullPath);
                console.log(`Deleted: ${fullPath}`);
            }
        }
    });
}
cleanDir('./src');
console.log("\nDone!");
