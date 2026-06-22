@echo off
echo ========================================
echo Creating all database tables...
echo ========================================
echo.
echo Please enter your MySQL root password when prompted.
echo.
mysql -u root -p event_registration_db < create-all-tables.sql
echo.
echo ========================================
echo Done! Check the output above for any errors.
echo ========================================
pause




