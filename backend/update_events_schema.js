const pool = require('./config/database');

async function updateSchema() {
    try {
        console.log('Starting schema migration...');

        const alterQuery = `
      ALTER TABLE events
      ADD COLUMN venue_address VARCHAR(255) NULL,
      ADD COLUMN event_type VARCHAR(50) NULL,
      ADD COLUMN host_name VARCHAR(255) NULL,
      ADD COLUMN host_email VARCHAR(255) NULL,
      ADD COLUMN host_phone VARCHAR(50) NULL,
      ADD COLUMN host_organization VARCHAR(255) NULL,
      ADD COLUMN oc_name VARCHAR(255) NULL,
      ADD COLUMN oc_email VARCHAR(255) NULL,
      ADD COLUMN oc_phone VARCHAR(50) NULL,
      ADD COLUMN primary_sponsor VARCHAR(255) NULL,
      ADD COLUMN sponsor_packages TEXT NULL,
      ADD COLUMN sponsor_contact VARCHAR(255) NULL,
      ADD COLUMN lead_speaker VARCHAR(255) NULL,
      ADD COLUMN speaker_topic VARCHAR(255) NULL,
      ADD COLUMN speaker_bio TEXT NULL,
      ADD COLUMN price_standard DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN price_special DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN price_vip DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN pricing_notes TEXT NULL,
      ADD COLUMN logistics TEXT NULL
    `;

        await pool.execute(alterQuery);
        console.log('✅ Schema updated successfully!');
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('⚠️ Columns already exist. Skipping migration.');
            process.exit(0);
        }
        console.error('❌ Error updating schema:', error);
        process.exit(1);
    }
}

updateSchema();
