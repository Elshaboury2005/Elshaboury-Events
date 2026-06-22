@echo off
echo Setting up database...
mysql -u root -p event_registration_db < database\init.sql
pause





