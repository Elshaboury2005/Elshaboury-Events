const pool = require('./config/database');
const fs = require('fs');

async function inspectSchema() {
    try {
        const [rows] = await pool.execute('DESCRIBE events');
        const schema = rows.map(row => `- ${row.Field} (${row.Type})`).join('\n');
        fs.writeFileSync('schema_dump.txt', schema);
        console.log('Schema dumped to schema_dump.txt');
        process.exit(0);
    } catch (error) {
        console.error('Error inspecting schema:', error);
        process.exit(1);
    }
}

inspectSchema();
