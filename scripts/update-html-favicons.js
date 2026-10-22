const fs = require('fs');
const path = require('path');

const files = [
    'dashboard-layout.html',
    'index.html',
    'login.html',
    'property-detail.html',
    'catalog.html'
];

const targetPattern = /<link rel="icon" type="image\/png" href="favicon\.png">\s*<link rel="shortcut icon" href="favicon\.ico">\s*<link rel="apple-touch-icon" href="favicon\.png">/i;

const replacement = `<link rel="icon" type="image/svg+xml" href="favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png">
    <link rel="icon" type="image/png" href="favicon.png">
    <link rel="shortcut icon" href="favicon.ico">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">`;

for (const file of files) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    if (targetPattern.test(content)) {
        content = content.replace(targetPattern, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated favicon tags in ${file}`);
    } else {
        console.warn(`⚠️ Target pattern not found in ${file}`);
    }
}
