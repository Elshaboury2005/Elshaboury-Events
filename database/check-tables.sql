-- Check which tables exist
USE event_registration_db;

SHOW TABLES;

-- Check if favorites table exists
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'favorites table EXISTS'
        ELSE 'favorites table DOES NOT EXIST'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'event_registration_db' 
AND table_name = 'favorites';




