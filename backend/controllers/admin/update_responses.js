const fs = require('fs');
const path = 'd:/EVENTS/backend/controllers/admin/adminController.js';
let content = fs.readFileSync(path, 'utf8');

let count = 0;

// regex to find res.json({ ... }) or res.status(...).json({ ... })
const regex = /(res\.(?:status\([^)]+\)\.)?json\s*\()(\{[\s\S]*?\})\s*(\);?)/g;

let newContent = content.replace(regex, (match, prefix, objStr, suffix) => {
    // Check if it's success: false
    if (/success\s*:\s*false/.test(objStr)) {
        count++;
        // Replace ONLY the first level 'message:' key with 'error:'
        // Since we know the format is usually { success: false, message: '...' }
        const replaced = objStr.replace(/message\s*:/, 'error:');
        return prefix + replaced + suffix;
    } 
    // Check if it's success: true
    else if (/success\s*:\s*true/.test(objStr)) {
        count++;
        
        // Extract the content inside { }
        const innerMatch = objStr.match(/^\{\s*([\s\S]*)\s*\}$/);
        if (!innerMatch) return match;
        
        let inner = innerMatch[1];
        
        // Remove 'success: true,' or 'success: true'
        // Handle it appearing anywhere, but usually it's at the start
        inner = inner.replace(/success\s*:\s*true\s*,?/, '');
        // Also handle if there's a trailing comma left over
        inner = inner.replace(/,\s*$/, '');
        inner = inner.trim();
        
        if (inner.length > 0) {
            // Need to wrap the remaining in data: { ... }
            // Some objects might span multiple lines
            const dataStr = `data: { ${inner} }`;
            return prefix + `{ success: true, ${dataStr} }` + suffix;
        } else {
            return prefix + `{ success: true }` + suffix;
        }
    }
    
    return match;
});

fs.writeFileSync(path, newContent);
console.log('Changed ' + count + ' res.json() calls.');
